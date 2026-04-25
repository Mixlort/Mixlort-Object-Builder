/**
 * Project-level types: file formats, OBD versions, clipboard actions,
 * progress bar IDs, client info, sprite dimensions.
 * Ported from legacy AS3: otlib/utils/OTFormat.as, otlib/obd/OBDVersions.as,
 * ob/core/ClipboardAction.as, ob/commands/ProgressBarID.as,
 * otlib/utils/ClientInfo.as, otlib/core/SpriteDimension.as
 */

import type { ClientFeatures } from './version'

// ---------------------------------------------------------------------------
// OTFormat - File format extension constants
// ---------------------------------------------------------------------------

export const OTFormat = {
  OTBM: 'otbm',
  OTB: 'otb',
  OBD: 'obd',
  DAT: 'dat',
  SPR: 'spr',
  XML: 'xml',
  TOML: 'toml',
  LUA: 'lua',
  ASSETS: 'assets'
} as const

export type OTFormat = (typeof OTFormat)[keyof typeof OTFormat]

// ---------------------------------------------------------------------------
// OBDVersion - Object Builder Data format versions
// ---------------------------------------------------------------------------

export const OBDVersion = {
  VERSION_1: 100,
  VERSION_2: 200,
  VERSION_3: 300
} as const

export type OBDVersion = (typeof OBDVersion)[keyof typeof OBDVersion]

// ---------------------------------------------------------------------------
// ClipboardAction - Clipboard action types for copy/paste in ThingList
// ---------------------------------------------------------------------------

export const ClipboardAction = {
  OBJECT: 0,
  PATTERNS: 1,
  PROPERTIES: 2,
  ATTRIBUTES: 3
} as const

export type ClipboardAction = (typeof ClipboardAction)[keyof typeof ClipboardAction]

// ---------------------------------------------------------------------------
// ProgressBarID - Progress bar identifiers for async operations
// ---------------------------------------------------------------------------

export const ProgressBarID = {
  DEFAULT: 'default',
  METADATA: 'metadata',
  SPRITES: 'sprites',
  FIND: 'find',
  OPTIMIZE: 'optimize'
} as const

export type ProgressBarID = (typeof ProgressBarID)[keyof typeof ProgressBarID]

// ---------------------------------------------------------------------------
// SpriteDimension - Describes a sprite pixel size and data buffer size
// ---------------------------------------------------------------------------

export interface SpriteDimension {
  value: string
  size: number
  dataSize: number
}

export function createSpriteDimension(
  value = '32x32',
  size = 32,
  dataSize = 4096
): SpriteDimension {
  return { value, size, dataSize }
}

// ---------------------------------------------------------------------------
// ClientInfo - Runtime state of a loaded client (DAT + SPR + optional OTB)
// ---------------------------------------------------------------------------

export interface ClientInfo {
  clientVersion: number
  clientVersionStr: string
  datSignature: number
  sprSignature: number

  minItemId: number
  maxItemId: number
  minOutfitId: number
  maxOutfitId: number
  minEffectId: number
  maxEffectId: number
  minMissileId: number
  maxMissileId: number

  minSpriteId: number
  maxSpriteId: number

  features: ClientFeatures

  changed: boolean
  isTemporary: boolean
  loaded: boolean

  otbLoaded: boolean
  otbMajorVersion: number
  otbMinorVersion: number
  otbItemsCount: number

  spriteSize: number
  spriteDataSize: number

  loadedFileName: string

  pxgCompatibility: boolean
  readOnly: boolean
  pxgRuntimeMetadataPath: string | null
}

export function createClientInfo(): ClientInfo {
  return {
    clientVersion: 0,
    clientVersionStr: '',
    datSignature: 0,
    sprSignature: 0,

    minItemId: 0,
    maxItemId: 0,
    minOutfitId: 0,
    maxOutfitId: 0,
    minEffectId: 0,
    maxEffectId: 0,
    minMissileId: 0,
    maxMissileId: 0,

    minSpriteId: 0,
    maxSpriteId: 0,

    features: {
      extended: false,
      transparency: false,
      improvedAnimations: false,
      frameGroups: false,
      metadataController: 'default',
      attributeServer: null
    },

    changed: false,
    isTemporary: false,
    loaded: false,

    otbLoaded: false,
    otbMajorVersion: 0,
    otbMinorVersion: 0,
    otbItemsCount: 0,

    spriteSize: 32,
    spriteDataSize: 4096,

    loadedFileName: '',

    pxgCompatibility: false,
    readOnly: false,
    pxgRuntimeMetadataPath: null
  }
}

// ---------------------------------------------------------------------------
// Project operation parameter types
// ---------------------------------------------------------------------------

/** Parameters for creating a new project (File > New) */
export interface CreateProjectParams {
  datFile: string
  sprFile: string
  version: number
  features: ClientFeatures
}

/** Parameters for opening an existing project (File > Open) */
export interface OpenProjectParams {
  datFile: string
  sprFile: string
  version: number
  features: ClientFeatures
}

/** Parameters for compiling/saving a project (File > Compile / Compile As) */
export interface CompileProjectParams {
  datFile: string
  sprFile: string
  version: number
  features: ClientFeatures
}

/** Parameters for merging another DAT/SPR into the current project */
export interface MergeProjectParams {
  datFile: string
  sprFile: string
  version: number
  features: ClientFeatures
}

// ---------------------------------------------------------------------------
// Import / Export types
// ---------------------------------------------------------------------------

/** Supported image export formats */
export const ImageFormat = {
  PNG: 'png',
  BMP: 'bmp',
  JPG: 'jpg'
} as const

export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat]

/** Supported thing export formats (image formats + OBD) */
export type ThingExportFormat = ImageFormat | typeof OTFormat.OBD

/** Parameters for exporting things */
export interface ExportThingParams {
  format: ThingExportFormat
  outputDir: string
  transparentBackground: boolean
  jpegQuality: number
}

/** Parameters for exporting sprites */
export interface ExportSpriteParams {
  format: ImageFormat
  outputDir: string
  transparentBackground: boolean
  jpegQuality: number
}

/** Parameters for importing things from files */
export interface ImportThingParams {
  files: string[]
  category: string
}

// ---------------------------------------------------------------------------
// Event / callback types for async operations
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  id: ProgressBarID
  loaded: number
  total: number
  label?: string
}

export interface ErrorEvent {
  message: string
  stack?: string
}

export type ProgressCallback = (event: ProgressEvent) => void
export type ErrorCallback = (event: ErrorEvent) => void
export type CompleteCallback = () => void
