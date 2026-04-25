/**
 * Application settings for Object Builder.
 * Shared between main process (persistence) and renderer (UI state).
 *
 * Ported from legacy AS3: ob/settings/ObjectBuilderSettings.as
 * Legacy used OTML-based serialization via SettingsManager.
 * Electron uses JSON file persistence in userData directory.
 */

// ---------------------------------------------------------------------------
// ObjectBuilderSettings
// ---------------------------------------------------------------------------

export type EffectPreviewFrameMode = 'first' | 'largest'

export interface ObjectBuilderSettings {
  // --- Directory history ---------------------------------------------------
  lastDirectory: string | null
  lastMergeDirectory: string | null
  lastIODirectory: string | null
  lastServerItemsDirectory: string | null

  // --- Export format history -----------------------------------------------
  exportThingFormat: string | null
  exportSpriteFormat: string | null
  datSignature: number
  sprSignature: number

  // --- Feature flags -------------------------------------------------------
  autosaveThingChanges: boolean
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean

  // --- Window / panel geometry ---------------------------------------------
  maximized: boolean
  previewContainerWidth: number
  thingListContainerWidth: number
  spritesContainerWidth: number
  showPreviewPanel: boolean
  showThingsPanel: boolean
  showSpritesPanel: boolean

  // --- Sub-window geometry -------------------------------------------------
  findWindowWidth: number
  findWindowHeight: number
  objectViewerWidth: number
  objectViewerHeight: number
  objectViewerMaximized: boolean

  // --- Lists ---------------------------------------------------------------
  objectsListAmount: number
  spritesListAmount: number
  hideEmptyObjects: boolean
  effectPreviewFrameMode: EffectPreviewFrameMode

  // --- Export options -------------------------------------------------------
  exportWithTransparentBackground: boolean
  jpegQuality: number
  savingSpriteSheet: number

  // --- Animation default durations (ms) ------------------------------------
  itemsDuration: number
  outfitsDuration: number
  effectsDuration: number
  missilesDuration: number

  // --- Clipboard -----------------------------------------------------------
  thingListClipboardAction: number
  deleteAfterPaste: boolean

  // --- Server items --------------------------------------------------------
  lastAttributeServer: string
  syncOtbOnAdd: boolean

  // --- Misc ----------------------------------------------------------------
  language: string
  showLogPanel: boolean

  // --- Theme ----------------------------------------------------------------
  theme: 'system' | 'light' | 'dark'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createObjectBuilderSettings(): ObjectBuilderSettings {
  return {
    lastDirectory: null,
    lastMergeDirectory: null,
    lastIODirectory: null,
    lastServerItemsDirectory: null,

    exportThingFormat: null,
    exportSpriteFormat: null,
    datSignature: 0,
    sprSignature: 0,

    autosaveThingChanges: false,
    extended: false,
    transparency: false,
    improvedAnimations: false,
    frameGroups: false,

    maximized: true,
    previewContainerWidth: 0,
    thingListContainerWidth: 0,
    spritesContainerWidth: 0,
    showPreviewPanel: true,
    showThingsPanel: true,
    showSpritesPanel: true,

    findWindowWidth: 0,
    findWindowHeight: 0,
    objectViewerWidth: 0,
    objectViewerHeight: 0,
    objectViewerMaximized: false,

    objectsListAmount: 100,
    spritesListAmount: 100,
    hideEmptyObjects: false,
    effectPreviewFrameMode: 'first',

    exportWithTransparentBackground: false,
    jpegQuality: 100,
    savingSpriteSheet: 0,

    itemsDuration: 500,
    outfitsDuration: 300,
    effectsDuration: 100,
    missilesDuration: 75,

    // ClipboardAction.OBJECT = 0
    thingListClipboardAction: 0,
    deleteAfterPaste: false,

    lastAttributeServer: 'tfs1.4',
    syncOtbOnAdd: true,

    language: 'en_US',
    showLogPanel: true,

    theme: 'system'
  }
}

// ---------------------------------------------------------------------------
// Window state (separate from app settings, managed by main process)
// ---------------------------------------------------------------------------

export interface WindowState {
  x: number | undefined
  y: number | undefined
  width: number
  height: number
  maximized: boolean
}

export function createDefaultWindowState(): WindowState {
  return {
    x: undefined,
    y: undefined,
    width: 1280,
    height: 800,
    maximized: false
  }
}
