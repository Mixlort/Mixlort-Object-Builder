/**
 * Main application store for the Object Builder.
 * Manages project state, things by category, sprite count,
 * selection state, UI panel visibility, and application logs.
 *
 * Ported from legacy AS3: ObjectBuilder.mxml centralized state.
 */

import { create } from 'zustand'
import { ThingCategory, type ThingType, type ThingData, type ClientInfo } from '../types'

// ---------------------------------------------------------------------------
// Log entry
// ---------------------------------------------------------------------------

export interface LogEntry {
  id: number
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Project info (renderer-side representation)
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  loaded: boolean
  isTemporary: boolean
  changed: boolean
  fileName: string
  datFilePath: string | null
  sprFilePath: string | null
}

export function createProjectInfo(): ProjectInfo {
  return {
    loaded: false,
    isTemporary: false,
    changed: false,
    fileName: '',
    datFilePath: null,
    sprFilePath: null
  }
}

// ---------------------------------------------------------------------------
// Things collections (arrays per category)
// ---------------------------------------------------------------------------

export interface ThingsMap {
  items: ThingType[]
  outfits: ThingType[]
  effects: ThingType[]
  missiles: ThingType[]
}

function createThingsMap(): ThingsMap {
  return {
    items: [],
    outfits: [],
    effects: [],
    missiles: []
  }
}

