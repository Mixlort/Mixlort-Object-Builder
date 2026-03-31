/**
 * Tests for the main application store.
 * Covers project state, things management, selection,
 * sprite count, UI state, logs, and getters.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, resetAppStore, createProjectInfo, createUIState } from '../use-app-store'
import {
  ThingCategory,
  type ThingType,
  type ThingData,
  type ClientInfo,
  createClientInfo,
  createThingType,
  FrameGroupType,
  type SpriteData
} from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClientInfo(overrides: Partial<ClientInfo> = {}): ClientInfo {
  return {
    ...createClientInfo(),
    clientVersion: 1098,
    clientVersionStr: '10.98',
    minItemId: 100,
    maxItemId: 200,
    minOutfitId: 1,
    maxOutfitId: 50,
    minEffectId: 1,
    maxEffectId: 30,
    minMissileId: 1,
    maxMissileId: 20,
    minSpriteId: 1,
    maxSpriteId: 5000,
    loaded: true,
    ...overrides
  }
}

function makeThing(id: number, category: ThingCategory = ThingCategory.ITEM): ThingType {
  const thing = createThingType()
  thing.id = id
  thing.category = category
  return thing
}

function makeThingData(id: number): ThingData {
  const thing = makeThing(id)
  return {
    obdVersion: 300,
    clientVersion: 1098,
    thing,
    sprites: new Map<FrameGroupType, SpriteData[]>(),
    xmlAttributes: null
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAppStore()
})

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

describe('Factory helpers', () => {
  it('createProjectInfo returns correct defaults', () => {
    const info = createProjectInfo()
    expect(info.loaded).toBe(false)
    expect(info.isTemporary).toBe(false)
    expect(info.changed).toBe(false)
    expect(info.fileName).toBe('')
    expect(info.datFilePath).toBeNull()
    expect(info.sprFilePath).toBeNull()
  })

  it('createUIState returns correct defaults', () => {
    const ui = createUIState()
    expect(ui.showPreviewPanel).toBe(true)
    expect(ui.showThingsPanel).toBe(true)
    expect(ui.showSpritesPanel).toBe(true)
    expect(ui.showLogPanel).toBe(true)
    expect(ui.previewContainerWidth).toBe(220)
    expect(ui.thingListContainerWidth).toBe(240)
    expect(ui.spritesContainerWidth).toBe(220)
    expect(ui.locked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('Initial state', () => {
  it('has default project state', () => {
    const { project } = useAppStore.getState()
    expect(project.loaded).toBe(false)
    expect(project.isTemporary).toBe(false)
    expect(project.changed).toBe(false)
    expect(project.fileName).toBe('')
  })

  it('has null clientInfo', () => {
    expect(useAppStore.getState().clientInfo).toBeNull()
  })

  it('has empty things for all categories', () => {
    const { things } = useAppStore.getState()
    expect(things.items).toHaveLength(0)
    expect(things.outfits).toHaveLength(0)
    expect(things.effects).toHaveLength(0)
    expect(things.missiles).toHaveLength(0)
  })

  it('defaults to ITEM category', () => {
    expect(useAppStore.getState().currentCategory).toBe(ThingCategory.ITEM)
  })

  it('has no selection', () => {
    const state = useAppStore.getState()
    expect(state.selectedThingId).toBeNull()
    expect(state.selectedThingIds).toHaveLength(0)
    expect(state.selectedThingData).toBeNull()
  })

  it('has zero sprite count', () => {
    expect(useAppStore.getState().spriteCount).toBe(0)
  })

  it('has default UI state', () => {
    const { ui } = useAppStore.getState()
    expect(ui.showPreviewPanel).toBe(true)
    expect(ui.showThingsPanel).toBe(true)
    expect(ui.showSpritesPanel).toBe(true)
    expect(ui.showLogPanel).toBe(true)
    expect(ui.locked).toBe(false)
  })

  it('has empty logs', () => {
    expect(useAppStore.getState().logs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Project actions
// ---------------------------------------------------------------------------

describe('Project actions', () => {
  it('setProjectLoaded sets project and clientInfo', () => {
    const clientInfo = makeClientInfo()
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      fileName: 'Tibia',
      datFilePath: '/path/Tibia.dat',
      sprFilePath: '/path/Tibia.spr',
      isTemporary: false,
      changed: false,
      clientInfo
    })

    const state = useAppStore.getState()
    expect(state.project.loaded).toBe(true)
    expect(state.project.fileName).toBe('Tibia')
    expect(state.project.datFilePath).toBe('/path/Tibia.dat')
    expect(state.project.sprFilePath).toBe('/path/Tibia.spr')
    expect(state.clientInfo).toEqual(clientInfo)
  })

  it('setProjectLoaded with partial info merges with existing', () => {
    useAppStore.getState().setProjectLoaded({
      fileName: 'Test',
      clientInfo: makeClientInfo()
    })

    const state = useAppStore.getState()
    expect(state.project.loaded).toBe(true)
    expect(state.project.fileName).toBe('Test')
    // Other fields remain at defaults
    expect(state.project.isTemporary).toBe(false)
  })

  it('setProjectChanged updates changed flag', () => {
    useAppStore.getState().setProjectChanged(true)
    expect(useAppStore.getState().project.changed).toBe(true)

    useAppStore.getState().setProjectChanged(false)
    expect(useAppStore.getState().project.changed).toBe(false)
  })

  it('unloadProject resets all project-related state', () => {
    const clientInfo = makeClientInfo()
    const store = useAppStore.getState()

    // Load project with things and selection
    store.setProjectLoaded({ fileName: 'Test', clientInfo })
    store.setThings(ThingCategory.ITEM, [makeThing(100), makeThing(101)])
    store.setSpriteCount(1000)
    store.selectThing(100)

    // Unload
    useAppStore.getState().unloadProject()

    const state = useAppStore.getState()
    expect(state.project.loaded).toBe(false)
    expect(state.project.fileName).toBe('')
    expect(state.clientInfo).toBeNull()
    expect(state.things.items).toHaveLength(0)
    expect(state.spriteCount).toBe(0)
    expect(state.selectedThingId).toBeNull()
    expect(state.selectedThingIds).toHaveLength(0)
    expect(state.selectedThingData).toBeNull()
    expect(state.currentCategory).toBe(ThingCategory.ITEM)
  })

  it('unloadProject preserves UI state', () => {
    useAppStore.getState().setPanelVisible('preview', false)
    useAppStore.getState().unloadProject()

    expect(useAppStore.getState().ui.showPreviewPanel).toBe(false)
  })

  it('unloadProject preserves logs', () => {
    useAppStore.getState().addLog('info', 'test message')
    // Note: unloadProject does NOT clear logs (they're app-level, not project-level)
    // Actually, looking at the implementation, unloadProject doesn't set logs
    // Let's just verify the logs state
    const logsBefore = useAppStore.getState().logs.length
    useAppStore.getState().unloadProject()
    expect(useAppStore.getState().logs.length).toBe(logsBefore)
  })
})

// ---------------------------------------------------------------------------
// Client info
// ---------------------------------------------------------------------------

describe('Client info', () => {
  it('setClientInfo sets client info', () => {
    const info = makeClientInfo({ clientVersion: 1200 })
    useAppStore.getState().setClientInfo(info)

    expect(useAppStore.getState().clientInfo).toEqual(info)
  })

  it('setClientInfo replaces previous info', () => {
    useAppStore.getState().setClientInfo(makeClientInfo({ clientVersion: 1000 }))
    useAppStore.getState().setClientInfo(makeClientInfo({ clientVersion: 1200 }))

    expect(useAppStore.getState().clientInfo?.clientVersion).toBe(1200)
  })
})

// ---------------------------------------------------------------------------
// Things actions
// ---------------------------------------------------------------------------

describe('Things actions', () => {
  it('setThings sets items for a category', () => {
    const items = [makeThing(100), makeThing(101), makeThing(102)]
    useAppStore.getState().setThings(ThingCategory.ITEM, items)

    expect(useAppStore.getState().things.items).toHaveLength(3)
    expect(useAppStore.getState().things.items[0].id).toBe(100)
  })

  it('setThings replaces existing things', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(200), makeThing(201)])

    expect(useAppStore.getState().things.items).toHaveLength(2)
    expect(useAppStore.getState().things.items[0].id).toBe(200)
  })

  it('setThings works for each category', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setThings(ThingCategory.OUTFIT, [makeThing(1, ThingCategory.OUTFIT)])
    useAppStore.getState().setThings(ThingCategory.EFFECT, [makeThing(1, ThingCategory.EFFECT)])
    useAppStore.getState().setThings(ThingCategory.MISSILE, [makeThing(1, ThingCategory.MISSILE)])

    const { things } = useAppStore.getState()
    expect(things.items).toHaveLength(1)
    expect(things.outfits).toHaveLength(1)
    expect(things.effects).toHaveLength(1)
    expect(things.missiles).toHaveLength(1)
  })

  it('setThings for one category does not affect others', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setThings(ThingCategory.OUTFIT, [makeThing(1, ThingCategory.OUTFIT)])

    expect(useAppStore.getState().things.items).toHaveLength(1)
    expect(useAppStore.getState().things.outfits).toHaveLength(1)
    expect(useAppStore.getState().things.effects).toHaveLength(0)
  })

  it('addThing appends to a category', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().addThing(ThingCategory.ITEM, makeThing(101))

    expect(useAppStore.getState().things.items).toHaveLength(2)
    expect(useAppStore.getState().things.items[1].id).toBe(101)
  })

  it('addThing normalizes category and keeps the array sorted by id', () => {
    useAppStore.getState().setThings(ThingCategory.MISSILE, [makeThing(2, ThingCategory.MISSILE)])

    const wrongCategory = makeThing(1, ThingCategory.ITEM)
    useAppStore.getState().addThing(ThingCategory.MISSILE, wrongCategory)

    const missiles = useAppStore.getState().things.missiles
    expect(missiles.map((thing) => thing.id)).toEqual([1, 2])
    expect(missiles[0].category).toBe(ThingCategory.MISSILE)
  })

  it('updateThing replaces a thing by ID', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100), makeThing(101)])

    const updated = makeThing(101)
    updated.isGround = true
    updated.groundSpeed = 150
    useAppStore.getState().updateThing(ThingCategory.ITEM, 101, updated)

    const items = useAppStore.getState().things.items
    expect(items[1].isGround).toBe(true)
    expect(items[1].groundSpeed).toBe(150)
    // First item unchanged
    expect(items[0].isGround).toBe(false)
  })

  it('updateThing normalizes the target id and category', () => {
    useAppStore.getState().setThings(ThingCategory.EFFECT, [makeThing(1, ThingCategory.EFFECT)])

    const updated = makeThing(999, ThingCategory.ITEM)
    useAppStore.getState().updateThing(ThingCategory.EFFECT, 1, updated)

    const effects = useAppStore.getState().things.effects
    expect(effects[0].id).toBe(1)
    expect(effects[0].category).toBe(ThingCategory.EFFECT)
  })

  it('updateThing does nothing if ID not found', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().updateThing(ThingCategory.ITEM, 999, makeThing(999))

    expect(useAppStore.getState().things.items).toHaveLength(1)
    expect(useAppStore.getState().things.items[0].id).toBe(100)
  })

  it('removeThing removes by ID', () => {
    useAppStore
      .getState()
      .setThings(ThingCategory.ITEM, [makeThing(100), makeThing(101), makeThing(102)])
    useAppStore.getState().removeThing(ThingCategory.ITEM, 101)

    const items = useAppStore.getState().things.items
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe(100)
    expect(items[1].id).toBe(102)
  })

  it('removeThing does nothing if ID not found', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().removeThing(ThingCategory.ITEM, 999)

    expect(useAppStore.getState().things.items).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Category actions
// ---------------------------------------------------------------------------

describe('Category actions', () => {
  it('setCurrentCategory changes category', () => {
    useAppStore.getState().setCurrentCategory(ThingCategory.OUTFIT)
    expect(useAppStore.getState().currentCategory).toBe(ThingCategory.OUTFIT)
  })

  it('setCurrentCategory clears selection', () => {
    useAppStore.getState().selectThing(100)
    useAppStore.getState().setSelectedThingData(makeThingData(100))

    useAppStore.getState().setCurrentCategory(ThingCategory.OUTFIT)

    expect(useAppStore.getState().selectedThingId).toBeNull()
    expect(useAppStore.getState().selectedThingIds).toHaveLength(0)
    expect(useAppStore.getState().selectedThingData).toBeNull()
  })

  it('setCurrentCategory preserves things', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setCurrentCategory(ThingCategory.OUTFIT)

    expect(useAppStore.getState().things.items).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Selection actions
// ---------------------------------------------------------------------------

describe('Selection actions', () => {
  it('selectThing sets single selection', () => {
    useAppStore.getState().selectThing(100)

    const state = useAppStore.getState()
    expect(state.selectedThingId).toBe(100)
    expect(state.selectedThingIds).toEqual([100])
  })

  it('selectThing with null clears selection', () => {
    useAppStore.getState().selectThing(100)
    useAppStore.getState().selectThing(null)

    const state = useAppStore.getState()
    expect(state.selectedThingId).toBeNull()
    expect(state.selectedThingIds).toHaveLength(0)
  })

  it('selectThings sets multiple selection', () => {
    useAppStore.getState().selectThings([100, 101, 102])

    const state = useAppStore.getState()
    expect(state.selectedThingIds).toEqual([100, 101, 102])
    // Last ID becomes primary selection
    expect(state.selectedThingId).toBe(102)
  })

  it('selectThings with empty array clears selection', () => {
    useAppStore.getState().selectThings([100, 101])
    useAppStore.getState().selectThings([])

    const state = useAppStore.getState()
    expect(state.selectedThingIds).toHaveLength(0)
    expect(state.selectedThingId).toBeNull()
  })

  it('setSelectedThingData sets thing data', () => {
    const data = makeThingData(100)
    useAppStore.getState().setSelectedThingData(data)

    expect(useAppStore.getState().selectedThingData).toEqual(data)
  })

  it('setSelectedThingData with null clears data', () => {
    useAppStore.getState().setSelectedThingData(makeThingData(100))
    useAppStore.getState().setSelectedThingData(null)

    expect(useAppStore.getState().selectedThingData).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

describe('Sprites', () => {
  it('setSpriteCount sets count', () => {
    useAppStore.getState().setSpriteCount(5000)
    expect(useAppStore.getState().spriteCount).toBe(5000)
  })

  it('setSpriteCount can be set to 0', () => {
    useAppStore.getState().setSpriteCount(5000)
    useAppStore.getState().setSpriteCount(0)
    expect(useAppStore.getState().spriteCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// UI actions
// ---------------------------------------------------------------------------

describe('UI actions', () => {
  it('setPanelVisible sets panel visibility', () => {
    useAppStore.getState().setPanelVisible('preview', false)
    expect(useAppStore.getState().ui.showPreviewPanel).toBe(false)

    useAppStore.getState().setPanelVisible('preview', true)
    expect(useAppStore.getState().ui.showPreviewPanel).toBe(true)
  })

  it('setPanelVisible works for all panels', () => {
    useAppStore.getState().setPanelVisible('preview', false)
    useAppStore.getState().setPanelVisible('things', false)
    useAppStore.getState().setPanelVisible('sprites', false)
    useAppStore.getState().setPanelVisible('log', false)

    const { ui } = useAppStore.getState()
    expect(ui.showPreviewPanel).toBe(false)
    expect(ui.showThingsPanel).toBe(false)
    expect(ui.showSpritesPanel).toBe(false)
    expect(ui.showLogPanel).toBe(false)
  })

  it('togglePanel toggles visibility', () => {
    expect(useAppStore.getState().ui.showPreviewPanel).toBe(true)

    useAppStore.getState().togglePanel('preview')
    expect(useAppStore.getState().ui.showPreviewPanel).toBe(false)

    useAppStore.getState().togglePanel('preview')
    expect(useAppStore.getState().ui.showPreviewPanel).toBe(true)
  })

  it('togglePanel works for all panels', () => {
    useAppStore.getState().togglePanel('preview')
    useAppStore.getState().togglePanel('things')
    useAppStore.getState().togglePanel('sprites')
    useAppStore.getState().togglePanel('log')

    const { ui } = useAppStore.getState()
    expect(ui.showPreviewPanel).toBe(false)
    expect(ui.showThingsPanel).toBe(false)
    expect(ui.showSpritesPanel).toBe(false)
    expect(ui.showLogPanel).toBe(false)
  })

  it('setPanelWidth sets panel width', () => {
    useAppStore.getState().setPanelWidth('preview', 300)
    expect(useAppStore.getState().ui.previewContainerWidth).toBe(300)

    useAppStore.getState().setPanelWidth('thingList', 350)
    expect(useAppStore.getState().ui.thingListContainerWidth).toBe(350)

    useAppStore.getState().setPanelWidth('sprites', 280)
    expect(useAppStore.getState().ui.spritesContainerWidth).toBe(280)
  })

  it('setLocked sets locked state', () => {
    useAppStore.getState().setLocked(true)
    expect(useAppStore.getState().ui.locked).toBe(true)

    useAppStore.getState().setLocked(false)
    expect(useAppStore.getState().ui.locked).toBe(false)
  })

  it('setUIState merges partial UI state', () => {
    useAppStore.getState().setUIState({
      showPreviewPanel: false,
      previewContainerWidth: 300
    })

    const { ui } = useAppStore.getState()
    expect(ui.showPreviewPanel).toBe(false)
    expect(ui.previewContainerWidth).toBe(300)
    // Others unchanged
    expect(ui.showThingsPanel).toBe(true)
    expect(ui.thingListContainerWidth).toBe(240)
  })
})

// ---------------------------------------------------------------------------
// Log actions
// ---------------------------------------------------------------------------

describe('Log actions', () => {
  it('addLog appends a log entry', () => {
    useAppStore.getState().addLog('info', 'Test message')

    const logs = useAppStore.getState().logs
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('info')
    expect(logs[0].message).toBe('Test message')
    expect(logs[0].id).toBe(1)
    expect(logs[0].timestamp).toBeGreaterThan(0)
  })

  it('addLog assigns incrementing IDs', () => {
    useAppStore.getState().addLog('info', 'First')
    useAppStore.getState().addLog('warning', 'Second')
    useAppStore.getState().addLog('error', 'Third')

    const logs = useAppStore.getState().logs
    expect(logs).toHaveLength(3)
    expect(logs[0].id).toBe(1)
    expect(logs[1].id).toBe(2)
    expect(logs[2].id).toBe(3)
  })

  it('addLog supports all log levels', () => {
    useAppStore.getState().addLog('info', 'Info')
    useAppStore.getState().addLog('warning', 'Warning')
    useAppStore.getState().addLog('error', 'Error')

    const logs = useAppStore.getState().logs
    expect(logs[0].level).toBe('info')
    expect(logs[1].level).toBe('warning')
    expect(logs[2].level).toBe('error')
  })

  it('clearLogs removes all logs', () => {
    useAppStore.getState().addLog('info', 'First')
    useAppStore.getState().addLog('info', 'Second')
    useAppStore.getState().clearLogs()

    expect(useAppStore.getState().logs).toHaveLength(0)
  })

  it('logs persist across other state changes', () => {
    useAppStore.getState().addLog('info', 'Before')
    useAppStore.getState().setProjectChanged(true)
    useAppStore.getState().addLog('info', 'After')

    expect(useAppStore.getState().logs).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

describe('Getters', () => {
  it('getThingsByCategory returns things for a category', () => {
    const items = [makeThing(100), makeThing(101)]
    useAppStore.getState().setThings(ThingCategory.ITEM, items)

    const result = useAppStore.getState().getThingsByCategory(ThingCategory.ITEM)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(100)
  })

  it('getThingsByCategory returns empty array when no things', () => {
    const result = useAppStore.getState().getThingsByCategory(ThingCategory.OUTFIT)
    expect(result).toHaveLength(0)
  })

  it('getThingById returns thing by ID using clientInfo offset', () => {
    const clientInfo = makeClientInfo({ minItemId: 100 })
    useAppStore.getState().setClientInfo(clientInfo)
    useAppStore
      .getState()
      .setThings(ThingCategory.ITEM, [makeThing(100), makeThing(101), makeThing(102)])

    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 100)?.id).toBe(100)
    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 101)?.id).toBe(101)
    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 102)?.id).toBe(102)
  })

  it('getThingById returns undefined for out-of-range ID', () => {
    const clientInfo = makeClientInfo({ minItemId: 100 })
    useAppStore.getState().setClientInfo(clientInfo)
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])

    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 99)).toBeUndefined()
    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 101)).toBeUndefined()
  })

  it('getThingById returns undefined when no clientInfo', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])

    expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 100)).toBeUndefined()
  })

  it('getThingById works for outfits (minId = 1)', () => {
    const clientInfo = makeClientInfo({ minOutfitId: 1 })
    useAppStore.getState().setClientInfo(clientInfo)
    useAppStore
      .getState()
      .setThings(ThingCategory.OUTFIT, [
        makeThing(1, ThingCategory.OUTFIT),
        makeThing(2, ThingCategory.OUTFIT)
      ])

    expect(useAppStore.getState().getThingById(ThingCategory.OUTFIT, 1)?.id).toBe(1)
    expect(useAppStore.getState().getThingById(ThingCategory.OUTFIT, 2)?.id).toBe(2)
  })

  it('getCategoryIdRange returns range from clientInfo', () => {
    useAppStore.getState().setClientInfo(makeClientInfo())

    const itemRange = useAppStore.getState().getCategoryIdRange(ThingCategory.ITEM)
    expect(itemRange).toEqual({ min: 100, max: 200 })

    const outfitRange = useAppStore.getState().getCategoryIdRange(ThingCategory.OUTFIT)
    expect(outfitRange).toEqual({ min: 1, max: 50 })

    const effectRange = useAppStore.getState().getCategoryIdRange(ThingCategory.EFFECT)
    expect(effectRange).toEqual({ min: 1, max: 30 })

    const missileRange = useAppStore.getState().getCategoryIdRange(ThingCategory.MISSILE)
    expect(missileRange).toEqual({ min: 1, max: 20 })
  })

  it('getCategoryIdRange returns null when no clientInfo', () => {
    expect(useAppStore.getState().getCategoryIdRange(ThingCategory.ITEM)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('Reset', () => {
  it('resetAppStore restores all defaults', () => {
    // Modify everything
    const clientInfo = makeClientInfo()
    useAppStore.getState().setProjectLoaded({ fileName: 'Test', clientInfo })
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setCurrentCategory(ThingCategory.OUTFIT)
    useAppStore.getState().selectThing(100)
    useAppStore.getState().setSpriteCount(5000)
    useAppStore.getState().setPanelVisible('preview', false)
    useAppStore.getState().addLog('info', 'Test')

    // Reset
    resetAppStore()

    const state = useAppStore.getState()
    expect(state.project.loaded).toBe(false)
    expect(state.clientInfo).toBeNull()
    expect(state.things.items).toHaveLength(0)
    expect(state.currentCategory).toBe(ThingCategory.ITEM)
    expect(state.selectedThingId).toBeNull()
    expect(state.spriteCount).toBe(0)
    expect(state.ui.showPreviewPanel).toBe(true)
    expect(state.logs).toHaveLength(0)
  })

  it('resetAppStore resets log IDs', () => {
    useAppStore.getState().addLog('info', 'First')
    useAppStore.getState().addLog('info', 'Second')

    resetAppStore()

    useAppStore.getState().addLog('info', 'After reset')
    expect(useAppStore.getState().logs[0].id).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe('Selectors', () => {
  it('selectors extract correct state slices', async () => {
    const {
      selectProject,
      selectClientInfo,
      selectThings,
      selectCurrentCategory,
      selectSelectedThingId,
      selectSelectedThingIds,
      selectSelectedThingData,
      selectSpriteCount,
      selectUI,
      selectLogs,
      selectIsProjectLoaded,
      selectIsProjectChanged
    } = await import('../use-app-store')

    const clientInfo = makeClientInfo()
    useAppStore.getState().setProjectLoaded({ fileName: 'Test', clientInfo })
    useAppStore.getState().setProjectChanged(true)
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().selectThing(100)
    useAppStore.getState().setSpriteCount(500)
    useAppStore.getState().addLog('info', 'Test')

    const state = useAppStore.getState()

    expect(selectProject(state)).toBe(state.project)
    expect(selectClientInfo(state)).toBe(state.clientInfo)
    expect(selectThings(state)).toBe(state.things)
    expect(selectCurrentCategory(state)).toBe(ThingCategory.ITEM)
    expect(selectSelectedThingId(state)).toBe(100)
    expect(selectSelectedThingIds(state)).toEqual([100])
    expect(selectSelectedThingData(state)).toBeNull()
    expect(selectSpriteCount(state)).toBe(500)
    expect(selectUI(state)).toBe(state.ui)
    expect(selectLogs(state)).toBe(state.logs)
    expect(selectIsProjectLoaded(state)).toBe(true)
    expect(selectIsProjectChanged(state)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration / complex scenarios
// ---------------------------------------------------------------------------

describe('Integration scenarios', () => {
  it('full project load workflow', () => {
    const clientInfo = makeClientInfo()

    // 1. Load project
    useAppStore.getState().setProjectLoaded({
      fileName: 'Tibia',
      datFilePath: '/data/Tibia.dat',
      sprFilePath: '/data/Tibia.spr',
      isTemporary: false,
      clientInfo
    })

    // 2. Set things
    const items = Array.from({ length: 101 }, (_, i) => makeThing(100 + i))
    useAppStore.getState().setThings(ThingCategory.ITEM, items)

    const outfits = Array.from({ length: 50 }, (_, i) => makeThing(1 + i, ThingCategory.OUTFIT))
    useAppStore.getState().setThings(ThingCategory.OUTFIT, outfits)

    // 3. Set sprite count
    useAppStore.getState().setSpriteCount(5000)

    // 4. Select first item
    useAppStore.getState().selectThing(100)

    // 5. Log
    useAppStore.getState().addLog('info', 'Project loaded: Tibia v10.98')

    // Verify
    const state = useAppStore.getState()
    expect(state.project.loaded).toBe(true)
    expect(state.things.items).toHaveLength(101)
    expect(state.things.outfits).toHaveLength(50)
    expect(state.spriteCount).toBe(5000)
    expect(state.selectedThingId).toBe(100)
    expect(state.logs).toHaveLength(1)
    expect(state.getThingById(ThingCategory.ITEM, 150)?.id).toBe(150)
    expect(state.getCategoryIdRange(ThingCategory.ITEM)).toEqual({ min: 100, max: 200 })
  })

  it('category switch preserves things and clears selection', () => {
    const clientInfo = makeClientInfo()
    useAppStore.getState().setProjectLoaded({ fileName: 'Test', clientInfo })

    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().setThings(ThingCategory.OUTFIT, [makeThing(1, ThingCategory.OUTFIT)])

    // Select item, then switch to outfit
    useAppStore.getState().selectThing(100)
    useAppStore.getState().setCurrentCategory(ThingCategory.OUTFIT)

    const state = useAppStore.getState()
    expect(state.currentCategory).toBe(ThingCategory.OUTFIT)
    expect(state.selectedThingId).toBeNull()
    expect(state.things.items).toHaveLength(1) // Items preserved
    expect(state.things.outfits).toHaveLength(1)
  })

  it('multiple add/remove operations', () => {
    useAppStore.getState().setThings(ThingCategory.ITEM, [makeThing(100)])
    useAppStore.getState().addThing(ThingCategory.ITEM, makeThing(101))
    useAppStore.getState().addThing(ThingCategory.ITEM, makeThing(102))
    useAppStore.getState().removeThing(ThingCategory.ITEM, 101)

    const items = useAppStore.getState().things.items
    expect(items).toHaveLength(2)
    expect(items.map((t) => t.id)).toEqual([100, 102])
  })

  it('UI state changes are independent of project state', () => {
    useAppStore.getState().setPanelVisible('preview', false)
    useAppStore.getState().setPanelWidth('thingList', 400)
    useAppStore.getState().setLocked(true)

    // Load project
    useAppStore.getState().setProjectLoaded({
      fileName: 'Test',
      clientInfo: makeClientInfo()
    })

    // UI state unchanged
    const { ui } = useAppStore.getState()
    expect(ui.showPreviewPanel).toBe(false)
    expect(ui.thingListContainerWidth).toBe(400)
    expect(ui.locked).toBe(true)
  })
})
