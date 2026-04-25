/**
 * Project service for the Electron main process.
 * Orchestrates project lifecycle operations: create, load, compile, merge, unload.
 * Handles file I/O and manages project state. The actual binary parsing/serialization
 * of DAT/SPR/OTB formats is done by the renderer (or web worker in the future).
 *
 * Ported from legacy ObjectBuilderWorker callbacks:
 * - createNewFilesCallback -> createProject
 * - loadFilesCallback -> loadProject
 * - compileAsCallback -> compileProject
 * - mergeFilesCallback -> loadMergeFiles
 * - unloadFilesCallback -> unloadProject
 */

import { basename, dirname, join, extname } from 'path'
import {
  readBinaryFile,
  writeBinaryFile,
  readTextFile,
  writeTextFile,
  fileExists,
  findFileInDirectory,
  listFiles,
  watchFile,
  unwatchFile
} from './file-service'
import type {
  ProjectState,
  CreateProjectParams,
  LoadProjectParams,
  LoadProjectResult,
  CompileProjectParams,
  MergeProjectParams,
  MergeProjectResult,
  ReadProjectSpritesResult,
  SpriteSourceDescriptor
} from '../../shared/project-state'
import { createProjectState, applyProjectVersionDefaults } from '../../shared/project-state'
import { inspectSpriteSource, readSpritesFromSource } from './sprite-source-service'
import {
  saveRecoveryData,
  clearRecoveryData,
  backupFiles,
  beginCompileRecovery,
  markCompileRecoveryCompleted,
  clearCompileRecovery,
  restoreBackedUpFiles
} from './recovery-service'

// ---------------------------------------------------------------------------
// Project Service
// ---------------------------------------------------------------------------

let state: ProjectState = createProjectState()

function getFileBasePath(filePath: string): string {
  const ext = extname(filePath)
  return ext ? filePath.slice(0, -ext.length) : filePath
}

async function findRuntimeFile(datFilePath: string, fileName: string): Promise<string | null> {
  const datDir = dirname(datFilePath)
  const localPath = join(datDir, fileName)
  if (await fileExists(localPath)) return localPath

  const parentPath = join(dirname(datDir), fileName)
  if (await fileExists(parentPath)) return parentPath

  return null
}

function readSpriteHeader(buffer: ArrayBuffer, extended: boolean): SpriteSourceDescriptor {
  const view = new DataView(buffer)
  const signature = buffer.byteLength >= 4 ? view.getUint32(0, true) : 0
  const spriteCount =
    extended && buffer.byteLength >= 8
      ? view.getUint32(4, true)
      : buffer.byteLength >= 6
        ? view.getUint16(4, true)
        : 0

  return {
    kind: 'buffer',
    signature,
    spriteCount,
    extended
  }
}

/**
 * Returns the current project state (read-only snapshot).
 */
export function getProjectState(): Readonly<ProjectState> {
  return { ...state, features: { ...state.features } }
}

/**
 * Returns whether a project is currently loaded.
 */
export function isProjectLoaded(): boolean {
  return state.loaded
}

// ---------------------------------------------------------------------------
// Create Project
// ---------------------------------------------------------------------------

/**
 * Creates a new empty project.
 * Equivalent to legacy CreateNewFilesCommand -> createNewFilesCallback.
 *
 * Sets up project state with version/features. The renderer is responsible
 * for creating the initial empty ThingType/SpriteData collections.
 */
export function createProject(params: CreateProjectParams): ProjectState {
  // Unload any existing project first
  unloadProject()

  const features = { ...params.features }
  applyProjectVersionDefaults(features, params.versionValue)

  state = {
    loaded: true,
    datFilePath: null,
    sprFilePath: null,
    serverItemsPath: null,
    versionValue: params.versionValue,
    datSignature: params.datSignature,
    sprSignature: params.sprSignature,
    features,
    isTemporary: true,
    changed: false,
    loadedFileName: '',
    spriteSource: null,
    pxgCompatibility: false,
    readOnly: false,
    pxgRuntimeMetadataPath: null
  }

  return getProjectState()
}

// ---------------------------------------------------------------------------
// Load Project
// ---------------------------------------------------------------------------

/**
 * Loads project files from disk and returns raw buffers for parsing.
 * Equivalent to legacy LoadFilesCommand -> loadFilesCallback.
 *
 * Reads DAT, SPR, and optionally OTB + items.xml files. Also checks
 * for .otfi file alongside the DAT for feature overrides.
 * The renderer parses the returned buffers using the existing services.
 */
