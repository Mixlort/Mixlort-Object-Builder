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

import { basename, dirname, join } from 'path'
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
  MergeProjectResult
} from '../../shared/project-state'
import { createProjectState, applyProjectVersionDefaults } from '../../shared/project-state'
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
    loadedFileName: ''
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

  // Read main client files
  const datBuffer = await readBinaryFile(params.datFilePath)
  const sprBuffer = await readBinaryFile(params.sprFilePath)

  // Try to find and read .otfi file alongside DAT
  let otfiContent: string | null = null
  const datDir = dirname(params.datFilePath)
  const datBaseName = basename(params.datFilePath, '.dat')
  const otfiPath = join(datDir, `${datBaseName}.otfi`)
  if (await fileExists(otfiPath)) {
    otfiContent = await readTextFile(otfiPath)
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

  // Apply features with version defaults
  const features = { ...params.features }
  applyProjectVersionDefaults(features, params.versionValue)

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
    loadedFileName: basename(params.datFilePath)
  }

  // Watch DAT and SPR files for external changes
  watchFile(params.datFilePath, () => {
    // File changed externally - will be handled by renderer via IPC
  })
  watchFile(params.sprFilePath, () => {
    // File changed externally
  })

  // Save recovery metadata (detected on next startup if app crashes)
  saveRecoveryData({
    datFilePath: params.datFilePath,
    sprFilePath: params.sprFilePath,
    versionValue: params.versionValue,
    serverItemsPath: params.serverItemsPath ?? null,
    features,
    timestamp: Date.now()
  })

  return { datBuffer, sprBuffer, otbBuffer, xmlContent, otfiContent }
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
): Promise<{ datFile: string | null; sprFile: string | null; otfiFile: string | null }> {
  const datFiles = await listFiles(directoryPath, ['dat'])
  const sprFiles = await listFiles(directoryPath, ['spr'])
  const otfiFiles = await listFiles(directoryPath, ['otfi'])

  return {
    datFile: datFiles[0] ?? null,
    sprFile: sprFiles[0] ?? null,
    otfiFile: otfiFiles[0] ?? null
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
