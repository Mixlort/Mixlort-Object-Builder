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
import { open as openFile, rename, unlink, readFile, copyFile } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
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
  ProjectSprWritePlan,
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
import { writeLog } from './logger-service'

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

const SPR_HEADER_U16 = 6
const SPR_HEADER_U32 = 8
const SPR_ADDRESS_SIZE = 4
const SPR_BLOCK_HEADER_SIZE = 5
const MAX_COMPRESSED_SPRITE_SIZE = 0xffff
const MAX_SPR_FILE_SIZE = 0xffffffff
const SPR_RGB_HEADER = Buffer.from([0xff, 0x00, 0xff])
// Buffered SPR write: flush the output in large chunks instead of one syscall
// per sprite (a 700k+ sprite file otherwise takes minutes of tiny writes).
const SPR_WRITE_CHUNK = 1 << 22 // 4 MB

type PlanOverride =
  | { kind: 'bytes'; data: Uint8Array }
  | { kind: 'packed'; bytes: Uint8Array; offset: number; length: number }

function getSprHeaderSize(extended: boolean): number {
  return extended ? SPR_HEADER_U32 : SPR_HEADER_U16
}

function validateSpriteCountFitsFormat(spriteCount: number, extended: boolean): void {
  if (!Number.isSafeInteger(spriteCount) || spriteCount < 0) {
    throw new Error(`Invalid SPR sprite count: ${spriteCount}.`)
  }
  if (!extended && spriteCount > 0xfffe) {
    throw new Error(
      `SPR has ${spriteCount} sprites, but the classic non-extended format supports at most 65534. Enable extended sprites before saving.`
    )
  }
}

function validateSprFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size > MAX_SPR_FILE_SIZE) {
    throw new Error(`SPR file is too large: ${size} bytes exceeds uint32 offsets.`)
  }
}

interface SourceSprBytes {
  bytes: Buffer
  spriteCount: number
  headerSize: number
}

/**
 * Reads the source SPR fully into memory once. All per-sprite lookups then hit
 * the in-memory buffer (no per-sprite disk syscalls). For a 700k-sprite / 660MB
 * file this is a single large read instead of millions of tiny positional reads.
 */
async function loadSourceSpr(sourceFilePath: string, extended: boolean): Promise<SourceSprBytes> {
  const bytes = await readFile(sourceFilePath)
  const headerSize = getSprHeaderSize(extended)
  if (bytes.length < headerSize) {
    throw new Error(`SPR file is truncated: ${sourceFilePath}`)
  }
  const spriteCount = extended ? bytes.readUInt32LE(4) : bytes.readUInt16LE(4)
  const addressTableEnd = headerSize + spriteCount * SPR_ADDRESS_SIZE
  if (addressTableEnd > bytes.length) {
    throw new Error(`SPR address table is truncated: ${sourceFilePath}`)
  }
  return { bytes, spriteCount, headerSize }
}

/** Reads only the SPR header (signature + sprite count), no sprite data. */
async function readSprHeaderInfo(
  filePath: string,
  extended: boolean
): Promise<{ signature: number; spriteCount: number }> {
  const headerSize = getSprHeaderSize(extended)
  const handle = await openFile(filePath, 'r')
  try {
    const buffer = Buffer.alloc(headerSize)
    const { bytesRead } = await handle.read(buffer, 0, headerSize, 0)
    if (bytesRead < headerSize) {
      throw new Error(`SPR file is truncated: ${filePath}`)
    }
    return {
      signature: buffer.readUInt32LE(0),
      spriteCount: extended ? buffer.readUInt32LE(4) : buffer.readUInt16LE(4)
    }
  } finally {
    await handle.close()
  }
}

function sourceSpriteAddress(source: SourceSprBytes, id: number): number {
  if (id < 1 || id > source.spriteCount) return 0
  const address = source.bytes.readUInt32LE(source.headerSize + (id - 1) * SPR_ADDRESS_SIZE)
  if (address === 0) return 0
  if (address + SPR_BLOCK_HEADER_SIZE > source.bytes.length) {
    throw new Error(`SPR sprite ${id} points outside the source file.`)
  }
  return address
}

function sourceSpriteLength(source: SourceSprBytes, id: number): number {
  const address = sourceSpriteAddress(source, id)
  if (address === 0) return 0
  const length = source.bytes.readUInt16LE(address + 3)
  if (address + SPR_BLOCK_HEADER_SIZE + length > source.bytes.length) {
    throw new Error(`SPR sprite ${id} data is truncated.`)
  }
  return length
}