function getThingsKey(category: ThingCategory): keyof ThingsMap {
  switch (category) {
    case ThingCategory.ITEM:
      return 'items'
    case ThingCategory.OUTFIT:
      return 'outfits'
    case ThingCategory.EFFECT:
      return 'effects'
    case ThingCategory.MISSILE:
      return 'missiles'
  }
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

export interface UIState {
  showPreviewPanel: boolean
  showThingsPanel: boolean
  showEditorPanel: boolean
  showSpritesPanel: boolean
  showLogPanel: boolean
  previewContainerWidth: number
  thingListContainerWidth: number
  spritesContainerWidth: number
  locked: boolean
}

export function createUIState(): UIState {
  return {
    showPreviewPanel: true,
    showThingsPanel: true,
    showEditorPanel: true,
    showSpritesPanel: true,
    showLogPanel: true,
    previewContainerWidth: 220,
    thingListContainerWidth: 240,
    spritesContainerWidth: 220,
    locked: false
  }
}

// ---------------------------------------------------------------------------
// Panel keys for panel actions
// ---------------------------------------------------------------------------

export type PanelKey = 'preview' | 'things' | 'editor' | 'sprites' | 'log'
export type PanelWidthKey = 'preview' | 'thingList' | 'sprites'

// ---------------------------------------------------------------------------
// App state + actions
// ---------------------------------------------------------------------------

export interface AppState {
  // Project
  project: ProjectInfo
  clientInfo: ClientInfo | null

  // Things by category
  things: ThingsMap
  currentCategory: ThingCategory

  // Selection
  selectedThingId: number | null
  selectedThingIds: number[]
  selectedThingData: ThingData | null

  // Sprites
  spriteCount: number

  // UI
  ui: UIState

  // Logs
  logs: LogEntry[]
}

export interface AppActions {
  // Project
  setProjectLoaded(info: Partial<ProjectInfo> & { clientInfo: ClientInfo }): void
  setProjectChanged(changed: boolean): void
  unloadProject(): void

  // Client info
  setClientInfo(info: ClientInfo): void

  // Things
  setThings(category: ThingCategory, things: ThingType[]): void
  addThing(category: ThingCategory, thing: ThingType): void
  updateThing(category: ThingCategory, id: number, thing: ThingType): void
  removeThing(category: ThingCategory, id: number): void

  // Category
  setCurrentCategory(category: ThingCategory): void

  // Selection
  selectThing(id: number | null): void
  selectThings(ids: number[]): void
  setSelectedThingData(data: ThingData | null): void

  // Sprites
  setSpriteCount(count: number): void

  // UI
  setPanelVisible(panel: PanelKey, visible: boolean): void
  togglePanel(panel: PanelKey): void
  setPanelWidth(panel: PanelWidthKey, width: number): void
  setLocked(locked: boolean): void
  setUIState(state: Partial<UIState>): void

  // Logs
  addLog(level: LogEntry['level'], message: string): void
  clearLogs(): void

  // Getters
  getThingsByCategory(category: ThingCategory): ThingType[]
  getThingById(category: ThingCategory, id: number): ThingType | undefined
  getCategoryIdRange(category: ThingCategory): { min: number; max: number } | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let nextLogId = 1

function panelStateKey(panel: PanelKey): keyof UIState {
  switch (panel) {
    case 'preview':
      return 'showPreviewPanel'
    case 'things':
      return 'showThingsPanel'
    case 'editor':
      return 'showEditorPanel'
    case 'sprites':
      return 'showSpritesPanel'
    case 'log':
      return 'showLogPanel'
  }
}

function panelWidthKey(panel: PanelWidthKey): keyof UIState {
  switch (panel) {
    case 'preview':
      return 'previewContainerWidth'
    case 'thingList':
      return 'thingListContainerWidth'
    case 'sprites':
      return 'spritesContainerWidth'
  }
}

/**
 * Returns the min ID for a category based on ClientInfo.
 * Items start at minItemId (typically 100), others at 1.
 */
function getMinId(clientInfo: ClientInfo, category: ThingCategory): number {
  switch (category) {
    case ThingCategory.ITEM:
      return clientInfo.minItemId
    case ThingCategory.OUTFIT:
      return clientInfo.minOutfitId
    case ThingCategory.EFFECT:
      return clientInfo.minEffectId
    case ThingCategory.MISSILE:
      return clientInfo.minMissileId
  }
}

function getMaxId(clientInfo: ClientInfo, category: ThingCategory): number {
  switch (category) {
    case ThingCategory.ITEM:
      return clientInfo.maxItemId
    case ThingCategory.OUTFIT:
      return clientInfo.maxOutfitId
    case ThingCategory.EFFECT:
      return clientInfo.maxEffectId
    case ThingCategory.MISSILE:
      return clientInfo.maxMissileId
  }
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  // --- Initial state ---
  project: createProjectInfo(),
  clientInfo: null,
  things: createThingsMap(),
  currentCategory: ThingCategory.ITEM,
  selectedThingId: null,
  selectedThingIds: [],
  selectedThingData: null,
  spriteCount: 0,
  ui: createUIState(),
  logs: [],

  // --- Project actions ---

  setProjectLoaded(info) {
    set((state) => ({
      project: {
        ...state.project,
        loaded: true,
        ...info
      },
      clientInfo: info.clientInfo
    }))
  },

  setProjectChanged(changed) {
    set((state) => ({
      project: { ...state.project, changed }
    }))
  },

  unloadProject() {
    nextLogId = 1
    set({
      project: createProjectInfo(),
      clientInfo: null,
      things: createThingsMap(),
      currentCategory: ThingCategory.ITEM,
      selectedThingId: null,
      selectedThingIds: [],
      selectedThingData: null,
      spriteCount: 0
    })
  },

  // --- Client info ---

  setClientInfo(info) {
    set({ clientInfo: info })
  },

  // --- Things actions ---

  setThings(category, things) {
    const key = getThingsKey(category)
    set((state) => ({
      things: { ...state.things, [key]: things }
    }))
  },

  addThing(category, thing) {
    const key = getThingsKey(category)
    const normalizedThing = { ...thing, category }
    set((state) => ({
      things: {
        ...state.things,
        [key]: [...state.things[key], normalizedThing].sort((a, b) => a.id - b.id)
      }
    }))
  },

  updateThing(category, id, thing) {
    const key = getThingsKey(category)
    const normalizedThing = { ...thing, id, category }
    set((state) => ({
      things: {
        ...state.things,
        [key]: state.things[key].map((t) => (t.id === id ? normalizedThing : t))
      }
    }))
  },

  removeThing(category, id) {
    const key = getThingsKey(category)
    set((state) => ({
      things: {
        ...state.things,
        [key]: state.things[key].filter((t) => t.id !== id)
      }
    }))
  },

  // --- Category ---

  setCurrentCategory(category) {
    set({
      currentCategory: category,
      selectedThingId: null,
      selectedThingIds: [],
      selectedThingData: null
    })
  },

  // --- Selection ---

  selectThing(id) {
    set({
      selectedThingId: id,
      selectedThingIds: id !== null ? [id] : []
    })
  },

  selectThings(ids) {
    set({
      selectedThingIds: ids,
      selectedThingId: ids.length > 0 ? ids[ids.length - 1] : null
    })
  },

  setSelectedThingData(data) {
    set({ selectedThingData: data })
  },

  // --- Sprites ---

  setSpriteCount(count) {
    set({ spriteCount: count })
  },

  // --- UI actions ---

  setPanelVisible(panel, visible) {
    const key = panelStateKey(panel)
    set((state) => ({
      ui: { ...state.ui, [key]: visible }
    }))
  },

  togglePanel(panel) {
    const key = panelStateKey(panel)
    set((state) => ({
      ui: { ...state.ui, [key]: !state.ui[key] }
    }))
  },

  setPanelWidth(panel, width) {
    const key = panelWidthKey(panel)
    set((state) => ({
      ui: { ...state.ui, [key]: width }
    }))
  },

  setLocked(locked) {
    set((state) => ({
      ui: { ...state.ui, locked }
    }))
  },

  setUIState(partialUI) {
    set((state) => ({
      ui: { ...state.ui, ...partialUI }
    }))
  },

  // --- Log actions ---

  addLog(level, message) {
    const entry: LogEntry = {
      id: nextLogId++,
      level,
      message,
      timestamp: Date.now()
    }
    set((state) => ({
      logs: [...state.logs, entry]
    }))
  },

  clearLogs() {
    set({ logs: [] })
  },

  // --- Getters ---

  getThingsByCategory(category) {
    const key = getThingsKey(category)
    return get().things[key]
  },

  getThingById(category, id) {
    const { clientInfo, things } = get()
    const key = getThingsKey(category)
    const arr = things[key]

    if (!clientInfo || arr.length === 0) return undefined

    const minId = getMinId(clientInfo, category)
    const index = id - minId
    if (index < 0 || index >= arr.length) return undefined
    return arr[index]
  },

  getCategoryIdRange(category) {
    const { clientInfo } = get()
    if (!clientInfo) return null

    return {
      min: getMinId(clientInfo, category),
      max: getMaxId(clientInfo, category)
    }
  }
}))

