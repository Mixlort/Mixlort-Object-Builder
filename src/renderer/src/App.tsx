/**
 * Root application component.
 * Composes the main layout: Toolbar, SplitPane (3 resizable panels),
 * LogPanel (collapsible), and StatusBar.
 *
 * Handles menu action routing from both the native menu (via IPC)
 * and the toolbar buttons. Manages dialog open/close state.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  MENU_FILE_NEW,
  MENU_FILE_OPEN,
  MENU_FILE_COMPILE,
  MENU_FILE_COMPILE_AS,
  MENU_FILE_MERGE,
  MENU_FILE_PREFERENCES,
  MENU_WINDOW_LOG,
  MENU_VIEW_SHOW_PREVIEW,
  MENU_VIEW_SHOW_OBJECTS,
  MENU_VIEW_SHOW_SPRITES,
  MENU_HELP_ABOUT,
  MENU_TOOLS_FIND,
  MENU_TOOLS_ANIMATION_EDITOR,
  MENU_TOOLS_ASSET_STORE,
  MENU_TOOLS_OBJECT_VIEWER,
  MENU_TOOLS_SLICER,
  MENU_TOOLS_LOOK_TYPE_GENERATOR,
  MENU_TOOLS_SPRITES_OPTIMIZER,
  MENU_TOOLS_FRAME_DURATIONS_OPTIMIZER,
  MENU_TOOLS_FRAME_GROUPS_CONVERTER,
  type MenuAction
} from '../../shared/menu-actions'
import type { LoadProjectParams } from '../../shared/project-state'
import { useAppStore, useEditorStore, useSpriteStore, selectUI } from './stores'
import {
  ThingCategory,
  type ClientFeatures,
  type ClientInfo,
  type ThingType,
  type Version,
  FrameGroupType,
  createClientInfo,
  createThingData,
  getThingFrameGroup,
  getFrameGroupTotalSprites,
  ClipboardAction
} from './types'
import type { ThingData } from './types/things'
import { getDefaultDuration } from './types/settings'
import { ImageFormat, OTFormat } from './types/project'
import { Toolbar } from './components/Toolbar'
import { Modal, DialogButton } from './components/Modal'
import { SplitPane } from './components/SplitPane'
import { StatusBar } from './components/StatusBar'
import { LogPanel } from './components/LogPanel'
import { ThingListPanel, type ThingListAction } from './features/things'
import { ThingTypeEditor } from './features/editor'
import { SpritePanel } from './features/sprites'
import { PreviewPanel } from './features/preview'
import { AnimationEditorDialog } from './features/animation'
import { ObjectViewerDialog } from './features/viewer'
import { SlicerDialog } from './features/slicer'
import { AssetStoreDialog } from './features/store'
import { LookTypeGeneratorDialog } from './features/looktype'
import { SpritesOptimizerDialog, FrameDurationsOptimizerDialog } from './features/optimizer'
import { FrameGroupsConverterDialog } from './features/converter'
import {
  CreateAssetsDialog,
  OpenAssetsDialog,
  CompileAssetsDialog,
  MergeAssetsDialog,
  PreferencesDialog,
  AboutDialog,
  ErrorDialog,
  FindDialog,
  ExportDialog,
  ImportThingDialog,
  BulkEditDialog,
  type CreateAssetsResult,
  type OpenAssetsResult,
  type CompileAssetsResult,
  type MergeAssetsResult,
  type FindThingFilters,
  type FindSpriteFilters,
  type ExportDialogResult,
  type ImportThingResult,
  type BulkEditResult
} from './features/dialogs'
import { SPRITE_DIMENSIONS } from './data/sprite-dimensions'
import { createObjectBuilderSettings, type ObjectBuilderSettings } from '../../shared/settings'
import { readDatWithFallback } from './services/dat'
import { createOtfiData, parseOtfi, writeOtfi } from './services/otfi'
import { clearThumbnailCache } from './hooks/use-sprite-thumbnail'
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts'
import { workerService } from './workers/worker-service'
import { buildSpriteSheet } from './services/sprite-render'
import { argbToRgba, uncompressPixels } from './services/spr'
import {
  createThingExportPlan,
  exportThingPlanToFiles,
  type ThingExportEntry
} from './services/thing-export'
import { buildRecoveryOpenResult } from './utils'
import { materializeImportedThingData } from './services/thing-import/thing-import-service'
import {
  loadServerItems,
  saveServerItems,
  isLoaded as isServerItemsLoaded,
  applyServerItemNames,
  getEditableXmlAttributes,
  setEditableXmlAttributes,
  unloadServerItems,
  setAttributeServer
} from './services/server-items'
import { useTheme } from './providers/ThemeProvider'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'

// ---------------------------------------------------------------------------
// Dialog state type
// ---------------------------------------------------------------------------

type ActiveDialog =
  | 'create'
  | 'open'
  | 'compileAs'
  | 'merge'
  | 'preferences'
  | 'about'
  | 'error'
  | 'find'
  | 'export'
  | 'import'
  | 'bulkEdit'
  | 'animationEditor'
  | 'objectViewer'
  | 'slicer'
  | 'assetStore'
  | 'lookTypeGenerator'
  | 'spritesOptimizer'
  | 'frameDurationsOptimizer'
  | 'frameGroupsConverter'
  | 'confirmClose'
  | 'confirmThingSwitch'
  | 'recovery'
  | null

interface RecoveryInfo {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  serverItemsPath: string | null
  features: ClientFeatures | null
}

interface CompileRunParams {
  datFilePath: string
  sprFilePath: string
  fileName: string
  version: Version
  features: ClientFeatures
  serverItemsDirectory: string | null
  attributeServer: string | null
}

const MAGENTA_BG_ARGB = 0xffff00ff

function getMaxThingId(things: ThingType[], fallback: number): number {
  let maxId = fallback
  for (const thing of things) {
    if (thing.id > maxId) maxId = thing.id
  }
  return maxId
}

function getMaxSpriteId(sprites: Map<number, Uint8Array>): number {
  let maxId = 0
  for (const id of sprites.keys()) {
    if (id > maxId) maxId = id
  }
  return maxId
}

function getDefaultDurations(settings: ObjectBuilderSettings): Record<string, number> {
  return {
    item: getDefaultDuration(settings, ThingCategory.ITEM),
    outfit: getDefaultDuration(settings, ThingCategory.OUTFIT),
    effect: getDefaultDuration(settings, ThingCategory.EFFECT),
    missile: getDefaultDuration(settings, ThingCategory.MISSILE)
  }
}

function resolveSpriteDimension(
  spriteSize: number,
  spriteDataSize: number,
  fallback: (typeof SPRITE_DIMENSIONS)[number]
): (typeof SPRITE_DIMENSIONS)[number] {
  return (
    SPRITE_DIMENSIONS.find(
      (dimension) =>
        dimension.size === spriteSize && dimension.dataSize === spriteDataSize
    ) ?? fallback
  )
}

function getBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const file = normalized.split('/').pop() ?? filePath
  return file.replace(/\.[^/.]+$/u, '')
}

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.split('/').pop() ?? filePath
}

function joinPath(directory: string, fileName: string): string {
  return `${directory.replace(/[\\/]+$/u, '')}/${fileName}`
}

function getFilteredExportCategoryLabel(category: ThingCategory): string {
  return category === ThingCategory.MISSILE ? 'Missiles' : 'Effects'
}

function featurePayload(features: ClientFeatures): ClientFeatures {
  return {
    extended: features.extended,
    transparency: features.transparency,
    improvedAnimations: features.improvedAnimations,
    frameGroups: features.frameGroups,
    metadataController: features.metadataController,
    attributeServer: features.attributeServer
  }
}

function blendChannel(source: number, alpha: number, background: number): number {
  return Math.round(source * alpha + background * (1 - alpha))
}

function encodeBmpFromRgba(
  width: number,
  height: number,
  rgba: Uint8ClampedArray
): ArrayBuffer {
  const rowStride = width * 3
  const rowPadding = (4 - (rowStride % 4)) % 4
  const pixelDataSize = (rowStride + rowPadding) * height
  const headerSize = 14 + 40
  const fileSize = headerSize + pixelDataSize
  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)

  // BITMAPFILEHEADER
  view.setUint16(0, 0x4d42, true) // "BM"
  view.setUint32(2, fileSize, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, 0, true)
  view.setUint32(10, headerSize, true)

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true) // bottom-up
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(30, 0, true)
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, 2835, true) // 72 DPI
  view.setInt32(42, 2835, true)
  view.setUint32(46, 0, true)
  view.setUint32(50, 0, true)

  const backgroundR = 255
  const backgroundG = 0
  const backgroundB = 255

  let writePos = headerSize
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const alpha = rgba[offset + 3] / 255
      const red = blendChannel(rgba[offset], alpha, backgroundR)
      const green = blendChannel(rgba[offset + 1], alpha, backgroundG)
      const blue = blendChannel(rgba[offset + 2], alpha, backgroundB)

      view.setUint8(writePos++, blue)
      view.setUint8(writePos++, green)
      view.setUint8(writePos++, red)
    }

    for (let i = 0; i < rowPadding; i++) {
      view.setUint8(writePos++, 0)
    }
  }

  return buffer
}

async function canvasToArrayBuffer(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })
  if (!blob) {
    throw new Error('Failed to encode image data')
  }
  return blob.arrayBuffer()
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const ui = useAppStore(selectUI)
  const setPanelWidth = useAppStore((s) => s.setPanelWidth)
  const togglePanel = useAppStore((s) => s.togglePanel)
  const selectedThingId = useAppStore((s) => s.selectedThingId)
  const selectedThingIds = useAppStore((s) => s.selectedThingIds)
  const currentCategory = useAppStore((s) => s.currentCategory)
  const clientInfo = useAppStore((s) => s.clientInfo)
  const getThingById = useAppStore((s) => s.getThingById)
  const addLog = useAppStore((s) => s.addLog)
  const setEditingThingData = useEditorStore((s) => s.setEditingThingData)
  const { setTheme } = useTheme()
  const [logHeight, setLogHeight] = useState(150)
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [runtimeSettings, setRuntimeSettings] = useState<ObjectBuilderSettings>(
    createObjectBuilderSettings
  )
  const pendingCloseRef = useRef(false)
  const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(null)

  // Global keyboard shortcuts (undo/redo)
  useKeyboardShortcuts({ dialogOpen: activeDialog !== null })

  // -------------------------------------------------------------------------
  // Close confirmation: main process asks renderer before closing the window
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!window.api?.app?.onConfirmClose) return
    return window.api.app.onConfirmClose(() => {
      const { project } = useAppStore.getState()
      if (project.loaded && project.changed) {
        // Project has unsaved changes — show confirmation dialog
        pendingCloseRef.current = true
        setActiveDialog('confirmClose')
      } else {
        // No unsaved changes — close immediately
        window.api.app.closeConfirmed()
      }
    })
  }, [])

  // Check for recovery data from a previous crashed session on startup
  useEffect(() => {
    if (!window.api?.recovery?.getData) return
    window.api.recovery.getData().then((data) => {
      if (data) {
        setRecoveryInfo({
          datFilePath: data.datFilePath,
          sprFilePath: data.sprFilePath,
          versionValue: data.versionValue,
          serverItemsPath: data.serverItemsPath,
          features: data.features
            ? {
                extended: data.features.extended,
                transparency: data.features.transparency,
                improvedAnimations: data.features.improvedAnimations,
                frameGroups: data.features.frameGroups,
                metadataController: data.features.metadataController,
                attributeServer: data.features.attributeServer
              }
            : null
        })
        setActiveDialog('recovery')
      }
    })
  }, [])

  // Bridge: write log entries to persistent file via IPC
  useEffect(() => {
    let lastLogCount = useAppStore.getState().logs.length
    const unsubscribe = useAppStore.subscribe((state) => {
      const logs = state.logs
      if (!window.api?.log || logs.length <= lastLogCount) {
        lastLogCount = logs.length
        return
      }
      // Write only new entries (appended at the end)
      for (let i = lastLogCount; i < logs.length; i++) {
        const entry = logs[i]
        window.api.log.write(entry.level, entry.message)
      }
      lastLogCount = logs.length
    })
    return unsubscribe
  }, [])

  // Ref for pending thing switch (used by auto-save confirmation dialog)
  const pendingThingSwitchRef = useRef<{ thingId: number; category: ThingCategory } | null>(null)

  // Helper to actually load a thing into the editor
  const loadThingIntoEditor = useCallback(
    (thingId: number, cat: ThingCategory) => {
      const ci = clientInfo ?? useAppStore.getState().clientInfo
      if (!ci) return

      const thing = getThingById(cat, thingId)
      if (!thing) return

      const thingData: ThingData = {
        obdVersion: 0,
        clientVersion: ci.clientVersion,
        thing,
        sprites: new Map([[FrameGroupType.DEFAULT, []]]),
        xmlAttributes:
          cat === ThingCategory.ITEM ? getEditableXmlAttributes(thingId) : null
      }
      setEditingThingData(thingData)
    },
    [clientInfo, getThingById, setEditingThingData]
  )

  // Save current editing changes to app store (auto-save helper)
  const saveCurrentThingChanges = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (editorState.editingThingData && editorState.editingChanged) {
      const { thing, xmlAttributes } = editorState.editingThingData

      if (thing.category === ThingCategory.ITEM) {
        setEditableXmlAttributes(thing.id, xmlAttributes)
      }

      useAppStore.getState().updateThing(thing.category, thing.id, thing)
      editorState.setEditingChanged(false)
    }
  }, [])

  // Start editing a thing (called on double-click, Edit button, or context menu Edit)
  // Handles auto-save or confirmation when switching objects with unsaved changes.
  const handleEditThing = useCallback(
    (thingId: number, category?: ThingCategory) => {
      const cat = category ?? currentCategory
      const editorState = useEditorStore.getState()

      // Check if switching away from a thing with unsaved changes
      if (editorState.editingThingData && editorState.editingChanged) {
        if (autosaveSettingRef.current) {
          // Auto-save: persist changes silently and switch
          saveCurrentThingChanges()
          loadThingIntoEditor(thingId, cat)
        } else {
          // Show confirmation dialog
          pendingThingSwitchRef.current = { thingId, category: cat }
          setActiveDialog('confirmThingSwitch')
        }
        return
      }

      loadThingIntoEditor(thingId, cat)
    },
    [currentCategory, saveCurrentThingChanges, loadThingIntoEditor]
  )

  // Ref to cache autosaveThingChanges setting
  const autosaveSettingRef = useRef(false)

  // Sync autosave setting on startup and when preferences change
  useEffect(() => {
    if (!window.api?.settings?.load) return
    window.api.settings.load().then((settings) => {
      autosaveSettingRef.current = settings.autosaveThingChanges
    })
  }, [])

  // Handle actions from ThingListPanel action bar (open corresponding dialogs)
  const handleThingListAction = useCallback((action: ThingListAction) => {
    switch (action) {
      case 'import':
        setActiveDialog('import')
        break
      case 'export':
        setActiveDialog('export')
        break
      case 'replace':
        setActiveDialog('import')
        break
      case 'find':
        setActiveDialog('find')
        break
    }
  }, [])

  // -------------------------------------------------------------------------
  // Dialog handlers
  // -------------------------------------------------------------------------

  const handleCreateConfirm = useCallback(
    async (result: CreateAssetsResult) => {
      addLog(
        'info',
        `Creating new project: v${result.version.valueStr}, ${result.spriteDimension.value}`
      )

      clearThumbnailCache()
      useAppStore.getState().setLocked(true)
      setIsLoading(true)
      setLoadingLabel('Creating project...')

      try {
        unloadServerItems()

        const features: ClientFeatures = {
          extended: result.extended,
          transparency: result.transparency,
          improvedAnimations: result.improvedAnimations,
          frameGroups: result.frameGroups,
          metadataController: 'default',
          attributeServer: null
        }

        // Create project on main process
        await window.api.project.create({
          datSignature: result.version.datSignature,
          sprSignature: result.version.sprSignature,
          versionValue: result.version.value,
          features: {
            extended: features.extended,
            transparency: features.transparency,
            improvedAnimations: features.improvedAnimations,
            frameGroups: features.frameGroups,
            metadataController: features.metadataController,
            attributeServer: features.attributeServer
          }
        })

        // Build empty ClientInfo
        const clientInfo: ClientInfo = {
          ...createClientInfo(),
          clientVersion: result.version.value,
          clientVersionStr: result.version.valueStr,
          datSignature: result.version.datSignature,
          sprSignature: result.version.sprSignature,
          minItemId: 100,
          maxItemId: 99,
          minOutfitId: 1,
          maxOutfitId: 0,
          minEffectId: 1,
          maxEffectId: 0,
          minMissileId: 1,
          maxMissileId: 0,
          minSpriteId: 1,
          maxSpriteId: 0,
          features,
          loaded: true,
          isTemporary: true,
          spriteSize: result.spriteDimension.size,
          spriteDataSize: result.spriteDimension.dataSize
        }

        // Populate stores with empty data
        const appState = useAppStore.getState()
        appState.setProjectLoaded({
          clientInfo,
          loaded: true,
          isTemporary: true,
          changed: false,
          fileName: '',
          datFilePath: null,
          sprFilePath: null
        })
        appState.setThings(ThingCategory.ITEM, [])
        appState.setThings(ThingCategory.OUTFIT, [])
        appState.setThings(ThingCategory.EFFECT, [])
        appState.setThings(ThingCategory.MISSILE, [])
        appState.setSpriteCount(0)
        useSpriteStore.getState().loadSprites(new Map())

        // Update native menu
        await window.api.menu.updateState({
          clientLoaded: true,
          clientIsTemporary: true,
          clientChanged: false
        })

        addLog('info', 'New project created successfully')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to create project: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
      } finally {
        useAppStore.getState().setLocked(false)
        setIsLoading(false)
        setLoadingLabel('')
      }
    },
    [addLog]
  )

  const runOpenProject = useCallback(
    async (result: OpenAssetsResult): Promise<boolean> => {
      addLog('info', `Opening project: v${result.version.valueStr} from ${result.datFile}`)

      clearThumbnailCache()
      useAppStore.getState().setLocked(true)
      setIsLoading(true)
      setLoadingLabel('Loading files...')

      try {
        unloadServerItems()

        // Build features from dialog result
        const dialogFeatures: ClientFeatures = {
          extended: result.extended,
          transparency: result.transparency,
          improvedAnimations: result.improvedAnimations,
          frameGroups: result.frameGroups,
          metadataController: 'default',
          attributeServer: result.attributeServer ?? null
        }

        // Build IPC params
        const loadParams: LoadProjectParams = {
          datFilePath: result.datFile,
          sprFilePath: result.sprFile,
          versionValue: result.version.value,
          datSignature: result.version.datSignature,
          sprSignature: result.version.sprSignature,
          features: {
            extended: dialogFeatures.extended,
            transparency: dialogFeatures.transparency,
            improvedAnimations: dialogFeatures.improvedAnimations,
            frameGroups: dialogFeatures.frameGroups,
            metadataController: dialogFeatures.metadataController,
            attributeServer: dialogFeatures.attributeServer
          },
          serverItemsPath: result.serverItemsDirectory ?? null
        }

        // Load raw buffers from disk via main process
        const loadResult = await window.api.project.load(loadParams)

        // Load settings for default durations
        setLoadingLabel('Parsing metadata...')
        const settings = await window.api.settings.load()
        const defaultDurations = getDefaultDurations(settings)

        // OTFI is authoritative for the binary format that was last compiled.
        // Use it before parsing DAT/SPR so reopen stays aligned with the file.
        let otfiData: ReturnType<typeof parseOtfi> | null = null
        if (loadResult.otfiContent) {
          otfiData = parseOtfi(loadResult.otfiContent)
          if (otfiData) {
            addLog('info', 'OTFI loaded')
          }
        }

        const configuredFeatures: ClientFeatures = otfiData
          ? {
              ...dialogFeatures,
              ...otfiData.features,
              metadataController: otfiData.features.metadataController ?? 'default',
              attributeServer:
                otfiData.features.attributeServer ?? result.attributeServer ?? null
            }
          : dialogFeatures

        const resolvedSpriteDimension = otfiData
          ? resolveSpriteDimension(
              otfiData.spriteSize,
              otfiData.spriteDataSize,
              result.spriteDimension
            )
          : result.spriteDimension

        // Parse DAT (offloaded to Web Worker) with a compatibility fallback for
        // custom 10.x clients that keep modern flags but do not encode frame groups.
        const datRead = await readDatWithFallback({
          buffer: loadResult.datBuffer,
          version: result.version.value,
          features: configuredFeatures,
          defaultDurations,
          readDat: (buffer, version, readFeatures, durations) =>
            workerService.readDat(buffer, version, readFeatures, durations)
        })
        const datResult = datRead.result
        const effectiveFeatures = datRead.features

        if (datRead.didFallback) {
          addLog(
            'warning',
            `DAT compatibility fallback: reopened with Frame Groups disabled (${datRead.originalError})`
          )
        }
        addLog(
          'info',
          `DAT: ${datResult.items.length} items, ${datResult.outfits.length} outfits, ${datResult.effects.length} effects, ${datResult.missiles.length} missiles`
        )

        // Load sprites lazily via SpriteAccessor (no upfront extraction)
        setLoadingLabel('Indexing sprites...')
        useSpriteStore.getState().loadFromBuffer(loadResult.sprBuffer, effectiveFeatures.extended)
        const sprAccessor = useSpriteStore.getState().spriteAccessor!
        addLog('info', `SPR: ${sprAccessor.spriteCount} sprites (lazy loading)`)

        // Parse OTB + XML through server-items service (optional)
        let otbInfo: { majorVersion: number; minorVersion: number; count: number } | null = null
        if (loadResult.otbBuffer) {
          setLoadingLabel('Parsing server items...')
          const serverItemsResult = loadServerItems({
            otbBuffer: loadResult.otbBuffer,
            xmlContent: loadResult.xmlContent ?? undefined,
            attributeServer: configuredFeatures.attributeServer ?? result.attributeServer
          })

          otbInfo = {
            majorVersion: serverItemsResult.itemList.majorVersion,
            minorVersion: serverItemsResult.itemList.minorVersion,
            count: serverItemsResult.itemList.count
          }

          addLog('info', `OTB: ${otbInfo.count} items (v${otbInfo.majorVersion}.${otbInfo.minorVersion})`)

          if (serverItemsResult.missingAttributes.length > 0) {
            addLog(
              'warning',
              `items.xml unknown attributes: ${serverItemsResult.missingAttributes.join(', ')}`
            )
          }

          if (serverItemsResult.missingTagAttributes.length > 0) {
            addLog(
              'warning',
              `items.xml unknown tag attributes: ${serverItemsResult.missingTagAttributes.join(', ')}`
            )
          }

          if (loadResult.xmlContent) {
            addLog('info', 'items.xml loaded')
          }
        }

        await window.api.project.updateFeatures(featurePayload(effectiveFeatures))

        // Build ClientInfo
        setLoadingLabel('Populating stores...')
        const fileName = getBaseName(result.datFile)
        const clientInfo: ClientInfo = {
          ...createClientInfo(),
          clientVersion: result.version.value,
          clientVersionStr: result.version.valueStr,
          datSignature: datResult.signature,
          sprSignature: sprAccessor.signature,
          minItemId: 100,
          maxItemId: datResult.maxItemId,
          minOutfitId: 1,
          maxOutfitId: datResult.maxOutfitId,
          minEffectId: 1,
          maxEffectId: datResult.maxEffectId,
          minMissileId: 1,
          maxMissileId: datResult.maxMissileId,
          minSpriteId: 1,
          maxSpriteId: sprAccessor.spriteCount,
          features: effectiveFeatures,
          loaded: true,
          isTemporary: false,
          otbLoaded: otbInfo !== null,
          otbMajorVersion: otbInfo?.majorVersion ?? 0,
          otbMinorVersion: otbInfo?.minorVersion ?? 0,
          otbItemsCount: otbInfo?.count ?? 0,
          spriteSize: resolvedSpriteDimension.size,
          spriteDataSize: resolvedSpriteDimension.dataSize,
          loadedFileName: fileName
        }

        const loadedItems = otbInfo ? applyServerItemNames(datResult.items) : datResult.items

        // Populate stores
        const appState = useAppStore.getState()
        appState.setProjectLoaded({
          clientInfo,
          loaded: true,
          isTemporary: false,
          changed: false,
          fileName,
          datFilePath: result.datFile,
          sprFilePath: result.sprFile
        })
        appState.setThings(ThingCategory.ITEM, loadedItems)
        appState.setThings(ThingCategory.OUTFIT, datResult.outfits)
        appState.setThings(ThingCategory.EFFECT, datResult.effects)
        appState.setThings(ThingCategory.MISSILE, datResult.missiles)
        appState.setSpriteCount(sprAccessor.spriteCount)

        // Update native menu
        await window.api.menu.updateState({
          clientLoaded: true,
          clientIsTemporary: false,
          clientChanged: false,
          otbLoaded: otbInfo !== null
        })

        addLog('info', `Project loaded: ${fileName} v${result.version.valueStr}`)
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to load project: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
        return false
      } finally {
        useAppStore.getState().setLocked(false)
        setIsLoading(false)
        setLoadingLabel('')
      }
    },
    [addLog]
  )

  const handleOpenConfirm = useCallback(
    async (result: OpenAssetsResult) => {
      await runOpenProject(result)
    },
    [runOpenProject]
  )

  const runCompile = useCallback(
    async (params: CompileRunParams): Promise<boolean> => {
      const state = useAppStore.getState()
      const currentClientInfo = state.clientInfo

      if (!state.project.loaded || !currentClientInfo) {
        addLog('warning', 'No project loaded')
        return false
      }

      saveCurrentThingChanges()

      setIsLoading(true)
      setLoadingLabel('Compiling project...')
      state.setLocked(true)

      try {
        const things = state.things
        const sprites = useSpriteStore.getState().getAllSprites()
        const maxSpriteId = getMaxSpriteId(sprites)

        const datBuffer = await workerService.writeDat(
          {
            signature: params.version.datSignature,
            maxItemId: getMaxThingId(things.items, 99),
            maxOutfitId: getMaxThingId(things.outfits, 0),
            maxEffectId: getMaxThingId(things.effects, 0),
            maxMissileId: getMaxThingId(things.missiles, 0),
            items: things.items,
            outfits: things.outfits,
            effects: things.effects,
            missiles: things.missiles
          },
          params.version.value,
          params.features
        )

        setLoadingLabel('Validating metadata...')
        const settings = await window.api.settings.load()
        await workerService.readDat(
          datBuffer,
          params.version.value,
          params.features,
          getDefaultDurations(settings)
        )

        setLoadingLabel('Compiling sprites...')
        const sprBuffer = await workerService.writeSpr(
          {
            signature: params.version.sprSignature,
            spriteCount: maxSpriteId,
            sprites
          },
          params.features.extended
        )

        const otfiContent = writeOtfi(
          createOtfiData(
            params.features,
            getFileName(params.datFilePath),
            getFileName(params.sprFilePath),
            currentClientInfo.spriteSize,
            currentClientInfo.spriteDataSize
          )
        )

        let otbBuffer: ArrayBuffer | null = null
        let xmlContent: string | null = null
        const shouldExportServerItems = !!params.serverItemsDirectory && isServerItemsLoaded()
        if (shouldExportServerItems) {
          setLoadingLabel('Saving server items...')
          if (params.attributeServer) {
            setAttributeServer(params.attributeServer)
          }
          const serverItemsResult = saveServerItems()
          otbBuffer = serverItemsResult.otbBuffer
          xmlContent = serverItemsResult.xmlContent
        }

        setLoadingLabel('Writing files...')
        await window.api.project.compile({
          datFilePath: params.datFilePath,
          sprFilePath: params.sprFilePath,
          datBuffer,
          sprBuffer,
          versionValue: params.version.value,
          datSignature: params.version.datSignature,
          sprSignature: params.version.sprSignature,
          features: featurePayload(params.features),
          serverItemsPath: shouldExportServerItems ? params.serverItemsDirectory : null,
          otbBuffer,
          xmlContent,
          otfiContent
        })

        const updatedClientInfo: ClientInfo = {
          ...currentClientInfo,
          clientVersion: params.version.value,
          clientVersionStr: params.version.valueStr,
          datSignature: params.version.datSignature,
          sprSignature: params.version.sprSignature,
          minItemId: 100,
          maxItemId: getMaxThingId(things.items, 99),
          minOutfitId: 1,
          maxOutfitId: getMaxThingId(things.outfits, 0),
          minEffectId: 1,
          maxEffectId: getMaxThingId(things.effects, 0),
          minMissileId: 1,
          maxMissileId: getMaxThingId(things.missiles, 0),
          minSpriteId: 1,
          maxSpriteId,
          features: params.features,
          loaded: true,
          isTemporary: false,
          loadedFileName: params.fileName
        }

        state.setProjectLoaded({
          clientInfo: updatedClientInfo,
          loaded: true,
          isTemporary: false,
          changed: false,
          fileName: params.fileName,
          datFilePath: params.datFilePath,
          sprFilePath: params.sprFilePath
        })
        state.setSpriteCount(maxSpriteId)
        useEditorStore.getState().setEditingChanged(false)
        useSpriteStore.getState().clearChangedSprites()

        await window.api.menu.updateState({
          clientLoaded: true,
          clientIsTemporary: false,
          clientChanged: false,
          otbLoaded: updatedClientInfo.otbLoaded
        })

        addLog(
          'info',
          `Compiled successfully: ${params.fileName}.dat / ${params.fileName}.spr (v${params.version.valueStr})`
        )
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to compile project: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
        return false
      } finally {
        state.setLocked(false)
        setIsLoading(false)
        setLoadingLabel('')
      }
    },
    [addLog, saveCurrentThingChanges]
  )

  const handleCompileAsConfirm = useCallback(
    async (result: CompileAssetsResult) => {
      addLog(
        'info',
        `Compiling as: ${result.filesName} v${result.version.valueStr} to ${result.directory}`
      )
      const features: ClientFeatures = {
        extended: result.extended,
        transparency: result.transparency,
        improvedAnimations: result.improvedAnimations,
        frameGroups: result.frameGroups,
        metadataController: 'default',
        attributeServer: result.attributeServer ?? null
      }

      const ok = await runCompile({
        datFilePath: joinPath(result.directory, `${result.filesName}.dat`),
        sprFilePath: joinPath(result.directory, `${result.filesName}.spr`),
        fileName: result.filesName,
        version: result.version,
        features,
        serverItemsDirectory: result.serverItemsDirectory,
        attributeServer: result.attributeServer ?? null
      })

      if (ok && pendingCloseRef.current) {
        pendingCloseRef.current = false
        window.api?.app?.closeConfirmed()
      }
    },
    [addLog, runCompile]
  )

  const handleMergeConfirm = useCallback(
    (result: MergeAssetsResult) => {
      addLog('info', `Merging: v${result.version.valueStr} from ${result.datFile}`)
      // TODO: Wire to actual merge logic in future steps
    },
    [addLog]
  )

  const handlePreferencesConfirm = useCallback(
    (settings: ObjectBuilderSettings) => {
      setRuntimeSettings(settings)
      if (window.api?.settings) {
        window.api.settings.save(settings).then(() => {
          addLog('info', 'Preferences saved')
        })
      }
      // Sync clipboard action setting to editor store
      useEditorStore
        .getState()
        .setClipboardAction(settings.thingListClipboardAction as ClipboardAction)
      // Sync autosave setting
      autosaveSettingRef.current = settings.autosaveThingChanges
      // Sync theme setting
      setTheme(settings.theme)
      // Sync language setting
      if (settings.language && settings.language !== i18n.language) {
        i18n.changeLanguage(settings.language)
      }
    },
    [addLog, setTheme]
  )

  const handleFindThings = useCallback(
    (filters: FindThingFilters) => {
      addLog('info', `Searching things: category=${filters.category}, name="${filters.name}"`)
      // TODO: Wire to actual search logic in future steps
    },
    [addLog]
  )

  const handleFindSprites = useCallback(
    (filters: FindSpriteFilters) => {
      addLog(
        'info',
        `Searching sprites: unused=${filters.unusedSprites}, empty=${filters.emptySprites}`
      )
      // TODO: Wire to actual sprite search logic in future steps
    },
    [addLog]
  )

  const handleFindSelectThing = useCallback((id: number, category: ThingCategory) => {
    const { setCurrentCategory, selectThing } = useAppStore.getState()
    setCurrentCategory(category)
    selectThing(id)
    setActiveDialog(null)
  }, [])

  const handleCompileCurrent = useCallback(async (): Promise<boolean> => {
    const state = useAppStore.getState()
    const compileClientInfo = state.clientInfo

    if (!state.project.loaded || !compileClientInfo) {
      addLog('warning', 'No project loaded')
      return false
    }

    if (state.project.isTemporary || !state.project.datFilePath || !state.project.sprFilePath) {
      setActiveDialog('compileAs')
      return false
    }

    let ok = false
    try {
      const projectState = await window.api.project.getState()
      ok = await runCompile({
        datFilePath: state.project.datFilePath,
        sprFilePath: state.project.sprFilePath,
        fileName: state.project.fileName || getBaseName(state.project.datFilePath),
        version: {
          value: compileClientInfo.clientVersion,
          valueStr: compileClientInfo.clientVersionStr,
          datSignature: compileClientInfo.datSignature,
          sprSignature: compileClientInfo.sprSignature,
          otbVersion: 0
        },
        features: compileClientInfo.features,
        serverItemsDirectory: projectState.serverItemsPath ?? null,
        attributeServer: compileClientInfo.features.attributeServer
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      addLog('error', `Failed to prepare compile operation: ${message}`)
      setErrorMessages([message])
      setActiveDialog('error')
      return false
    }

    if (ok && pendingCloseRef.current) {
      pendingCloseRef.current = false
      window.api?.app?.closeConfirmed()
    }

    return ok
  }, [addLog, runCompile])

  const handleExportConfirm = useCallback(
    async (result: ExportDialogResult) => {
      const exportLabel = result.fileName.trim().length > 0 ? result.fileName : '[auto]'
      addLog('info', `Exporting: ${exportLabel} as ${result.format} to ${result.directory}`)
      const state = useAppStore.getState()
      const exportClientInfo = state.clientInfo

      if (!state.project.loaded || !exportClientInfo) {
        addLog('warning', 'No project loaded')
        return
      }

      setIsLoading(true)
      setLoadingLabel('Exporting objects...')
      state.setLocked(true)

      try {
        const plan = createThingExportPlan({
          category: currentCategory,
          selectedThingIds:
            selectedThingIds.length > 0
              ? selectedThingIds
              : selectedThingId !== null
                ? [selectedThingId]
                : [],
          things: state.things,
          idFilterEnabled: result.idFilterEnabled,
          idFilterInput: result.idFilterInput
        })

        addLog('info', `Export plan: ${plan.entries.length} object(s)`)

        if (plan.entries.length === 0) {
          addLog('warning', 'No objects selected for export')
          return
        }

        if (plan.missingSourceIds.length > 0) {
          const categoryLabel = getFilteredExportCategoryLabel(plan.category)
          addLog(
            'warning',
            `${categoryLabel} IDs not found: ${plan.missingSourceIds.join(', ')} (exporting empty placeholders)`
          )
        }

        const transparent = exportClientInfo.features.transparency
        const encodeThing = async (entry: ThingExportEntry): Promise<ArrayBuffer> => {
          if (result.format === OTFormat.OBD) {
            if (!result.version) {
              throw new Error('OBD export requires a target version')
            }

            const spriteMap = new Map<
              FrameGroupType,
              Array<{ id: number; pixels: Uint8Array | null }>
            >()
            for (const groupType of [FrameGroupType.DEFAULT, FrameGroupType.WALKING] as const) {
              const frameGroup = getThingFrameGroup(entry.thing, groupType)
              if (!frameGroup) continue

              const totalSprites = getFrameGroupTotalSprites(frameGroup)
              const sprites = new Array(totalSprites)
              for (let i = 0; i < totalSprites; i++) {
                const spriteId = frameGroup.spriteIndex[i] ?? 0
                let pixels: Uint8Array | null = null
                if (spriteId > 0) {
                  const compressed = useSpriteStore.getState().getSprite(spriteId)
                  if (compressed && compressed.length > 0) {
                    pixels = uncompressPixels(compressed, transparent)
                  }
                }
                sprites[i] = { id: spriteId, pixels }
              }
              spriteMap.set(groupType, sprites)
            }

            const thingData = createThingData(
              result.obdVersion,
              result.version.value,
              entry.thing,
              spriteMap
            )
            return workerService.encodeObd(thingData)
          }

          const frameGroup = getThingFrameGroup(entry.thing, FrameGroupType.DEFAULT)
          if (!frameGroup) {
            throw new Error(`Thing ${entry.sourceId} has no frame group`)
          }

          const backgroundColor =
            result.format === ImageFormat.PNG && result.transparentBackground
              ? 0x00000000
              : MAGENTA_BG_ARGB

          const sheet = buildSpriteSheet(
            frameGroup,
            (spriteArrayIndex) => {
              const spriteId = frameGroup.spriteIndex[spriteArrayIndex]
              if (!spriteId || spriteId <= 0) return null

              const compressed = useSpriteStore.getState().getSprite(spriteId)
              if (!compressed || compressed.length === 0) return null

              return uncompressPixels(compressed, transparent)
            },
            backgroundColor
          )

          if (sheet.width === 0 || sheet.height === 0) {
            throw new Error(`Thing ${entry.sourceId} has no sprite data`)
          }

          const rgba = new Uint8ClampedArray(argbToRgba(sheet.pixels))
          if (result.format === ImageFormat.BMP) {
            return encodeBmpFromRgba(sheet.width, sheet.height, rgba)
          }

          const canvas = document.createElement('canvas')
          canvas.width = sheet.width
          canvas.height = sheet.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            throw new Error('Failed to create canvas context')
          }

          ctx.putImageData(new ImageData(rgba, sheet.width, sheet.height), 0, 0)

          if (result.format === ImageFormat.JPG) {
            const quality = Math.max(0.1, Math.min(1, result.jpegQuality / 100))
            return canvasToArrayBuffer(canvas, 'image/jpeg', quality)
          }

          return canvasToArrayBuffer(canvas, 'image/png')
        }

        const exportResult = await exportThingPlanToFiles({
          plan,
          directory: result.directory,
          fileNamePrefix: result.fileName,
          format: result.format,
          useOriginalIdsInFileNames: result.useOriginalIdsInFileNames,
          encodeThing,
          writeBinary: (filePath, data) => window.api.file.writeBinary(filePath, data),
          writeText: (filePath, text) => window.api.file.writeText(filePath, text)
        })

        addLog('info', `Export complete: ${exportResult.exportedCount} object(s)`)
        if (exportResult.mapFilePath) {
          addLog(
            'info',
            `${getFilteredExportCategoryLabel(plan.category)} ID map generated: ${exportResult.mapFilePath}`
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to export objects: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
      } finally {
        state.setLocked(false)
        setIsLoading(false)
        setLoadingLabel('')
      }
    },
    [addLog, currentCategory, selectedThingIds, selectedThingId]
  )

  const handleImportConfirm = useCallback(
    async (result: ImportThingResult) => {
      addLog('info', `Importing: ${result.entries.length} object(s) (${result.action})`)

      const appState = useAppStore.getState()
      const importClientInfo = appState.clientInfo
      if (!appState.project.loaded || !importClientInfo) {
        addLog('warning', 'No project loaded')
        return
      }

      setIsLoading(true)
      setLoadingLabel('Importing object...')
      appState.setLocked(true)

      try {
        if (result.action === 'replace') {
          const targetIds =
            selectedThingIds.length > 0
              ? [...selectedThingIds].sort((a, b) => a - b)
              : selectedThingId !== null
                ? [selectedThingId]
                : []

          if (targetIds.length === 0) {
            throw new Error('No object selected for replace')
          }

          if (targetIds.length !== result.entries.length) {
            throw new Error(
              `Selected ${targetIds.length} object(s), but received ${result.entries.length} file(s).`
            )
          }

          const mismatchedCategory = result.entries.find(
            (entry) => entry.thingData.thing.category !== currentCategory
          )
          if (mismatchedCategory) {
            throw new Error(
              `Cannot replace ${currentCategory} with imported ${mismatchedCategory.thingData.thing.category}. Categories must match.`
            )
          }

          for (let index = 0; index < result.entries.length; index++) {
            const entry = result.entries[index]
            const imported = materializeImportedThingData({
              thingData: entry.thingData,
              transparent: importClientInfo.features.transparency,
              addSprite: (compressed) => useSpriteStore.getState().addSprite(compressed)
            })

            const targetId = targetIds[index]
            imported.thing.id = targetId
            appState.updateThing(currentCategory, targetId, imported.thing)
          }

          const editorThing = useEditorStore.getState().editingThingData?.thing
          if (editorThing && targetIds.includes(editorThing.id)) {
            loadThingIntoEditor(editorThing.id, currentCategory)
          }

          addLog('info', `Import complete: replaced ${targetIds.length} ${currentCategory}(s)`)
        } else {
          let lastAddedId: number | null = null

          for (const entry of result.entries) {
            const imported = materializeImportedThingData({
              thingData: entry.thingData,
              transparent: importClientInfo.features.transparency,
              addSprite: (compressed) => useSpriteStore.getState().addSprite(compressed)
            })

            const category = imported.thing.category
            const categoryThings = appState.getThingsByCategory(category)
            const minId =
              category === ThingCategory.ITEM
                ? importClientInfo.minItemId
                : category === ThingCategory.OUTFIT
                  ? importClientInfo.minOutfitId
                  : category === ThingCategory.EFFECT
                    ? importClientInfo.minEffectId
                    : importClientInfo.minMissileId

            const targetId = getMaxThingId(categoryThings, minId - 1) + 1
            imported.thing.id = targetId
            appState.addThing(category, imported.thing)
            lastAddedId = targetId
          }

          if (lastAddedId !== null) {
            appState.selectThing(lastAddedId)
          }

          addLog('info', `Import complete: added ${result.entries.length} object(s)`)
        }

        appState.setSpriteCount(useSpriteStore.getState().getSpriteCount())
        appState.setProjectChanged(true)
        await window.api.menu.updateState({ clientChanged: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to import object: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
      } finally {
        useAppStore.getState().setLocked(false)
        setIsLoading(false)
        setLoadingLabel('')
      }
    },
    [addLog, currentCategory, loadThingIntoEditor, selectedThingId, selectedThingIds]
  )

  const handleBulkEditConfirm = useCallback(
    (result: BulkEditResult) => {
      const { bulkEditIds, bulkEditCategory } = useEditorStore.getState()
      addLog(
        'info',
        `Bulk edit: ${result.properties.length} changes on ${bulkEditIds.length} ${bulkEditCategory ?? 'objects'}`
      )
      useEditorStore.getState().clearBulkEdit()
      // TODO: Wire to actual bulk update logic in future steps
    },
    [addLog]
  )

  const handleBulkEditClose = useCallback(() => {
    setActiveDialog(null)
    useEditorStore.getState().clearBulkEdit()
  }, [])

  // Close confirmation dialog handlers
  const handleCloseConfirmSave = useCallback(async () => {
    setActiveDialog(null)
    await handleCompileCurrent()
  }, [handleCompileCurrent])

  const handleCloseConfirmDiscard = useCallback(() => {
    pendingCloseRef.current = false
    setActiveDialog(null)
    window.api?.app?.closeConfirmed()
  }, [])

  const handleCloseConfirmCancel = useCallback(() => {
    pendingCloseRef.current = false
    setActiveDialog(null)
  }, [])

  // Thing switch confirmation dialog handlers (when autosave is disabled)
  const handleThingSwitchSave = useCallback(() => {
    saveCurrentThingChanges()
    const pending = pendingThingSwitchRef.current
    pendingThingSwitchRef.current = null
    setActiveDialog(null)
    if (pending) {
      loadThingIntoEditor(pending.thingId, pending.category)
    }
  }, [saveCurrentThingChanges, loadThingIntoEditor])

  const handleThingSwitchDiscard = useCallback(() => {
    // Discard changes and switch
    useEditorStore.getState().setEditingChanged(false)
    const pending = pendingThingSwitchRef.current
    pendingThingSwitchRef.current = null
    setActiveDialog(null)
    if (pending) {
      loadThingIntoEditor(pending.thingId, pending.category)
    }
  }, [loadThingIntoEditor])

  const handleThingSwitchCancel = useCallback(() => {
    pendingThingSwitchRef.current = null
    setActiveDialog(null)
  }, [])

  // Recovery dialog handlers
  const handleRecoveryReopen = useCallback(() => {
    const info = recoveryInfo
    setRecoveryInfo(null)
    setActiveDialog(null)

    if (!info || !window.api?.file?.readBinary) {
      return
    }

    void (async () => {
      try {
        addLog('info', `Recovering previous session: ${info.datFilePath}`)

        const [datBuffer, sprBuffer] = await Promise.all([
          window.api.file.readBinary(info.datFilePath),
          window.api.file.readBinary(info.sprFilePath)
        ])

        let recoveryFeatures = info.features
        if (!recoveryFeatures && window.api?.file?.readText) {
          try {
            const datDir = info.datFilePath.replace(/[\\/][^\\/]+$/u, '')
            const datBaseName = getBaseName(info.datFilePath)
            const otfiPath = `${datDir}/${datBaseName}.otfi`
            const otfiContent = await window.api.file.readText(otfiPath)
            const otfiData = parseOtfi(otfiContent)
            recoveryFeatures = otfiData?.features ?? null
          } catch {
            // Ignore missing/invalid OTFI and fall back to version defaults.
          }
        }

        const result = buildRecoveryOpenResult({
          datFilePath: info.datFilePath,
          sprFilePath: info.sprFilePath,
          versionValue: info.versionValue,
          serverItemsPath: info.serverItemsPath,
          features: recoveryFeatures,
          datBuffer,
          sprBuffer
        })

        const ok = await runOpenProject(result)
        if (ok) {
          window.api?.recovery?.clear()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        addLog('error', `Failed to recover previous session: ${message}`)
        setErrorMessages([message])
        setActiveDialog('error')
      }
    })()
  }, [recoveryInfo, addLog, runOpenProject])

  const handleRecoveryDismiss = useCallback(() => {
    setRecoveryInfo(null)
    setActiveDialog(null)
    window.api?.recovery?.clear()
  }, [])

  // Watch editor store editMode: when bulk edit is triggered from context menu, open dialog
  const editMode = useEditorStore((s) => s.editMode)
  const bulkEditIds = useEditorStore((s) => s.bulkEditIds)
  const bulkEditCategory = useEditorStore((s) => s.bulkEditCategory)

  useEffect(() => {
    if (editMode === 'bulk' && bulkEditIds.length > 0 && bulkEditCategory) {
      setActiveDialog('bulkEdit')
    }
  }, [editMode, bulkEditIds, bulkEditCategory])

  // Central action handler for menu and toolbar actions
  const handleAction = useCallback(
    (action: MenuAction) => {
      switch (action) {
        case MENU_FILE_NEW:
          setActiveDialog('create')
          break
        case MENU_FILE_OPEN:
          setActiveDialog('open')
          break
        case MENU_FILE_COMPILE:
          void handleCompileCurrent()
          break
        case MENU_FILE_COMPILE_AS:
          setActiveDialog('compileAs')
          break
        case MENU_FILE_MERGE:
          setActiveDialog('merge')
          break
        case MENU_FILE_PREFERENCES:
          setActiveDialog('preferences')
          break
        case MENU_HELP_ABOUT:
          setActiveDialog('about')
          break
        case MENU_TOOLS_FIND:
          setActiveDialog('find')
          break
        case MENU_TOOLS_ANIMATION_EDITOR:
          setActiveDialog('animationEditor')
          break
        case MENU_TOOLS_OBJECT_VIEWER:
          setActiveDialog('objectViewer')
          break
        case MENU_TOOLS_SLICER:
          setActiveDialog('slicer')
          break
        case MENU_TOOLS_ASSET_STORE:
          setActiveDialog('assetStore')
          break
        case MENU_TOOLS_LOOK_TYPE_GENERATOR:
          setActiveDialog('lookTypeGenerator')
          break
        case MENU_TOOLS_SPRITES_OPTIMIZER:
          setActiveDialog('spritesOptimizer')
          break
        case MENU_TOOLS_FRAME_DURATIONS_OPTIMIZER:
          setActiveDialog('frameDurationsOptimizer')
          break
        case MENU_TOOLS_FRAME_GROUPS_CONVERTER:
          setActiveDialog('frameGroupsConverter')
          break
        case MENU_WINDOW_LOG:
          togglePanel('log')
          break
        case MENU_VIEW_SHOW_PREVIEW:
          togglePanel('preview')
          break
        case MENU_VIEW_SHOW_OBJECTS:
          togglePanel('things')
          break
        case MENU_VIEW_SHOW_SPRITES:
          togglePanel('sprites')
          break
        default:
          break
      }
    },
    [togglePanel, handleCompileCurrent]
  )

  // Listen for menu actions from the main process (native menu clicks)
  useEffect(() => {
    if (!window.api?.menu?.onAction) return
    return window.api.menu.onAction((action: string) => {
      handleAction(action as MenuAction)
    })
  }, [handleAction])

  // Load clipboard action and language from settings on startup
  useEffect(() => {
    if (!window.api?.settings?.load) return
    window.api.settings.load().then((settings) => {
      setRuntimeSettings(settings)
      useEditorStore
        .getState()
        .setClipboardAction(settings.thingListClipboardAction as ClipboardAction)
      // Sync i18n language from persisted settings
      if (settings.language && settings.language !== i18n.language) {
        i18n.changeLanguage(settings.language)
      }
    })
  }, [])

  const closeDialog = useCallback(() => setActiveDialog(null), [])

  return (
    <div className="flex h-full flex-col">
      <Toolbar onAction={handleAction} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Main content area with three resizable panels */}
        <div className="flex-1 overflow-hidden">
          <SplitPane
            farLeft={<PreviewPanel />}
            farLeftWidth={ui.previewContainerWidth}
            showFarLeft={ui.showPreviewPanel}
            onFarLeftWidthChange={(w) => setPanelWidth('preview', w)}
            left={
              <ThingListPanel
                onEditThing={handleEditThing}
                onAction={handleThingListAction}
                pageSize={runtimeSettings.objectsListAmount}
              />
            }
            center={<ThingTypeEditor />}
            right={<SpritePanel pageSize={runtimeSettings.spritesListAmount} />}
            leftWidth={ui.thingListContainerWidth}
            rightWidth={ui.spritesContainerWidth}
            leftMinWidth={190}
            leftMaxWidth={400}
            rightMinWidth={190}
            rightMaxWidth={400}
            showLeft={ui.showThingsPanel}
            showRight={ui.showSpritesPanel}
            onLeftWidthChange={(w) => setPanelWidth('thingList', w)}
            onRightWidthChange={(w) => setPanelWidth('sprites', w)}
          />
        </div>

        {/* Collapsible log panel */}
        {ui.showLogPanel && <LogPanel height={logHeight} onHeightChange={setLogHeight} />}
      </div>

      <StatusBar />

      {/* Project dialogs */}
      <CreateAssetsDialog
        open={activeDialog === 'create'}
        onClose={closeDialog}
        onConfirm={handleCreateConfirm}
        defaultTransparency={true}
      />

      <OpenAssetsDialog
        open={activeDialog === 'open'}
        onClose={closeDialog}
        onConfirm={handleOpenConfirm}
        defaultTransparency={true}
      />

      <CompileAssetsDialog
        open={activeDialog === 'compileAs'}
        onClose={closeDialog}
        onConfirm={handleCompileAsConfirm}
        currentVersion={
          clientInfo
            ? {
                value: clientInfo.clientVersion,
                valueStr: clientInfo.clientVersionStr,
                datSignature: clientInfo.datSignature,
                sprSignature: clientInfo.sprSignature,
                otbVersion: 0
              }
            : null
        }
        currentFeatures={clientInfo?.features ?? null}
        serverItemsLoaded={clientInfo?.otbLoaded ?? false}
      />

      <MergeAssetsDialog
        open={activeDialog === 'merge'}
        onClose={closeDialog}
        onConfirm={handleMergeConfirm}
      />

      <PreferencesDialog
        open={activeDialog === 'preferences'}
        onClose={closeDialog}
        onConfirm={handlePreferencesConfirm}
        otbLoaded={clientInfo?.otbLoaded ?? false}
      />

      <AboutDialog open={activeDialog === 'about'} onClose={closeDialog} />

      <ErrorDialog
        open={activeDialog === 'error'}
        onClose={() => {
          setActiveDialog(null)
          setErrorMessages([])
        }}
        messages={errorMessages}
      />

      <FindDialog
        open={activeDialog === 'find'}
        onClose={closeDialog}
        onFindThings={handleFindThings}
        onFindSprites={handleFindSprites}
        onSelectThing={handleFindSelectThing}
      />

      <ExportDialog
        open={activeDialog === 'export'}
        onClose={closeDialog}
        onConfirm={handleExportConfirm}
        enableObdFormat={true}
        currentCategory={currentCategory}
        currentVersion={
          clientInfo
            ? {
                value: clientInfo.clientVersion,
                valueStr: clientInfo.clientVersionStr,
                datSignature: clientInfo.datSignature,
                sprSignature: clientInfo.sprSignature,
                otbVersion: 0
              }
            : null
        }
      />

      <ImportThingDialog
        open={activeDialog === 'import'}
        onClose={closeDialog}
        onConfirm={handleImportConfirm}
        canReplace={selectedThingIds.length > 0 || selectedThingId !== null}
        replaceCount={
          selectedThingIds.length > 0 ? selectedThingIds.length : selectedThingId !== null ? 1 : 0
        }
      />

      <BulkEditDialog
        open={activeDialog === 'bulkEdit'}
        onClose={handleBulkEditClose}
        onConfirm={handleBulkEditConfirm}
        selectedIds={bulkEditIds}
        category={bulkEditCategory ?? 'item'}
        otbLoaded={clientInfo?.otbLoaded ?? false}
      />

      <AnimationEditorDialog open={activeDialog === 'animationEditor'} onClose={closeDialog} />

      <ObjectViewerDialog open={activeDialog === 'objectViewer'} onClose={closeDialog} />

      <SlicerDialog open={activeDialog === 'slicer'} onClose={closeDialog} />

      <AssetStoreDialog open={activeDialog === 'assetStore'} onClose={closeDialog} />

      <LookTypeGeneratorDialog open={activeDialog === 'lookTypeGenerator'} onClose={closeDialog} />

      <SpritesOptimizerDialog open={activeDialog === 'spritesOptimizer'} onClose={closeDialog} />

      <FrameDurationsOptimizerDialog
        open={activeDialog === 'frameDurationsOptimizer'}
        onClose={closeDialog}
      />

      <FrameGroupsConverterDialog
        open={activeDialog === 'frameGroupsConverter'}
        onClose={closeDialog}
      />

      {/* Close confirmation dialog (unsaved changes) */}
      <Modal
        title={t('labels.confirm')}
        open={activeDialog === 'confirmClose'}
        onClose={handleCloseConfirmCancel}
        width={400}
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <DialogButton label={t('labels.cancel')} onClick={handleCloseConfirmCancel} />
            <DialogButton label={t('labels.no')} onClick={handleCloseConfirmDiscard} />
            <DialogButton label={t('labels.yes')} onClick={handleCloseConfirmSave} primary />
          </div>
        }
      >
        <p className="text-sm text-text-primary">{t('alert.wantToCompile')}</p>
      </Modal>

      {/* Thing switch confirmation dialog (unsaved changes to current object) */}
      <Modal
        title={t('labels.confirm')}
        open={activeDialog === 'confirmThingSwitch'}
        onClose={handleThingSwitchCancel}
        width={400}
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <DialogButton label={t('labels.cancel')} onClick={handleThingSwitchCancel} />
            <DialogButton label={t('labels.no')} onClick={handleThingSwitchDiscard} />
            <DialogButton label={t('labels.yes')} onClick={handleThingSwitchSave} primary />
          </div>
        }
      >
        <p className="text-sm text-text-primary">
          {t('alert.saveChanges', {
            0: currentCategory,
            1: `#${useEditorStore.getState().editingThingData?.thing.id ?? ''}`
          })}
        </p>
      </Modal>

      {/* Recovery dialog (previous session crashed) */}
      <Modal
        title={t('labels.confirm')}
        open={activeDialog === 'recovery'}
        onClose={handleRecoveryDismiss}
        width={440}
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <DialogButton label={t('labels.no')} onClick={handleRecoveryDismiss} />
            <DialogButton label={t('labels.yes')} onClick={handleRecoveryReopen} primary />
          </div>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-text-primary">
          <p>{t('alert.recoveryDetected')}</p>
          {recoveryInfo && (
            <p className="text-text-secondary truncate">{recoveryInfo.datFilePath}</p>
          )}
        </div>
      </Modal>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-bg-secondary p-6 shadow-xl border border-border">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-muted border-t-accent" />
            <span className="text-sm text-text-primary">{loadingLabel || 'Loading...'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