function collectPlanOverrides(
  plan: ProjectSprWritePlan,
  packedBytes?: Uint8Array
): Map<number, PlanOverride> {
  const overrides = new Map<number, PlanOverride>()

  for (const [id, data] of plan.overrides) {
    overrides.set(id, { kind: 'bytes', data })
  }

  const bytes = packedBytes ?? (plan.overrideData ? new Uint8Array(plan.overrideData) : null)
  if (bytes && plan.overrideIndex) {
    for (const [id, offset, length] of plan.overrideIndex) {
      if (
        !Number.isSafeInteger(id) ||
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        id < 1 ||
        offset < 0 ||
        length < 0 ||
        offset + length > bytes.byteLength
      ) {
        throw new Error(`Invalid packed SPR override entry for sprite ${id}.`)
      }
      overrides.set(id, { kind: 'packed', bytes, offset, length })
    }
  }

  return overrides
}

function getPlanOverrideLength(override: PlanOverride | undefined): number {
  if (!override) return 0
  return override.kind === 'bytes' ? override.data.length : override.length
}

function getPlanOverrideData(override: PlanOverride | undefined): Uint8Array | undefined {
  if (!override) return undefined
  if (override.kind === 'bytes') return override.data
  return override.bytes.subarray(override.offset, override.offset + override.length)
}