export async function loadProject(params: LoadProjectParams): Promise<LoadProjectResult> {
  // Unload any existing project first
  unloadProject()

  // Validate files exist
  if (!(await fileExists(params.datFilePath))) {
    throw new Error(`DAT file not found: ${params.datFilePath}`)
  }
  if (!(await fileExists(params.sprFilePath))) {
    throw new Error(`SPR file not found: ${params.sprFilePath}`)
  }

  // Try to find and read .otfi file alongside DAT
  let otfiContent: string | null = null
  const datDir = dirname(params.datFilePath)
  const datBaseName = basename(params.datFilePath, '.dat')
  const otfiPath = join(datDir, `${datBaseName}.otfi`)
  if (await fileExists(otfiPath)) {
    otfiContent = await readTextFile(otfiPath)
  }

  // Apply features with version defaults before reading the SPR header.
  const features = { ...params.features }
  applyProjectVersionDefaults(features, params.versionValue)
  const extended = features.extended || params.versionValue >= 960

  // Read DAT eagerly, but keep PXG SPR files file-backed to avoid multi-GB buffers.
  const datBuffer = await readBinaryFile(params.datFilePath)
  const sprxPath = `${getFileBasePath(params.sprFilePath)}.sprx`
  const pxgRuntimeMetadataPath = await findRuntimeFile(params.datFilePath, 'pxg.runtime.meta.bin')
  const pxgRuntimeFlagsPath = await findRuntimeFile(params.datFilePath, 'pxg.runtime.flags.bin')
  const pxgCompatibility = Boolean(pxgRuntimeMetadataPath && (await fileExists(sprxPath)))
  let sprBuffer: ArrayBuffer | null = null
  let spriteSource: SpriteSourceDescriptor
  let pxgRuntimeMetadataBuffer: ArrayBuffer | null = null
  let pxgRuntimeFlagsBuffer: ArrayBuffer | null = null

  if (pxgCompatibility) {
    spriteSource = await inspectSpriteSource({
      sprFilePath: params.sprFilePath,
      sprxFilePath: sprxPath,
      extended
    })
    pxgRuntimeMetadataBuffer = pxgRuntimeMetadataPath
      ? await readBinaryFile(pxgRuntimeMetadataPath)
      : null
    pxgRuntimeFlagsBuffer = pxgRuntimeFlagsPath ? await readBinaryFile(pxgRuntimeFlagsPath) : null
  } else {
    sprBuffer = await readBinaryFile(params.sprFilePath)
    spriteSource = readSpriteHeader(sprBuffer, extended)
  }

  // Read server items if path provided
  let otbBuffer: ArrayBuffer | null = null
  let xmlContent: string | null = null

  if (params.serverItemsPath) {
    // Find OTB file
    const otbPath = await findFileInDirectory(params.serverItemsPath, 'items.otb')
    if (otbPath) {
      otbBuffer = await readBinaryFile(otbPath)
    }

    // Find items.xml
    const xmlPath = await findFileInDirectory(params.serverItemsPath, 'items.xml')
    if (xmlPath) {
      xmlContent = await readTextFile(xmlPath, 'latin1')
    }
  }

  // Update project state
  state = {
    loaded: true,
    datFilePath: params.datFilePath,
    sprFilePath: params.sprFilePath,
    serverItemsPath: params.serverItemsPath ?? null,
    versionValue: params.versionValue,
    datSignature: params.datSignature,
    sprSignature: params.sprSignature,
    features,
    isTemporary: false,
    changed: false,
    loadedFileName: basename(params.datFilePath),
    spriteSource,
    pxgCompatibility,
    readOnly: pxgCompatibility,
    pxgRuntimeMetadataPath
  }

  // Watch DAT and SPR files for external changes
  watchFile(params.datFilePath, () => {
    // File changed externally - will be handled by renderer via IPC
  })
  watchFile(params.sprFilePath, () => {
    // File changed externally
  })
  if (pxgCompatibility) {
    watchFile(sprxPath, () => {})
    if (pxgRuntimeMetadataPath) watchFile(pxgRuntimeMetadataPath, () => {})
    if (pxgRuntimeFlagsPath) watchFile(pxgRuntimeFlagsPath, () => {})
  }

  // Save recovery metadata (detected on next startup if app crashes)
  saveRecoveryData({
    datFilePath: params.datFilePath,
    sprFilePath: params.sprFilePath,
    versionValue: params.versionValue,
    serverItemsPath: params.serverItemsPath ?? null,
    features,
    timestamp: Date.now()
  })

  return {
    datBuffer,
    sprBuffer,
    spriteSource,
    otbBuffer,
    xmlContent,
    otfiContent,
    pxgRuntimeMetadataBuffer,
    pxgRuntimeFlagsBuffer,
    pxgRuntimeMetadataPath,
    pxgRuntimeFlagsPath
  }
}

