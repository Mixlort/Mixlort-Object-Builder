/**
 * IPC handler registration for the main process.
 * Maps IPC channels to service functions, translating between
 * IPC-serializable types and internal service types.
 *
 * Called once during app initialization in main/index.ts.
 */

import { ipcMain, BrowserWindow, shell } from 'electron'
import * as channels from '../shared/ipc-channels'
import type {
  IpcOpenDialogOptions,
  IpcSaveDialogOptions,
  IpcDirectoryDialogOptions,
  FileInfo,
  RecentDirectoryKey,
  RecentDirectoriesData
} from '../shared/ipc-types'
import type {
  CreateProjectParams,
  LoadProjectParams,
  CompileProjectParams,
  MergeProjectParams,
  ProjectState,
  ProjectFeatures,
  LoadProjectResult,
  MergeProjectResult
} from '../shared/project-state'
import {
  showOpenDialog,
  showSaveDialog,
  showDirectoryDialog,
  readBinaryFile,
  writeBinaryFile,
  readTextFile,
  writeTextFile,
  fileExists,
  getFileInfo,
  listFiles,
  findFileInDirectory,
  watchFile,
  unwatchFile,
  unwatchAll
} from './services/file-service'
import {
  loadRecentDirectories,
  getRecentDirectory,
  setRecentDirectory,
  getAllRecentDirectories,
  clearRecentDirectories
} from './services/recent-directories'
import {
  getProjectState,
  isProjectLoaded,
  createProject,
  loadProject,
  compileProject,
  loadMergeFiles,
  unloadProject,
  markProjectChanged,
  markProjectSaved,
  setServerItemsPath,
  updateProjectFeatures,
  discoverClientFiles,
  discoverServerItemFiles
} from './services/project-service'
import {
  loadSettings,
  saveSettings,
  getSettings,
  getSetting,
  setSetting,
  resetSettings,
  loadWindowState,
  saveWindowState
} from './services/settings-service'
import type { ObjectBuilderSettings, WindowState } from '../shared/settings'
import type { MenuState } from '../shared/menu-actions'
import { updateMenuState, getMenuState } from './services/menu-service'
import { writeLog, getLogPath } from './services/logger-service'
import { getRecoveryData, clearRecoveryData } from './services/recovery-service'
import { checkForUpdates, downloadUpdate, quitAndInstall } from './services/updater-service'
import {
  openObjectViewerWindow,
  setObjectViewerCurrentThing,
  getObjectViewerCurrentThing
} from './services/object-viewer-window-service'

// ---------------------------------------------------------------------------
// File watcher -> renderer event forwarding
// ---------------------------------------------------------------------------