async function writeSprFromPlanAtomic(
  targetFilePath: string,
  plan: ProjectSprWritePlan,
  sourceExtended: boolean
): Promise<SpriteSourceDescriptor> {
  const startedAt = Date.now()
  validateSpriteCountFitsFormat(plan.spriteCount, plan.extended)
  const count = plan.spriteCount
  const headerSize = getSprHeaderSize(plan.extended)
  // Large plans stream their packed overrides to a temp file (see preload) to
  // avoid cloning ~1GB across the contextBridge. Read it into memory, then delete.
  let overrideFileBytes: Buffer | null = null
  if (plan.overrideFilePath) {
    overrideFileBytes = await readFile(plan.overrideFilePath)
    await unlink(plan.overrideFilePath).catch(() => {})
  }
  const overrides = collectPlanOverrides(plan, overrideFileBytes ?? undefined)
  const deletedIds = new Set(plan.deletedIds)

  const hasSource = !!plan.sourceFilePath && (await fileExists(plan.sourceFilePath))

  const descriptor: SpriteSourceDescriptor = {
    kind: 'buffer',
    signature: plan.signature,
    spriteCount: count,
    extended: plan.extended
  }

  // Fast path: nothing sprite-related changed and the format/signature/count
  // match -> copy the source verbatim (or no-op when saving in place). Reads only
  // the source header (8 bytes), never the whole file.
  if (
    hasSource &&
    overrides.size === 0 &&
    deletedIds.size === 0 &&
    sourceExtended === plan.extended
  ) {
    const info = await readSprHeaderInfo(plan.sourceFilePath as string, sourceExtended)
    if (info.spriteCount === count && info.signature === plan.signature) {
      if (plan.sourceFilePath !== targetFilePath) {
        await copyFile(plan.sourceFilePath as string, targetFilePath)
      }
      writeLog('info', `SPR save (copy): ${count} sprites in ${Date.now() - startedAt}ms`)
      return descriptor
    }
  }

  // Rewrite path: load the source fully into memory once (only when needed).
  const source = hasSource
    ? await loadSourceSpr(plan.sourceFilePath as string, sourceExtended)
    : null

  // Pass 1: compute the output layout. Source lookups are in-memory (sync).
  const addresses = new Uint32Array(count)
  const lengths = new Uint32Array(count + 1)
  let totalSize = headerSize + count * SPR_ADDRESS_SIZE
  validateSprFileSize(totalSize)

  for (let id = 1; id <= count; id++) {
    if (deletedIds.has(id)) continue

    let length = 0
    if (overrides.has(id)) {
      length = getPlanOverrideLength(overrides.get(id))
      if (length > MAX_COMPRESSED_SPRITE_SIZE) {
        throw new Error(
          `SPR sprite ${id} is too large: ${length} bytes exceeds ${MAX_COMPRESSED_SPRITE_SIZE}.`
        )
      }
    } else if (source) {
      length = sourceSpriteLength(source, id)
    }

    if (length > 0) {
      addresses[id - 1] = totalSize
      lengths[id] = length
      totalSize += SPR_BLOCK_HEADER_SIZE + length
      validateSprFileSize(totalSize)
    }
  }

  // Pass 2: write to a temp file with a large buffered writer (one flush per
  // SPR_WRITE_CHUNK, not two syscalls per sprite), then atomically rename.
  const tempPath = `${targetFilePath}.${process.pid}.${Date.now()}.tmp`
  let output: FileHandle | null = null
  try {
    output = await openFile(tempPath, 'w')

    const header = Buffer.alloc(headerSize + count * SPR_ADDRESS_SIZE)
    header.writeUInt32LE(plan.signature, 0)
    if (plan.extended) {
      header.writeUInt32LE(count, 4)
    } else {
      header.writeUInt16LE(count, 4)
    }
    for (let i = 0; i < count; i++) {
      header.writeUInt32LE(addresses[i], headerSize + i * SPR_ADDRESS_SIZE)
    }
    await output.write(header, 0, header.length)

    const chunk = Buffer.allocUnsafe(SPR_WRITE_CHUNK)
    let used = 0
    const flush = async (): Promise<void> => {
      if (used > 0) {
        await output!.write(chunk, 0, used)
        used = 0
      }
    }

    const blockHeader = Buffer.alloc(SPR_BLOCK_HEADER_SIZE)
    SPR_RGB_HEADER.copy(blockHeader, 0)

    for (let id = 1; id <= count; id++) {
      if (addresses[id - 1] === 0 || lengths[id] === 0) continue
      const length = lengths[id]

      // One block is 5 + (<=0xffff) bytes, so it always fits after a flush.
      if (used + SPR_BLOCK_HEADER_SIZE + length > chunk.length) {
        await flush()
      }

      blockHeader.writeUInt16LE(length, 3)
      blockHeader.copy(chunk, used)
      used += SPR_BLOCK_HEADER_SIZE

      if (overrides.has(id)) {
        const data = getPlanOverrideData(overrides.get(id))
        if (!data) continue
        chunk.set(data.subarray(0, length), used)
      } else {
        const address = sourceSpriteAddress(source as SourceSprBytes, id)
        const dataStart = address + SPR_BLOCK_HEADER_SIZE
        ;(source as SourceSprBytes).bytes.copy(chunk, used, dataStart, dataStart + length)
      }
      used += length
    }

    await flush()
    await output.sync()
    await output.close()
    output = null
    await rename(tempPath, targetFilePath)
  } catch (error) {
    if (output) {
      await output.close().catch(() => {})
    }
    await unlink(tempPath).catch(() => {})
    throw error
  }

  writeLog(
    'info',
    `SPR save (rewrite): ${count} sprites, ${(totalSize / 1048576).toFixed(1)}MB, ${overrides.size} overrides in ${Date.now() - startedAt}ms`
  )
  return descriptor
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
    const compileStart = Date.now()
    const targetSprExtended = params.features.extended || params.versionValue >= 960
    const sourceSprExtended = state.features.extended || state.versionValue >= 960
    let nextSpriteSource: SpriteSourceDescriptor
    writeLog(
      'info',
      `Compile start: dat=${(params.datBuffer.byteLength / 1048576).toFixed(1)}MB, sprMode=${params.sprWritePlan ? 'plan' : 'buffer'}`
    )

    // Write DAT file
    const datStart = Date.now()
    await writeBinaryFile(params.datFilePath, params.datBuffer)
    writeLog('info', `DAT written in ${Date.now() - datStart}ms`)

    // Write SPR file
    if (params.sprWritePlan) {
      nextSpriteSource = await writeSprFromPlanAtomic(
        params.sprFilePath,
        params.sprWritePlan,
        sourceSprExtended
      )
    } else if (params.sprBuffer) {
      await writeBinaryFile(params.sprFilePath, params.sprBuffer)
      nextSpriteSource = readSpriteHeader(params.sprBuffer, targetSprExtended)
    } else {
      throw new Error('Missing SPR data for compile operation.')
    }

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

    writeLog('info', `Compile total: ${Date.now() - compileStart}ms`)
    markCompileRecoveryCompleted()

    // Update state with new file paths
    state.datFilePath = params.datFilePath
    state.sprFilePath = params.sprFilePath
    state.serverItemsPath = params.serverItemsPath ?? state.serverItemsPath
    state.isTemporary = false
    state.changed = false
    state.loadedFileName = basename(params.datFilePath)
    state.spriteSource = nextSpriteSource
    state.pxgCompatibility = false
    state.readOnly = false
    state.pxgRuntimeMetadataPath = null

    // Keep features/version in sync with what was just written to disk, so a
    // subsequent in-place save parses the source SPR with the correct header
    // width (sourceSprExtended above is derived from these fields).
    state.versionValue = params.versionValue
    const compiledFeatures = { ...params.features }
    applyProjectVersionDefaults(compiledFeatures, params.versionValue)
    state.features = compiledFeatures

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
export async function discoverClientFiles(directoryPath: string): Promise<{
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
