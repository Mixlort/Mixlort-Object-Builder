/**
 * Shared project state types used by both main and renderer processes.
 * These types are fully serializable (primitives only) for IPC transport.
 *
 * Ported from legacy ObjectBuilderWorker state (_datFile, _sprFile, _version,
 * _features, _things.loaded, etc.) and ObjectBuilder.mxml project management.
 */

// ---------------------------------------------------------------------------
// Feature flags (serializable mirror of renderer's ClientFeatures)
// ---------------------------------------------------------------------------

export interface ProjectFeatures {
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean
  metadataController: string
  attributeServer: string | null
}

export interface BufferSpriteSourceDescriptor {
  kind: 'buffer'
  signature: number
  spriteCount: number
  extended: boolean
}

export interface FileBackedPxgSpriteSourceDescriptor {
  kind: 'file-backed-pxg'
  signature: number
  spriteCount: number
  extended: boolean
  sprFilePath: string
  sprxFilePath: string
  baseSpriteCount: number
  extraSpriteCount: number
  baseAddressTableOffset: number
  extraAddressTableOffset: number
}

export type SpriteSourceDescriptor =
  | BufferSpriteSourceDescriptor
  | FileBackedPxgSpriteSourceDescriptor

export function createProjectFeatures(
  extended = false,
  transparency = false,
  improvedAnimations = false,
  frameGroups = false,
  metadataController = 'default',
  attributeServer: string | null = null
): ProjectFeatures {
  return {
    extended,
    transparency,
    improvedAnimations,
    frameGroups,
    metadataController,
    attributeServer
  }
}

/**
 * Applies version-based defaults (same logic as renderer's applyVersionDefaults).
 * v960+: extended; v1050+: improvedAnimations; v1057+: frameGroups.
 */
export function applyProjectVersionDefaults(features: ProjectFeatures, versionValue: number): void {
  if (versionValue >= 960) features.extended = true
  if (versionValue >= 1050) features.improvedAnimations = true
  if (versionValue >= 1057) features.frameGroups = true
}

// ---------------------------------------------------------------------------
// Project state
// ---------------------------------------------------------------------------

export interface ProjectState {
  /** Whether a project is currently loaded */
  loaded: boolean

  /** Path to the loaded DAT file */
  datFilePath: string | null
  /** Path to the loaded SPR file */
  sprFilePath: string | null
  /** Path to the server items directory/file (optional) */
  serverItemsPath: string | null

  /** Client version number (e.g. 1056 for 10.56) */
  versionValue: number
  /** DAT file signature */
  datSignature: number
  /** SPR file signature */
  sprSignature: number

  /** Feature flags for the loaded client */
  features: ProjectFeatures

  /** True if the project was created new (not loaded from files) */
  isTemporary: boolean
  /** True if there are unsaved changes */
  changed: boolean

  /** Name of the loaded file for display purposes */
  loadedFileName: string

  /** Current sprite source descriptor. File-backed PXG avoids loading huge SPR files in memory. */
  spriteSource: SpriteSourceDescriptor | null
  /** True when PXG runtime sidecar files are active. */
  pxgCompatibility: boolean
  /** True when the loaded project must not be compiled back to DAT/SPR. */
  readOnly: boolean
  /** Runtime metadata file path when PXG compatibility is active. */
  pxgRuntimeMetadataPath: string | null
}

export function createProjectState(): ProjectState {
  return {
    loaded: false,
    datFilePath: null,
    sprFilePath: null,
    serverItemsPath: null,
    versionValue: 0,
    datSignature: 0,
    sprSignature: 0,
    features: createProjectFeatures(),
    isTemporary: false,
    changed: false,
    loadedFileName: '',
    spriteSource: null,
    pxgCompatibility: false,
    readOnly: false,
    pxgRuntimeMetadataPath: null
  }
}

// ---------------------------------------------------------------------------
// Project operation params (serializable for IPC)
// ---------------------------------------------------------------------------

/** Parameters for creating a new project */
export interface CreateProjectParams {
  datSignature: number
  sprSignature: number
  versionValue: number
  features: ProjectFeatures
}

/** Parameters for loading an existing project */
export interface LoadProjectParams {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  datSignature: number
  sprSignature: number
  features: ProjectFeatures
  serverItemsPath?: string | null
}

/** Parameters for compiling (saving) a project */
export interface CompileProjectParams {
  datFilePath: string
  sprFilePath: string
  datBuffer: ArrayBuffer
  sprBuffer: ArrayBuffer
  versionValue: number
  datSignature: number
  sprSignature: number
  features: ProjectFeatures
  serverItemsPath?: string | null
  otbBuffer?: ArrayBuffer | null
  xmlContent?: string | null
  otfiContent?: string | null
}

/** Parameters for merging another project's files */
export interface MergeProjectParams {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  datSignature: number
  sprSignature: number
  features: ProjectFeatures
}

// ---------------------------------------------------------------------------
// Project operation results
// ---------------------------------------------------------------------------

/** Result of loading a project's files from disk */
export interface LoadProjectResult {
  datBuffer: ArrayBuffer
  sprBuffer: ArrayBuffer | null
  spriteSource: SpriteSourceDescriptor
  otbBuffer: ArrayBuffer | null
  xmlContent: string | null
  otfiContent: string | null
  pxgRuntimeMetadataBuffer: ArrayBuffer | null
  pxgRuntimeFlagsBuffer: ArrayBuffer | null
  pxgRuntimeMetadataPath: string | null
  pxgRuntimeFlagsPath: string | null
}

/** Result of loading merge files from disk */
export interface MergeProjectResult {
  datBuffer: ArrayBuffer
  sprBuffer: ArrayBuffer
}

export interface ReadProjectSpritesResult {
  entries: Array<[number, Uint8Array]>
}