// ---------------------------------------------------------------------------
// Reset helper (for testing)
// ---------------------------------------------------------------------------

export function resetAppStore(): void {
  nextLogId = 1
  useAppStore.setState({
    project: createProjectInfo(),
    clientInfo: null,
    things: createThingsMap(),
    currentCategory: ThingCategory.ITEM,
    selectedThingId: null,
    selectedThingIds: [],
    selectedThingData: null,
    spriteCount: 0,
    ui: createUIState(),
    logs: []
  })
}

// ---------------------------------------------------------------------------
// Selectors (for use with useAppStore(selector))
// ---------------------------------------------------------------------------

export const selectProject = (state: AppState) => state.project
export const selectClientInfo = (state: AppState) => state.clientInfo
export const selectThings = (state: AppState) => state.things
export const selectCurrentCategory = (state: AppState) => state.currentCategory
export const selectSelectedThingId = (state: AppState) => state.selectedThingId
export const selectSelectedThingIds = (state: AppState) => state.selectedThingIds
export const selectSelectedThingData = (state: AppState) => state.selectedThingData
export const selectSpriteCount = (state: AppState) => state.spriteCount
export const selectUI = (state: AppState) => state.ui
export const selectLogs = (state: AppState) => state.logs
export const selectIsProjectLoaded = (state: AppState) => state.project.loaded
export const selectIsProjectChanged = (state: AppState) => state.project.changed
