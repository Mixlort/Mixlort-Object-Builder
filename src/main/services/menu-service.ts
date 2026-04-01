/**
 * Native menu service for the main process.
 * Builds and manages the application menu bar using Electron's Menu API.
 *
 * Ported from legacy ob/menu/Menu.as.
 *
 * The menu dispatches actions to the renderer via IPC events.
 * Menu items are dynamically enabled/disabled based on project state.
 */

import { app, Menu, BrowserWindow, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import {
  MENU_FILE_NEW,
  MENU_FILE_OPEN,
  MENU_FILE_COMPILE,
  MENU_FILE_COMPILE_AS,
  MENU_FILE_CLOSE,
  MENU_FILE_MERGE,
  MENU_FILE_PREFERENCES,
  MENU_FILE_EXIT,
  MENU_VIEW_SHOW_PREVIEW,
  MENU_VIEW_SHOW_OBJECTS,
  MENU_VIEW_SHOW_SPRITES,
  MENU_TOOLS_FIND,
  MENU_TOOLS_LOOK_TYPE_GENERATOR,
  MENU_TOOLS_SLICER,
  MENU_TOOLS_ANIMATION_EDITOR,
  MENU_TOOLS_ASSET_STORE,
  MENU_TOOLS_SPRITES_OPTIMIZER,
  MENU_TOOLS_FRAME_DURATIONS_OPTIMIZER,
  MENU_TOOLS_FRAME_GROUPS_CONVERTER,
  MENU_TOOLS_CREATE_MISSING_ITEMS,
  MENU_TOOLS_RELOAD_ITEM_ATTRIBUTES,
  MENU_WINDOW_LOG,
  MENU_WINDOW_VERSIONS,
  MENU_HELP_CONTENTS,
  MENU_HELP_CHECK_FOR_UPDATES,
  MENU_HELP_ABOUT,
  createDefaultMenuState
} from '../../shared/menu-actions'
import type { MenuAction, MenuState } from '../../shared/menu-actions'
import { MENU_ACTION } from '../../shared/ipc-channels'
import { isObjectViewerWindow, openObjectViewerWindow } from './object-viewer-window-service'

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let currentMenuState: MenuState = createDefaultMenuState()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isMac = process.platform === 'darwin'

function sendMenuAction(action: MenuAction): void {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const win = isObjectViewerWindow(focusedWindow)
    ? BrowserWindow.getAllWindows().find((window) => !isObjectViewerWindow(window))
    : (focusedWindow ?? BrowserWindow.getAllWindows()[0])

  if (win && !win.isDestroyed()) {
    win.webContents.send(MENU_ACTION, action)
  }
}

function menuClick(action: MenuAction): () => void {
  return () => sendMenuAction(action)
}

// ---------------------------------------------------------------------------
// Menu template builders
// ---------------------------------------------------------------------------

function buildFileMenu(): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: menuClick(MENU_FILE_NEW)
      },
      {
        label: 'Open',
        accelerator: 'CmdOrCtrl+O',
        click: menuClick(MENU_FILE_OPEN)
      },
      { type: 'separator' },
      {
        label: 'Compile',
        accelerator: 'CmdOrCtrl+S',
        enabled: currentMenuState.clientChanged && !currentMenuState.clientIsTemporary,
        click: menuClick(MENU_FILE_COMPILE)
      },
      {
        label: 'Compile As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        enabled: currentMenuState.clientLoaded,
        click: menuClick(MENU_FILE_COMPILE_AS)
      },
      { type: 'separator' },
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        enabled: currentMenuState.clientLoaded,
        click: menuClick(MENU_FILE_CLOSE)
      },
      { type: 'separator' },
      {
        label: 'Merge...',
        accelerator: 'CmdOrCtrl+M',
        enabled: currentMenuState.clientLoaded,
        click: menuClick(MENU_FILE_MERGE)
      },
      // Preferences and Exit are in app menu on macOS
      ...(isMac
        ? []
        : [
            { type: 'separator' as const },
            {
              label: 'Preferences',
              accelerator: 'CmdOrCtrl+P',
              click: menuClick(MENU_FILE_PREFERENCES)
            },
            { type: 'separator' as const },
            {
              label: 'Exit',
              accelerator: 'CmdOrCtrl+Q',
              click: menuClick(MENU_FILE_EXIT)
            }
          ])
    ]
  }
}

function buildViewMenu(): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      {
        label: 'Show Preview Panel',
        accelerator: 'F2',
        type: 'checkbox',
        checked: currentMenuState.showPreviewPanel,
        click: menuClick(MENU_VIEW_SHOW_PREVIEW)
      },
      {
        label: 'Show Objects Panel',
        accelerator: 'F3',
        type: 'checkbox',
        checked: currentMenuState.showThingsPanel,
        click: menuClick(MENU_VIEW_SHOW_OBJECTS)
      },
      {
        label: 'Show Sprites Panel',
        accelerator: 'F4',
        type: 'checkbox',
        checked: currentMenuState.showSpritesPanel,
        click: menuClick(MENU_VIEW_SHOW_SPRITES)
      }
    ]
  }
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }
}