// ---------------------------------------------------------------------------
// Compile Project
// ---------------------------------------------------------------------------

/**
 * Compiles (saves) project files to disk.
 * Equivalent to legacy CompileAsCommand -> compileAsCallback.
 *
 * Accepts pre-serialized buffers from the renderer and writes them to disk.
 * Also saves the .otfi file alongside the DAT.
 */
export async function compileProject(params: CompileProjectParams): Promise<void> {
  if (!state.loaded) {
    throw new Error('No project loaded')
  }
  if (state.readOnly) {
    throw new Error('PXG compatibility projects are read-only and cannot be compiled to DAT/SPR.')
  }

  const datDir = dirname(params.datFilePath)
  const datBaseName = basename(params.datFilePath, '.dat')
  const otfiPath = join(datDir, `${datBaseName}.otfi`)

  // Backup existing files before overwriting
  const filesToBackup = [params.datFilePath, params.sprFilePath, otfiPath]
  if (params.serverItemsPath) {
    const otbPath = join(params.serverItemsPath, 'items.otb')
    const xmlPath = join(params.serverItemsPath, 'items.xml')
    filesToBackup.push(otbPath, xmlPath)
  }

  backupFiles(filesToBackup)
  beginCompileRecovery(filesToBackup)

  try {
    // Write DAT file
    await writeBinaryFile(params.datFilePath, params.datBuffer)

    // Write SPR file
    await writeBinaryFile(params.sprFilePath, params.sprBuffer)

    // Write server items if provided
    if (params.serverItemsPath) {
      if (params.otbBuffer) {
        const otbPath = join(params.serverItemsPath, 'items.otb')
        await writeBinaryFile(otbPath, params.otbBuffer)
      }

      if (params.xmlContent) {
        const xmlPath = join(params.serverItemsPath, 'items.xml')
        await writeTextFile(xmlPath, params.xmlContent, 'latin1')
      }
    }

    // Write .otfi file alongside DAT
    if (params.otfiContent) {
      await writeTextFile(otfiPath, params.otfiContent)
    }

    markCompileRecoveryCompleted()

    // Update state with new file paths
    state.datFilePath = params.datFilePath
    state.sprFilePath = params.sprFilePath
    state.serverItemsPath = params.serverItemsPath ?? state.serverItemsPath
    state.isTemporary = false
    state.changed = false
    state.loadedFileName = basename(params.datFilePath)
    state.spriteSource = readSpriteHeader(
      params.sprBuffer,
      params.features.extended || params.versionValue >= 960
    )
    state.pxgCompatibility = false
    state.readOnly = false
    state.pxgRuntimeMetadataPath = null

    // Update watchers for new paths
    if (state.datFilePath) {
      watchFile(state.datFilePath, () => {})
    }
    if (state.sprFilePath) {
      watchFile(state.sprFilePath, () => {})
    }

    // Update recovery metadata with new file paths
    saveRecoveryData({
      datFilePath: params.datFilePath,
      sprFilePath: params.sprFilePath,
      versionValue: params.versionValue,
      serverItemsPath: params.serverItemsPath ?? null,
      features: { ...params.features },
      timestamp: Date.now()
    })

    clearCompileRecovery()
  } catch (error) {
    restoreBackedUpFiles(filesToBackup)
    clearCompileRecovery()
    throw error
  }
}

// ---------------------------------------------------------------------------
// Merge Project
// ---------------------------------------------------------------------------

/**
 * Reads another set of client files for merging into the current project.
 * Equivalent to legacy MergeFilesCommand -> mergeFilesCallback.
 *
 * Returns raw buffers. The actual merging of ThingTypes and sprites
 * is done by the renderer.
 */
