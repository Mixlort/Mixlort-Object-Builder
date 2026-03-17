// @vitest-environment node

/**
 * Tests for the menu service.
 * Tests cover menu building, state management, action dispatch,
 * and dynamic enable/disable based on project state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MENU_ACTIONS,
  MENU_FILE_NEW,
  MENU_VIEW_SHOW_PREVIEW,
  MENU_TOOLS_FIND,
  MENU_WINDOW_LOG,
  MENU_HELP_ABOUT,
  createDefaultMenuState
} from '../../../shared/menu-actions'

// ---------------------------------------------------------------------------
// Capture menu templates passed to Menu.buildFromTemplate
// ---------------------------------------------------------------------------

import type { MenuItemConstructorOptions } from 'electron'

const { capturedTemplates } = vi.hoisted(() => {
  return { capturedTemplates: [] as MenuItemConstructorOptions[][] }
})

vi.mock('electron', () => ({
  app: {
    name: 'Object Builder'
  },
  Menu: {
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => {
      capturedTemplates.push(template)
      return { items: template }
    }),
    setApplicationMenu: vi.fn()
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  shell: {
    openExternal: vi.fn()
  }
}))

import {
  buildApplicationMenu,
  updateMenuState,
  getMenuState,
  resetMenuService
} from '../menu-service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLastTemplate(): MenuItemConstructorOptions[] {
  return capturedTemplates[capturedTemplates.length - 1]
}

function findSubmenuItem(
  menuLabel: string,
  itemLabel: string
): MenuItemConstructorOptions | undefined {
  const template = getLastTemplate()
  const menu = template.find((m) => m.label === menuLabel)
  if (!menu || !Array.isArray(menu.submenu)) return undefined
  return (menu.submenu as MenuItemConstructorOptions[]).find((item) => item.label === itemLabel)
}

function findAllSubmenuItems(menuLabel: string): MenuItemConstructorOptions[] {
  const template = getLastTemplate()
  const menu = template.find((m) => m.label === menuLabel)
  if (!menu || !Array.isArray(menu.submenu)) return []
  return menu.submenu as MenuItemConstructorOptions[]
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedTemplates.length = 0
  resetMenuService()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Shared types tests
// ---------------------------------------------------------------------------

describe('Menu Actions', () => {
  it('MENU_ACTIONS contains all expected actions', () => {
    expect(MENU_ACTIONS.length).toBeGreaterThanOrEqual(26)
    // Verify a sampling of actions from each category
    expect(MENU_ACTIONS).toContain(MENU_FILE_NEW)
    expect(MENU_ACTIONS).toContain(MENU_VIEW_SHOW_PREVIEW)
    expect(MENU_ACTIONS).toContain(MENU_TOOLS_FIND)
    expect(MENU_ACTIONS).toContain(MENU_WINDOW_LOG)
    expect(MENU_ACTIONS).toContain(MENU_HELP_ABOUT)
  })

  it('all action strings are unique', () => {
    const unique = new Set(MENU_ACTIONS)
    expect(unique.size).toBe(MENU_ACTIONS.length)
  })

  it('createDefaultMenuState returns correct defaults', () => {
    const state = createDefaultMenuState()
    expect(state.clientLoaded).toBe(false)
    expect(state.clientChanged).toBe(false)
    expect(state.clientIsTemporary).toBe(false)
    expect(state.otbLoaded).toBe(false)
    expect(state.showPreviewPanel).toBe(true)
    expect(state.showThingsPanel).toBe(true)
    expect(state.showSpritesPanel).toBe(true)
    expect(state.showLogPanel).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Menu building tests
// ---------------------------------------------------------------------------

describe('Menu Building', () => {
  it('buildApplicationMenu creates and sets a menu', async () => {
    const { Menu } = await import('electron')

    buildApplicationMenu()

    expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1)
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1)
  })

  it('menu has all top-level menus (non-macOS)', () => {
    buildApplicationMenu()

    const template = getLastTemplate()
    const labels = template.map((m) => m.label)

    expect(labels).toContain('File')
    expect(labels).toContain('Edit')
    expect(labels).toContain('View')
    expect(labels).toContain('Tools')
    expect(labels).toContain('Window')
    expect(labels).toContain('Help')
  })

  it('File menu contains expected items', () => {
    buildApplicationMenu()

    const items = findAllSubmenuItems('File')
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)

    expect(labels).toContain('New')
    expect(labels).toContain('Open')
    expect(labels).toContain('Compile')
    expect(labels).toContain('Compile As...')
    expect(labels).toContain('Close')
    expect(labels).toContain('Merge...')
  })

  it('View menu has checkbox items for panel visibility', () => {
    buildApplicationMenu()

    const preview = findSubmenuItem('View', 'Show Preview Panel')
    const objects = findSubmenuItem('View', 'Show Objects Panel')
    const sprites = findSubmenuItem('View', 'Show Sprites Panel')

    expect(preview?.type).toBe('checkbox')
    expect(objects?.type).toBe('checkbox')
    expect(sprites?.type).toBe('checkbox')
  })

  it('Tools menu contains expected items', () => {
    buildApplicationMenu()

    const items = findAllSubmenuItems('Tools')
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)

    expect(labels).toContain('Find')
    expect(labels).toContain('LookType Generator')
    expect(labels).toContain('Object Viewer')
    expect(labels).toContain('Slicer')
    expect(labels).toContain('Animation Editor')
    expect(labels).toContain('Sprites Optimizer')
    expect(labels).toContain('Frame Durations Optimizer')
    expect(labels).toContain('Frame Groups Converter')
    expect(labels).toContain('Create Missing OTB Items')
    expect(labels).toContain('Reload Item Attributes')
  })

  it('Window menu contains expected items', () => {
    buildApplicationMenu()

    const logItem = findSubmenuItem('Window', 'Log Window')
    const versionsItem = findSubmenuItem('Window', 'Versions')

    expect(logItem).toBeDefined()
    expect(logItem?.type).toBe('checkbox')
    expect(versionsItem).toBeDefined()
  })

  it('Help menu contains expected items', () => {
    buildApplicationMenu()

    const items = findAllSubmenuItems('Help')
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)

    expect(labels).toContain('Help Contents')
    expect(labels).toContain('Check For Updates')
  })

  it('Help Contents is always disabled', () => {
    buildApplicationMenu()

    const item = findSubmenuItem('Help', 'Help Contents')
    expect(item?.enabled).toBe(false)
  })

  it('Edit menu contains native clipboard roles', () => {
    buildApplicationMenu()

    const items = findAllSubmenuItems('Edit')
    const roles = items
      .filter((item) => item.type !== 'separator')
      .map((item) => item.role)

    expect(roles).toContain('cut')
    expect(roles).toContain('copy')
    expect(roles).toContain('paste')
    expect(roles).toContain('selectAll')
  })
})

// ---------------------------------------------------------------------------
// Keyboard shortcuts tests
// ---------------------------------------------------------------------------

describe('Keyboard Shortcuts', () => {
  it('File menu items have correct accelerators', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('File', 'New')?.accelerator).toBe('CmdOrCtrl+N')
    expect(findSubmenuItem('File', 'Open')?.accelerator).toBe('CmdOrCtrl+O')
    expect(findSubmenuItem('File', 'Compile')?.accelerator).toBe('CmdOrCtrl+S')
    expect(findSubmenuItem('File', 'Compile As...')?.accelerator).toBe('CmdOrCtrl+Shift+S')
    expect(findSubmenuItem('File', 'Close')?.accelerator).toBe('CmdOrCtrl+W')
    expect(findSubmenuItem('File', 'Merge...')?.accelerator).toBe('CmdOrCtrl+M')
  })

  it('View menu items have function key accelerators', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('View', 'Show Preview Panel')?.accelerator).toBe('F2')
    expect(findSubmenuItem('View', 'Show Objects Panel')?.accelerator).toBe('F3')
    expect(findSubmenuItem('View', 'Show Sprites Panel')?.accelerator).toBe('F4')
  })

  it('Tools Find has Ctrl+F accelerator', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('Tools', 'Find')?.accelerator).toBe('CmdOrCtrl+F')
  })

  it('Window Log has Ctrl+L accelerator', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('Window', 'Log Window')?.accelerator).toBe('CmdOrCtrl+L')
  })

  it('Help Contents has F1 accelerator', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('Help', 'Help Contents')?.accelerator).toBe('F1')
  })
})

// ---------------------------------------------------------------------------
// Dynamic state tests
// ---------------------------------------------------------------------------

describe('Dynamic Menu State', () => {
  it('Compile is disabled when no project loaded (default)', () => {
    buildApplicationMenu()

    const compile = findSubmenuItem('File', 'Compile')
    expect(compile?.enabled).toBe(false)
  })

  it('Compile is disabled when project loaded but no changes', () => {
    updateMenuState({ clientLoaded: true, clientChanged: false, clientIsTemporary: false })

    const compile = findSubmenuItem('File', 'Compile')
    expect(compile?.enabled).toBe(false)
  })

  it('Compile is disabled when project changed but is temporary', () => {
    updateMenuState({ clientLoaded: true, clientChanged: true, clientIsTemporary: true })

    const compile = findSubmenuItem('File', 'Compile')
    expect(compile?.enabled).toBe(false)
  })

  it('Compile is enabled when project changed and not temporary', () => {
    updateMenuState({ clientLoaded: true, clientChanged: true, clientIsTemporary: false })

    const compile = findSubmenuItem('File', 'Compile')
    expect(compile?.enabled).toBe(true)
  })

  it('Compile As is enabled when project loaded', () => {
    updateMenuState({ clientLoaded: true })

    const compileAs = findSubmenuItem('File', 'Compile As...')
    expect(compileAs?.enabled).toBe(true)
  })

  it('Compile As is disabled when no project loaded', () => {
    buildApplicationMenu()

    const compileAs = findSubmenuItem('File', 'Compile As...')
    expect(compileAs?.enabled).toBe(false)
  })

  it('Close is enabled when project loaded', () => {
    updateMenuState({ clientLoaded: true })

    const close = findSubmenuItem('File', 'Close')
    expect(close?.enabled).toBe(true)
  })

  it('Close is disabled when no project loaded', () => {
    buildApplicationMenu()

    const close = findSubmenuItem('File', 'Close')
    expect(close?.enabled).toBe(false)
  })

  it('Merge is enabled when project loaded', () => {
    updateMenuState({ clientLoaded: true })

    const merge = findSubmenuItem('File', 'Merge...')
    expect(merge?.enabled).toBe(true)
  })

  it('Merge is disabled when no project loaded', () => {
    buildApplicationMenu()

    const merge = findSubmenuItem('File', 'Merge...')
    expect(merge?.enabled).toBe(false)
  })

  it('Find is enabled when project loaded', () => {
    updateMenuState({ clientLoaded: true })

    const find = findSubmenuItem('Tools', 'Find')
    expect(find?.enabled).toBe(true)
  })

  it('Find is disabled when no project loaded', () => {
    buildApplicationMenu()

    const find = findSubmenuItem('Tools', 'Find')
    expect(find?.enabled).toBe(false)
  })

  it('OTB tools are enabled when OTB loaded', () => {
    updateMenuState({ otbLoaded: true })

    const createMissing = findSubmenuItem('Tools', 'Create Missing OTB Items')
    const reload = findSubmenuItem('Tools', 'Reload Item Attributes')
    expect(createMissing?.enabled).toBe(true)
    expect(reload?.enabled).toBe(true)
  })

  it('OTB tools are disabled when OTB not loaded', () => {
    buildApplicationMenu()

    const createMissing = findSubmenuItem('Tools', 'Create Missing OTB Items')
    const reload = findSubmenuItem('Tools', 'Reload Item Attributes')
    expect(createMissing?.enabled).toBe(false)
    expect(reload?.enabled).toBe(false)
  })

  it('View checkboxes reflect panel visibility state', () => {
    updateMenuState({
      showPreviewPanel: false,
      showThingsPanel: true,
      showSpritesPanel: false
    })

    expect(findSubmenuItem('View', 'Show Preview Panel')?.checked).toBe(false)
    expect(findSubmenuItem('View', 'Show Objects Panel')?.checked).toBe(true)
    expect(findSubmenuItem('View', 'Show Sprites Panel')?.checked).toBe(false)
  })

  it('Log Window checkbox reflects log panel state', () => {
    updateMenuState({ showLogPanel: false })

    const logItem = findSubmenuItem('Window', 'Log Window')
    expect(logItem?.checked).toBe(false)
  })

  it('View checkboxes default to checked', () => {
    buildApplicationMenu()

    expect(findSubmenuItem('View', 'Show Preview Panel')?.checked).toBe(true)
    expect(findSubmenuItem('View', 'Show Objects Panel')?.checked).toBe(true)
    expect(findSubmenuItem('View', 'Show Sprites Panel')?.checked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// State management tests
// ---------------------------------------------------------------------------

describe('State Management', () => {
  it('getMenuState returns current state', () => {
    const state = getMenuState()
    const defaults = createDefaultMenuState()
    expect(state).toEqual(defaults)
  })

  it('getMenuState returns a copy (mutations do not affect internal state)', () => {
    const state = getMenuState()
    state.clientLoaded = true

    expect(getMenuState().clientLoaded).toBe(false)
  })

  it('updateMenuState merges partial state', () => {
    updateMenuState({ clientLoaded: true, otbLoaded: true })

    const state = getMenuState()
    expect(state.clientLoaded).toBe(true)
    expect(state.otbLoaded).toBe(true)
    // Others unchanged
    expect(state.clientChanged).toBe(false)
    expect(state.showPreviewPanel).toBe(true)
  })

  it('updateMenuState rebuilds the menu', async () => {
    const { Menu } = await import('electron')

    updateMenuState({ clientLoaded: true })

    expect(Menu.buildFromTemplate).toHaveBeenCalled()
    expect(Menu.setApplicationMenu).toHaveBeenCalled()
  })

  it('resetMenuService restores default state', () => {
    updateMenuState({ clientLoaded: true, otbLoaded: true, showPreviewPanel: false })

    resetMenuService()

    const state = getMenuState()
    expect(state).toEqual(createDefaultMenuState())
  })
})

// ---------------------------------------------------------------------------
// Menu click dispatch tests
// ---------------------------------------------------------------------------

describe('Menu Click Dispatch', () => {
  it('menu items have click handlers', () => {
    buildApplicationMenu()

    // Spot-check several items for click handlers
    expect(findSubmenuItem('File', 'New')?.click).toBeTypeOf('function')
    expect(findSubmenuItem('File', 'Open')?.click).toBeTypeOf('function')
    expect(findSubmenuItem('View', 'Show Preview Panel')?.click).toBeTypeOf('function')
    expect(findSubmenuItem('Tools', 'Find')?.click).toBeTypeOf('function')
    expect(findSubmenuItem('Window', 'Log Window')?.click).toBeTypeOf('function')
    expect(findSubmenuItem('Help', 'Check For Updates')?.click).toBeTypeOf('function')
  })

  it('clicking a menu item sends action to focused window', async () => {
    const { BrowserWindow } = await import('electron')
    const mockSend = vi.fn()
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: mockSend }
    }
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as never)

    buildApplicationMenu()

    // Simulate clicking File > New
    const newItem = findSubmenuItem('File', 'New')
    const clickFn = newItem?.click as () => void
    clickFn()

    expect(mockSend).toHaveBeenCalledWith('menu:action', MENU_FILE_NEW)
  })

  it('clicking sends to first window when no focused window', async () => {
    const { BrowserWindow } = await import('electron')
    const mockSend = vi.fn()
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: mockSend }
    }
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWindow as never])

    buildApplicationMenu()

    const openItem = findSubmenuItem('File', 'Open')
    const clickFn = openItem?.click as () => void
    clickFn()

    expect(mockSend).toHaveBeenCalledWith('menu:action', 'fileOpen')
  })

  it('clicking does not throw when no windows exist', async () => {
    const { BrowserWindow } = await import('electron')
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

    buildApplicationMenu()

    const item = findSubmenuItem('File', 'New')
    const clickFn = item?.click as () => void

    expect(() => clickFn()).not.toThrow()
  })
})