/** Active IPC file watchers, keyed by file path. Stores cleanup functions. */
const ipcWatcherCleanups = new Map<string, () => void>()

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerIpcHandlers(): void {
  // -------------------------------------------------------------------------
  // File service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.FILE_SHOW_OPEN_DIALOG, async (_event, options?: IpcOpenDialogOptions) => {
    return showOpenDialog(options)
  })

  ipcMain.handle(channels.FILE_SHOW_SAVE_DIALOG, async (_event, options?: IpcSaveDialogOptions) => {
    return showSaveDialog(options)
  })

  ipcMain.handle(
    channels.FILE_SHOW_DIRECTORY_DIALOG,
    async (_event, options?: IpcDirectoryDialogOptions) => {
      return showDirectoryDialog(options)
    }
  )

  ipcMain.handle(channels.FILE_READ_BINARY, async (_event, filePath: string) => {
    return readBinaryFile(filePath)
  })

  ipcMain.handle(
    channels.FILE_WRITE_BINARY,
    async (_event, filePath: string, data: ArrayBuffer) => {
      await writeBinaryFile(filePath, data)
    }
  )

  ipcMain.handle(
    channels.FILE_READ_TEXT,
    async (_event, filePath: string, encoding?: BufferEncoding) => {
      return readTextFile(filePath, encoding)
    }
  )

  ipcMain.handle(
    channels.FILE_WRITE_TEXT,
    async (_event, filePath: string, content: string, encoding?: BufferEncoding) => {
      await writeTextFile(filePath, content, encoding)
    }
  )

  ipcMain.handle(channels.FILE_EXISTS, async (_event, filePath: string) => {
    return fileExists(filePath)
  })

  ipcMain.handle(channels.FILE_GET_INFO, async (_event, filePath: string): Promise<FileInfo> => {
    const info = await getFileInfo(filePath)
    // Convert Date to timestamp for IPC serialization safety
    return {
      ...info,
      lastModified: info.lastModified.getTime()
    }
  })

  ipcMain.handle(
    channels.FILE_LIST,
    async (_event, directoryPath: string, extensions?: string[]) => {
      return listFiles(directoryPath, extensions)
    }
  )

  ipcMain.handle(
    channels.FILE_FIND_IN_DIRECTORY,
    async (_event, directoryPath: string, fileName: string) => {
      return findFileInDirectory(directoryPath, fileName)
    }
  )

  // -------------------------------------------------------------------------
  // File watching handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.FILE_WATCH, async (_event, filePath: string) => {
    // Stop existing IPC watcher for this path
    const existingCleanup = ipcWatcherCleanups.get(filePath)
    if (existingCleanup) {
      existingCleanup()
      ipcWatcherCleanups.delete(filePath)
    }

    const cleanup = watchFile(filePath, (eventType) => {
      sendToRenderer(channels.FILE_CHANGED, { filePath, eventType })
    })
    ipcWatcherCleanups.set(filePath, cleanup)
  })

  ipcMain.handle(channels.FILE_UNWATCH, async (_event, filePath: string) => {
    const cleanup = ipcWatcherCleanups.get(filePath)
    if (cleanup) {
      cleanup()
      ipcWatcherCleanups.delete(filePath)
    } else {
      unwatchFile(filePath)
    }
  })

  ipcMain.handle(channels.FILE_UNWATCH_ALL, async () => {
    for (const cleanup of ipcWatcherCleanups.values()) {
      cleanup()
    }
    ipcWatcherCleanups.clear()
    unwatchAll()
  })

  // -------------------------------------------------------------------------
  // Recent directories handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.RECENT_LOAD, async () => {
    await loadRecentDirectories()
  })

  ipcMain.handle(channels.RECENT_GET, (_event, key: RecentDirectoryKey) => {
    return getRecentDirectory(key)
  })

  ipcMain.handle(
    channels.RECENT_SET,
    async (_event, key: RecentDirectoryKey, path: string | null) => {
      await setRecentDirectory(key, path)
    }
  )

  ipcMain.handle(channels.RECENT_GET_ALL, (): RecentDirectoriesData => {
    return getAllRecentDirectories() as RecentDirectoriesData
  })

  ipcMain.handle(channels.RECENT_CLEAR, async () => {
    await clearRecentDirectories()
  })

  // -------------------------------------------------------------------------
  // Project service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.PROJECT_GET_STATE, (): ProjectState => {
    return getProjectState() as ProjectState
  })

  ipcMain.handle(channels.PROJECT_IS_LOADED, (): boolean => {
    return isProjectLoaded()
  })

  ipcMain.handle(channels.PROJECT_CREATE, (_event, params: CreateProjectParams): ProjectState => {
    return createProject(params) as ProjectState
  })

  ipcMain.handle(
    channels.PROJECT_LOAD,
    async (_event, params: LoadProjectParams): Promise<LoadProjectResult> => {
      return loadProject(params)
    }
  )

  ipcMain.handle(
    channels.PROJECT_COMPILE,
    async (_event, params: CompileProjectParams): Promise<void> => {
      await compileProject(params)
    }
  )

  ipcMain.handle(
    channels.PROJECT_LOAD_MERGE_FILES,
    async (_event, params: MergeProjectParams): Promise<MergeProjectResult> => {
      return loadMergeFiles(params)
    }
  )

  ipcMain.handle(channels.PROJECT_UNLOAD, () => {
    unloadProject()
  })

  ipcMain.handle(channels.PROJECT_MARK_CHANGED, () => {
    markProjectChanged()
  })

  ipcMain.handle(channels.PROJECT_MARK_SAVED, () => {
    markProjectSaved()
  })

  ipcMain.handle(channels.PROJECT_SET_SERVER_ITEMS_PATH, (_event, path: string | null) => {
    setServerItemsPath(path)
  })

  ipcMain.handle(channels.PROJECT_UPDATE_FEATURES, (_event, features: Partial<ProjectFeatures>) => {
    updateProjectFeatures(features)
  })

  ipcMain.handle(channels.PROJECT_DISCOVER_CLIENT_FILES, async (_event, dir: string) => {
    return discoverClientFiles(dir)
  })

  ipcMain.handle(channels.PROJECT_DISCOVER_SERVER_ITEM_FILES, async (_event, dir: string) => {
    return discoverServerItemFiles(dir)
  })

  // -------------------------------------------------------------------------
  // Settings service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.SETTINGS_LOAD, async () => {
    return loadSettings()
  })

  ipcMain.handle(channels.SETTINGS_SAVE, async (_event, newSettings: ObjectBuilderSettings) => {
    await saveSettings(newSettings)
  })

  ipcMain.handle(channels.SETTINGS_GET, (_event, key: keyof ObjectBuilderSettings) => {
    return getSetting(key)
  })

  ipcMain.handle(
    channels.SETTINGS_SET,
    async (
      _event,
      key: keyof ObjectBuilderSettings,
      value: ObjectBuilderSettings[keyof ObjectBuilderSettings]
    ) => {
      await setSetting(key, value)
    }
  )

  ipcMain.handle(channels.SETTINGS_GET_ALL, () => {
    return getSettings()
  })

  ipcMain.handle(channels.SETTINGS_RESET, async () => {
    return resetSettings()
  })

  ipcMain.handle(channels.SETTINGS_GET_WINDOW_STATE, async () => {
    return loadWindowState()
  })

  ipcMain.handle(channels.SETTINGS_SAVE_WINDOW_STATE, async (_event, state: WindowState) => {
    await saveWindowState(state)
  })

  // -------------------------------------------------------------------------
  // Menu service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.MENU_UPDATE_STATE, (_event, state: Partial<MenuState>) => {
    updateMenuState(state)
  })

  ipcMain.handle(channels.MENU_GET_STATE, () => {
    return getMenuState()
  })

  // -------------------------------------------------------------------------
  // Logger service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(
    channels.LOG_WRITE,
    (_event, level: 'info' | 'warning' | 'error', message: string) => {
      writeLog(level, message)
    }
  )

  ipcMain.handle(channels.LOG_GET_PATH, () => {
    return getLogPath()
  })

  ipcMain.handle(channels.LOG_OPEN_FILE, async () => {
    const logPath = getLogPath()
    await shell.openPath(logPath)
  })

  // -------------------------------------------------------------------------
  // App lifecycle handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.APP_CLOSE_CONFIRMED, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  })

  // -------------------------------------------------------------------------
  // Object Viewer handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.OBJECT_VIEWER_OPEN, async () => {
    await openObjectViewerWindow()
  })

  ipcMain.handle(channels.OBJECT_VIEWER_SET_CURRENT_THING, (_event, thingData: unknown) => {
    setObjectViewerCurrentThing(thingData)
  })

  ipcMain.handle(channels.OBJECT_VIEWER_GET_CURRENT_THING, () => {
    return getObjectViewerCurrentThing()
  })

  // -------------------------------------------------------------------------
  // Recovery service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.RECOVERY_GET_DATA, () => {
    return getRecoveryData()
  })

  ipcMain.handle(channels.RECOVERY_CLEAR, () => {
    clearRecoveryData()
  })

  // -------------------------------------------------------------------------
  // Updater service handlers
  // -------------------------------------------------------------------------

  ipcMain.handle(channels.UPDATER_CHECK, () => {
    checkForUpdates()
  })

  ipcMain.handle(channels.UPDATER_DOWNLOAD, () => {
    downloadUpdate()
  })

  ipcMain.handle(channels.UPDATER_INSTALL, () => {
    quitAndInstall()
  })
}

/**
 * Removes all registered IPC handlers.
 * Used for testing to avoid handler conflicts between tests.
 */
export function removeIpcHandlers(): void {
  for (const channel of channels.INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // Clean up IPC watchers
  for (const cleanup of ipcWatcherCleanups.values()) {
    cleanup()
  }
  ipcWatcherCleanups.clear()
}