export async function loadMergeFiles(params: MergeProjectParams): Promise<MergeProjectResult> {
  if (!state.loaded) {
    throw new Error('No project loaded')
  }

  if (!(await fileExists(params.datFilePath))) {
    throw new Error(`Merge DAT file not found: ${params.datFilePath}`)
  }
  if (!(await fileExists(params.sprFilePath))) {
    throw new Error(`Merge SPR file not found: ${params.sprFilePath}`)
  }

  const datBuffer = await readBinaryFile(params.datFilePath)
  const sprBuffer = await readBinaryFile(params.sprFilePath)

  return { datBuffer, sprBuffer }
}

// ---------------------------------------------------------------------------
// Unload Project
// ---------------------------------------------------------------------------

/**
 * Unloads the current project and resets state.
 * Equivalent to legacy UnloadFilesCommand -> unloadFilesCallback.
 *
 * Stops file watchers and clears all state.
 */
export function unloadProject(): void {
  // Stop watching files
  if (state.datFilePath) {
    unwatchFile(state.datFilePath)
  }
  if (state.sprFilePath) {
    unwatchFile(state.sprFilePath)
  }

  // Clear recovery metadata (clean unload, no crash)
  clearRecoveryData()

  state = createProjectState()
}

// ---------------------------------------------------------------------------
// State mutations
// ---------------------------------------------------------------------------

/**
 * Marks the project as having unsaved changes.
 * Called by the renderer when things or sprites are modified.
 */
export function markProjectChanged(): void {
  if (state.loaded) {
    state.changed = true
  }
}

/**
 * Marks the project as saved (no unsaved changes).
 */
export function markProjectSaved(): void {
  if (state.loaded) {
    state.changed = false
  }
}

/**
 * Updates the server items path for the project.
 */
export function setServerItemsPath(path: string | null): void {
  if (state.loaded) {
    state.serverItemsPath = path
  }
}

/**
 * Updates the project features.
 */
export function updateProjectFeatures(features: Partial<ProjectState['features']>): void {
  if (state.loaded) {
    Object.assign(state.features, features)
  }
}

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

/**
 * Discovers client files (DAT, SPR, OTFI) in a directory.
 * Used when the user selects a client directory.
 * Equivalent to legacy ClientInfoLoader behavior.
 */
export async function discoverClientFiles(
  directoryPath: string
): Promise<{
  datFile: string | null
  sprFile: string | null
  sprxFile: string | null
  otfiFile: string | null
  pxgRuntimeMetadataFile: string | null
  pxgRuntimeFlagsFile: string | null
}> {
  const datFiles = await listFiles(directoryPath, ['dat'])
  const sprFiles = await listFiles(directoryPath, ['spr'])
  const sprxFiles = await listFiles(directoryPath, ['sprx'])
  const otfiFiles = await listFiles(directoryPath, ['otfi'])
  const datFile = datFiles[0] ?? null
  const sprFile = sprFiles[0] ?? null
  const siblingSprxFile = sprFile ? `${getFileBasePath(sprFile)}.sprx` : null
  const sprxFile =
    siblingSprxFile && (await fileExists(siblingSprxFile))
      ? siblingSprxFile
      : (sprxFiles[0] ?? null)

  return {
    datFile,
    sprFile,
    sprxFile,
    otfiFile: otfiFiles[0] ?? null,
    pxgRuntimeMetadataFile: datFile
      ? await findRuntimeFile(datFile, 'pxg.runtime.meta.bin')
      : await findFileInDirectory(directoryPath, 'pxg.runtime.meta.bin'),
    pxgRuntimeFlagsFile: datFile
      ? await findRuntimeFile(datFile, 'pxg.runtime.flags.bin')
      : await findFileInDirectory(directoryPath, 'pxg.runtime.flags.bin')
  }
}

export async function readProjectSprites(ids: number[]): Promise<ReadProjectSpritesResult> {
  if (!state.spriteSource || state.spriteSource.kind !== 'file-backed-pxg') {
    return { entries: [] }
  }

  return {
    entries: await readSpritesFromSource(state.spriteSource, ids)
  }
}

/**
 * Discovers server item files (OTB, XML) in a directory.
 */
export async function discoverServerItemFiles(
  directoryPath: string
): Promise<{ otbFile: string | null; xmlFile: string | null }> {
  const otbFile = await findFileInDirectory(directoryPath, 'items.otb')
  const xmlFile = await findFileInDirectory(directoryPath, 'items.xml')

  return { otbFile, xmlFile }
}

/**
 * Resets the project service state (for testing purposes).
 */
export function resetProjectService(): void {
  unloadProject()
}
