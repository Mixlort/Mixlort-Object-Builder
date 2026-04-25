/**
 * Preload script with typed, secure API exposed to the renderer via contextBridge.
 *
 * Replaces the generic send/invoke/on with domain-specific typed methods.
 * Only whitelisted IPC channels are exposed. The renderer accesses these
 * via window.api (typed in index.d.ts).
 *
 * Security: contextBridge prevents the renderer from accessing Node.js APIs
 * directly. Each method invokes a specific, validated IPC channel.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  // File service
  FILE_SHOW_OPEN_DIALOG,
  FILE_SHOW_SAVE_DIALOG,
  FILE_SHOW_DIRECTORY_DIALOG,
  FILE_READ_BINARY,
  FILE_READ_BINARY_RANGE,
  FILE_WRITE_BINARY,
  FILE_READ_TEXT,
  FILE_WRITE_TEXT,
  FILE_EXISTS,
  FILE_GET_INFO,
  FILE_LIST,
  FILE_FIND_IN_DIRECTORY,
  // File watching
  FILE_WATCH,
  FILE_UNWATCH,
  FILE_UNWATCH_ALL,
  FILE_CHANGED,
  // Recent directories
  RECENT_LOAD,
  RECENT_GET,
  RECENT_SET,
  RECENT_GET_ALL,
  RECENT_CLEAR,
  // Project service
  PROJECT_GET_STATE,
  PROJECT_IS_LOADED,
  PROJECT_CREATE,
  PROJECT_LOAD,
  PROJECT_COMPILE,
  PROJECT_LOAD_MERGE_FILES,
  PROJECT_UNLOAD,
  PROJECT_MARK_CHANGED,
  PROJECT_MARK_SAVED,
  PROJECT_SET_SERVER_ITEMS_PATH,
  PROJECT_UPDATE_FEATURES,
  PROJECT_DISCOVER_CLIENT_FILES,
  PROJECT_DISCOVER_SERVER_ITEM_FILES,
  PROJECT_READ_SPRITES,
  PROJECT_STATE_CHANGED,
  // Settings service
  SETTINGS_LOAD,
  SETTINGS_SAVE,
  SETTINGS_GET,
  SETTINGS_SET,
  SETTINGS_GET_ALL,
  SETTINGS_RESET,
  SETTINGS_GET_WINDOW_STATE,
  SETTINGS_SAVE_WINDOW_STATE,
  // Menu
  MENU_ACTION,
  MENU_UPDATE_STATE,
  MENU_GET_STATE,
  // Logger
  LOG_WRITE,
  LOG_GET_PATH,
  LOG_OPEN_FILE,
  // App lifecycle
  APP_CONFIRM_CLOSE,
  APP_CLOSE_CONFIRMED,
  // Object viewer
  OBJECT_VIEWER_OPEN,
  OBJECT_VIEWER_SET_CURRENT_THING,
  OBJECT_VIEWER_GET_CURRENT_THING,
  OBJECT_VIEWER_CURRENT_THING_CHANGED,
  // Recovery
  RECOVERY_GET_DATA,
  RECOVERY_CLEAR,
  // Updater
  UPDATER_CHECK,
  UPDATER_DOWNLOAD,
  UPDATER_INSTALL,
  UPDATER_STATUS
} from '../shared/ipc-channels'

// ---------------------------------------------------------------------------
// Helper to create event listeners with cleanup
// ---------------------------------------------------------------------------

function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => {
    callback(data)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// ---------------------------------------------------------------------------
// Typed API
// ---------------------------------------------------------------------------

const api = {
  // -------------------------------------------------------------------------
  // File service
  // -------------------------------------------------------------------------
  file: {
    showOpenDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
      multiSelections?: boolean
    }) => ipcRenderer.invoke(FILE_SHOW_OPEN_DIALOG, options),

    showSaveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }) => ipcRenderer.invoke(FILE_SHOW_SAVE_DIALOG, options),

    showDirectoryDialog: (options?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke(FILE_SHOW_DIRECTORY_DIALOG, options),

    readBinary: (filePath: string) => ipcRenderer.invoke(FILE_READ_BINARY, filePath),

    readBinaryRange: (filePath: string, position: number, length: number) =>
      ipcRenderer.invoke(FILE_READ_BINARY_RANGE, filePath, position, length),

    writeBinary: (filePath: string, data: ArrayBuffer) =>
      ipcRenderer.invoke(FILE_WRITE_BINARY, filePath, data),

    readText: (filePath: string, encoding?: string) =>
      ipcRenderer.invoke(FILE_READ_TEXT, filePath, encoding),

    writeText: (filePath: string, content: string, encoding?: string) =>
      ipcRenderer.invoke(FILE_WRITE_TEXT, filePath, content, encoding),

    exists: (filePath: string) => ipcRenderer.invoke(FILE_EXISTS, filePath),

    getInfo: (filePath: string) => ipcRenderer.invoke(FILE_GET_INFO, filePath),

    list: (directoryPath: string, extensions?: string[]) =>
      ipcRenderer.invoke(FILE_LIST, directoryPath, extensions),

    findInDirectory: (directoryPath: string, fileName: string) =>
      ipcRenderer.invoke(FILE_FIND_IN_DIRECTORY, directoryPath, fileName),

    watch: (filePath: string) => ipcRenderer.invoke(FILE_WATCH, filePath),

    unwatch: (filePath: string) => ipcRenderer.invoke(FILE_UNWATCH, filePath),

    unwatchAll: () => ipcRenderer.invoke(FILE_UNWATCH_ALL),

    onFileChanged: (
      callback: (event: { filePath: string; eventType: 'change' | 'rename' }) => void
    ) => onEvent(FILE_CHANGED, callback)
  },

  // -------------------------------------------------------------------------
  // Recent directories
  // -------------------------------------------------------------------------
  recent: {
    load: () => ipcRenderer.invoke(RECENT_LOAD),

    get: (
      key: 'lastDirectory' | 'lastMergeDirectory' | 'lastIODirectory' | 'lastServerItemsDirectory'
    ) => ipcRenderer.invoke(RECENT_GET, key),

    set: (
      key: 'lastDirectory' | 'lastMergeDirectory' | 'lastIODirectory' | 'lastServerItemsDirectory',
      path: string | null
    ) => ipcRenderer.invoke(RECENT_SET, key, path),

    getAll: () => ipcRenderer.invoke(RECENT_GET_ALL),

    clear: () => ipcRenderer.invoke(RECENT_CLEAR)
  },

  // -------------------------------------------------------------------------
  // Project service
  // -------------------------------------------------------------------------
  project: {
    getState: () => ipcRenderer.invoke(PROJECT_GET_STATE),

    isLoaded: () => ipcRenderer.invoke(PROJECT_IS_LOADED),

    create: (params: {
      datSignature: number
      sprSignature: number
      versionValue: number
      features: {
        extended: boolean
        transparency: boolean
        improvedAnimations: boolean
        frameGroups: boolean
        metadataController: string
        attributeServer: string | null
      }
    }) => ipcRenderer.invoke(PROJECT_CREATE, params),

    load: (params: {
      datFilePath: string
      sprFilePath: string
      versionValue: number
      datSignature: number
      sprSignature: number
      features: {
        extended: boolean
        transparency: boolean
        improvedAnimations: boolean
        frameGroups: boolean
        metadataController: string
        attributeServer: string | null
      }
      serverItemsPath?: string | null
    }) => ipcRenderer.invoke(PROJECT_LOAD, params),

    compile: (params: {
      datFilePath: string
      sprFilePath: string
      datBuffer: ArrayBuffer
      sprBuffer: ArrayBuffer
      versionValue: number
      datSignature: number
      sprSignature: number
      features: {
        extended: boolean
        transparency: boolean
        improvedAnimations: boolean
        frameGroups: boolean
        metadataController: string
        attributeServer: string | null
      }
      serverItemsPath?: string | null
      otbBuffer?: ArrayBuffer | null
      xmlContent?: string | null
      otfiContent?: string | null
    }) => ipcRenderer.invoke(PROJECT_COMPILE, params),

    loadMergeFiles: (params: {
      datFilePath: string
      sprFilePath: string
      versionValue: number
      datSignature: number
      sprSignature: number
      features: {
        extended: boolean
        transparency: boolean
        improvedAnimations: boolean
        frameGroups: boolean
        metadataController: string
        attributeServer: string | null
      }
    }) => ipcRenderer.invoke(PROJECT_LOAD_MERGE_FILES, params),

    unload: () => ipcRenderer.invoke(PROJECT_UNLOAD),

    markChanged: () => ipcRenderer.invoke(PROJECT_MARK_CHANGED),

    markSaved: () => ipcRenderer.invoke(PROJECT_MARK_SAVED),

    setServerItemsPath: (path: string | null) =>
      ipcRenderer.invoke(PROJECT_SET_SERVER_ITEMS_PATH, path),

    updateFeatures: (
      features: Partial<{
        extended: boolean
        transparency: boolean
        improvedAnimations: boolean
        frameGroups: boolean
        metadataController: string
        attributeServer: string | null
      }>
    ) => ipcRenderer.invoke(PROJECT_UPDATE_FEATURES, features),

    discoverClientFiles: (dir: string) => ipcRenderer.invoke(PROJECT_DISCOVER_CLIENT_FILES, dir),

    discoverServerItemFiles: (dir: string) =>
      ipcRenderer.invoke(PROJECT_DISCOVER_SERVER_ITEM_FILES, dir),

    readSprites: (ids: number[]) => ipcRenderer.invoke(PROJECT_READ_SPRITES, ids),

    onStateChanged: (
      callback: (state: {
        loaded: boolean
        datFilePath: string | null
        sprFilePath: string | null
        serverItemsPath: string | null
        versionValue: number
        datSignature: number
        sprSignature: number
        features: {
          extended: boolean
          transparency: boolean
          improvedAnimations: boolean
          frameGroups: boolean
          metadataController: string
          attributeServer: string | null
        }
        isTemporary: boolean
        changed: boolean
        loadedFileName: string
      }) => void
    ) => onEvent(PROJECT_STATE_CHANGED, callback)
  },

  // -------------------------------------------------------------------------
  // Settings service
  // -------------------------------------------------------------------------
  settings: {
    load: () => ipcRenderer.invoke(SETTINGS_LOAD),

    save: (settings: Record<string, unknown>) => ipcRenderer.invoke(SETTINGS_SAVE, settings),

    get: (key: string) => ipcRenderer.invoke(SETTINGS_GET, key),

    set: (key: string, value: unknown) => ipcRenderer.invoke(SETTINGS_SET, key, value),

    getAll: () => ipcRenderer.invoke(SETTINGS_GET_ALL),

    reset: () => ipcRenderer.invoke(SETTINGS_RESET),

    getWindowState: () => ipcRenderer.invoke(SETTINGS_GET_WINDOW_STATE),

    saveWindowState: (state: {
      x: number | undefined
      y: number | undefined
      width: number
      height: number
      maximized: boolean
    }) => ipcRenderer.invoke(SETTINGS_SAVE_WINDOW_STATE, state)
  },

  // -------------------------------------------------------------------------
  // Menu
  // -------------------------------------------------------------------------
  menu: {
    updateState: (state: Record<string, unknown>) => ipcRenderer.invoke(MENU_UPDATE_STATE, state),

    getState: () => ipcRenderer.invoke(MENU_GET_STATE),

    onAction: (callback: (action: string) => void) => onEvent(MENU_ACTION, callback)
  },

  // -------------------------------------------------------------------------
  // Logger service
  // -------------------------------------------------------------------------
  log: {
    write: (level: 'info' | 'warning' | 'error', message: string) =>
      ipcRenderer.invoke(LOG_WRITE, level, message),

    getPath: () => ipcRenderer.invoke(LOG_GET_PATH) as Promise<string>,

    openFile: () => ipcRenderer.invoke(LOG_OPEN_FILE)
  },

  // -------------------------------------------------------------------------
  // App lifecycle
  // -------------------------------------------------------------------------
  app: {
    onConfirmClose: (callback: () => void) => onEvent(APP_CONFIRM_CLOSE, callback),

    closeConfirmed: () => ipcRenderer.invoke(APP_CLOSE_CONFIRMED)
  },

  // -------------------------------------------------------------------------
  // Object Viewer
  // -------------------------------------------------------------------------
  objectViewer: {
    open: () => ipcRenderer.invoke(OBJECT_VIEWER_OPEN),

    setCurrentThing: (thingData: unknown | null) =>
      ipcRenderer.invoke(OBJECT_VIEWER_SET_CURRENT_THING, thingData),

    getCurrentThing: () => ipcRenderer.invoke(OBJECT_VIEWER_GET_CURRENT_THING),

    onCurrentThingChanged: (callback: (thingData: unknown | null) => void) =>
      onEvent(OBJECT_VIEWER_CURRENT_THING_CHANGED, callback)
  },

  // -------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------
  recovery: {
    getData: () => ipcRenderer.invoke(RECOVERY_GET_DATA),

    clear: () => ipcRenderer.invoke(RECOVERY_CLEAR)
  },

  // -------------------------------------------------------------------------
  // Updater
  // -------------------------------------------------------------------------
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(UPDATER_CHECK),

    downloadUpdate: () => ipcRenderer.invoke(UPDATER_DOWNLOAD),

    installUpdate: () => ipcRenderer.invoke(UPDATER_INSTALL),

    onStatus: (
      callback: (status: {
        status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
        version?: string
        progress?: number
        error?: string
      }) => void
    ) => onEvent(UPDATER_STATUS, callback)
  }
}

contextBridge.exposeInMainWorld('api', api)