function buildToolsMenu(): MenuItemConstructorOptions {
  return {
    label: 'Tools',
    submenu: [
      {
        label: 'Find',
        accelerator: 'CmdOrCtrl+F',
        enabled: currentMenuState.clientLoaded,
        click: menuClick(MENU_TOOLS_FIND)
      },
      { type: 'separator' },
      {
        label: 'LookType Generator',
        click: menuClick(MENU_TOOLS_LOOK_TYPE_GENERATOR)
      },
      {
        label: 'Object Viewer',
        click: () => {
          void openObjectViewerWindow()
        }
      },
      {
        label: 'Slicer',
        click: menuClick(MENU_TOOLS_SLICER)
      },
      {
        label: 'Animation Editor',
        click: menuClick(MENU_TOOLS_ANIMATION_EDITOR)
      },
      {
        label: 'Asset Store',
        enabled: currentMenuState.clientLoaded,
        click: menuClick(MENU_TOOLS_ASSET_STORE)
      },
      { type: 'separator' },
      {
        label: 'Sprites Optimizer',
        click: menuClick(MENU_TOOLS_SPRITES_OPTIMIZER)
      },
      {
        label: 'Frame Durations Optimizer',
        click: menuClick(MENU_TOOLS_FRAME_DURATIONS_OPTIMIZER)
      },
      {
        label: 'Frame Groups Converter',
        click: menuClick(MENU_TOOLS_FRAME_GROUPS_CONVERTER)
      },
      { type: 'separator' },
      {
        label: 'Create Missing OTB Items',
        enabled: currentMenuState.otbLoaded,
        click: menuClick(MENU_TOOLS_CREATE_MISSING_ITEMS)
      },
      {
        label: 'Reload Item Attributes',
        enabled: currentMenuState.otbLoaded,
        click: menuClick(MENU_TOOLS_RELOAD_ITEM_ATTRIBUTES)
      },
      { type: 'separator' },
      {
        label: 'Toggle Developer Tools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.toggleDevTools()
          }
        }
      }
    ]
  }
}

function buildWindowMenu(): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      {
        label: 'Log Window',
        accelerator: 'CmdOrCtrl+L',
        type: 'checkbox',
        checked: currentMenuState.showLogPanel,
        click: menuClick(MENU_WINDOW_LOG)
      },
      { type: 'separator' },
      {
        label: 'Versions',
        click: menuClick(MENU_WINDOW_VERSIONS)
      }
    ]
  }
}

function buildHelpMenu(): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      {
        label: 'Help Contents',
        accelerator: 'F1',
        enabled: false,
        click: menuClick(MENU_HELP_CONTENTS)
      },
      { type: 'separator' },
      {
        label: 'Check For Updates',
        click: menuClick(MENU_HELP_CHECK_FOR_UPDATES)
      },
      // About is in app menu on macOS
      ...(isMac
        ? []
        : [
            { type: 'separator' as const },
            {
              label: 'About Object Builder',
              click: menuClick(MENU_HELP_ABOUT)
            }
          ])
    ]
  }
}

function buildMacAppMenu(): MenuItemConstructorOptions {
  return {
    label: app.name,
    submenu: [
      {
        label: 'About Object Builder',
        click: menuClick(MENU_HELP_ABOUT)
      },
      { type: 'separator' },
      {
        label: 'Preferences',
        accelerator: 'Cmd+P',
        click: menuClick(MENU_FILE_PREFERENCES)
      },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      {
        label: 'Quit Object Builder',
        accelerator: 'Cmd+Q',
        click: menuClick(MENU_FILE_EXIT)
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the complete menu template and sets it as the application menu.
 * Call this on app startup and whenever menu state changes.
 */
export function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [buildMacAppMenu()] : []),
    buildFileMenu(),
    buildEditMenu(),
    buildViewMenu(),
    buildToolsMenu(),
    buildWindowMenu(),
    buildHelpMenu()
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Updates the menu state and rebuilds the menu to reflect the new state.
 * Called when project state changes (load/unload/save), panel visibility toggles, etc.
 */
export function updateMenuState(state: Partial<MenuState>): void {
  currentMenuState = { ...currentMenuState, ...state }
  buildApplicationMenu()
}

/**
 * Returns the current menu state (read-only copy).
 */
export function getMenuState(): MenuState {
  return { ...currentMenuState }
}

/**
 * Resets the menu state to defaults. Used for testing.
 */
export function resetMenuService(): void {
  currentMenuState = createDefaultMenuState()
}

/**
 * Opens an external URL in the system browser.
 * Used by Help > Check For Updates and similar actions.
 */
export function openExternalUrl(url: string): void {
  shell.openExternal(url)
}
