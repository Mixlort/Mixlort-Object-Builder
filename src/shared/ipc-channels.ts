/**
 * IPC channel name constants for communication between main and renderer processes.
 * All channels are namespaced by domain (file:, recent:, project:).
 *
 * invoke channels: renderer -> main (request/response via ipcMain.handle)
 * event channels:  main -> renderer (push notifications via webContents.send)
 */

// ---------------------------------------------------------------------------
// File service channels (invoke)
// ---------------------------------------------------------------------------

export const FILE_SHOW_OPEN_DIALOG = 'file:showOpenDialog'
export const FILE_SHOW_SAVE_DIALOG = 'file:showSaveDialog'
export const FILE_SHOW_DIRECTORY_DIALOG = 'file:showDirectoryDialog'
export const FILE_READ_BINARY = 'file:readBinary'
export const FILE_READ_BINARY_RANGE = 'file:readBinaryRange'
export const FILE_WRITE_BINARY = 'file:writeBinary'
export const FILE_READ_TEXT = 'file:readText'
export const FILE_WRITE_TEXT = 'file:writeText'
export const FILE_EXISTS = 'file:exists'
export const FILE_GET_INFO = 'file:getInfo'
export const FILE_LIST = 'file:list'
export const FILE_FIND_IN_DIRECTORY = 'file:findInDirectory'

// ---------------------------------------------------------------------------
// File watching channels
// ---------------------------------------------------------------------------

/** invoke: renderer asks main to start watching a file */
export const FILE_WATCH = 'file:watch'
/** invoke: renderer asks main to stop watching a file */
export const FILE_UNWATCH = 'file:unwatch'
/** invoke: renderer asks main to stop all watchers */
export const FILE_UNWATCH_ALL = 'file:unwatchAll'
/** event: main notifies renderer that a watched file changed */
export const FILE_CHANGED = 'file:changed'

// ---------------------------------------------------------------------------
// Recent directories channels (invoke)
// ---------------------------------------------------------------------------

export const RECENT_LOAD = 'recent:load'
export const RECENT_GET = 'recent:get'
export const RECENT_SET = 'recent:set'
export const RECENT_GET_ALL = 'recent:getAll'
export const RECENT_CLEAR = 'recent:clear'

// ---------------------------------------------------------------------------
// Project service channels (invoke)
// ---------------------------------------------------------------------------

export const PROJECT_GET_STATE = 'project:getState'
export const PROJECT_IS_LOADED = 'project:isLoaded'
export const PROJECT_CREATE = 'project:create'
export const PROJECT_LOAD = 'project:load'
export const PROJECT_COMPILE = 'project:compile'
export const PROJECT_LOAD_MERGE_FILES = 'project:loadMergeFiles'
export const PROJECT_UNLOAD = 'project:unload'
export const PROJECT_MARK_CHANGED = 'project:markChanged'
export const PROJECT_MARK_SAVED = 'project:markSaved'
export const PROJECT_SET_SERVER_ITEMS_PATH = 'project:setServerItemsPath'
export const PROJECT_UPDATE_FEATURES = 'project:updateFeatures'
export const PROJECT_DISCOVER_CLIENT_FILES = 'project:discoverClientFiles'
export const PROJECT_DISCOVER_SERVER_ITEM_FILES = 'project:discoverServerItemFiles'
export const PROJECT_READ_SPRITES = 'project:readSprites'

/** event: main notifies renderer that project state changed */
export const PROJECT_STATE_CHANGED = 'project:stateChanged'

// ---------------------------------------------------------------------------
// Settings service channels (invoke)
// ---------------------------------------------------------------------------

export const SETTINGS_LOAD = 'settings:load'
export const SETTINGS_SAVE = 'settings:save'
export const SETTINGS_GET = 'settings:get'
export const SETTINGS_SET = 'settings:set'
export const SETTINGS_GET_ALL = 'settings:getAll'
export const SETTINGS_RESET = 'settings:reset'
export const SETTINGS_GET_WINDOW_STATE = 'settings:getWindowState'
export const SETTINGS_SAVE_WINDOW_STATE = 'settings:saveWindowState'

// ---------------------------------------------------------------------------
// Logger channels (invoke)
// ---------------------------------------------------------------------------

/** invoke: renderer writes a log entry to the persistent log file */
export const LOG_WRITE = 'log:write'
/** invoke: renderer gets the path to the persistent log file */
export const LOG_GET_PATH = 'log:getPath'
/** invoke: renderer opens the log file in the system default editor */
export const LOG_OPEN_FILE = 'log:openFile'

// ---------------------------------------------------------------------------
// App lifecycle channels
// ---------------------------------------------------------------------------

/** event: main asks renderer to confirm window close (unsaved changes check) */
export const APP_CONFIRM_CLOSE = 'app:confirmClose'

/** invoke: renderer confirms that the window can be closed */
export const APP_CLOSE_CONFIRMED = 'app:closeConfirmed'

// ---------------------------------------------------------------------------
// Object Viewer channels
// ---------------------------------------------------------------------------

/** invoke: renderer asks main to open/focus the detached object viewer window */
export const OBJECT_VIEWER_OPEN = 'objectViewer:open'

/** invoke: renderer stores the current thing snapshot for the detached object viewer */
export const OBJECT_VIEWER_SET_CURRENT_THING = 'objectViewer:setCurrentThing'

/** invoke: renderer asks main for the last stored thing snapshot */
export const OBJECT_VIEWER_GET_CURRENT_THING = 'objectViewer:getCurrentThing'

/** event: main notifies the detached object viewer about a new thing snapshot */
export const OBJECT_VIEWER_CURRENT_THING_CHANGED = 'objectViewer:currentThingChanged'

// ---------------------------------------------------------------------------
// Recovery channels (invoke)
// ---------------------------------------------------------------------------

/** invoke: renderer asks main for recovery data from a previous crashed session */
export const RECOVERY_GET_DATA = 'recovery:getData'

/** invoke: renderer asks main to clear recovery data (after handling or dismissing) */
export const RECOVERY_CLEAR = 'recovery:clear'

// ---------------------------------------------------------------------------
// Menu channels
// ---------------------------------------------------------------------------

/** event: main notifies renderer of a menu action click */
export const MENU_ACTION = 'menu:action'

/** invoke: renderer asks main to update menu state (enable/disable, checked) */
export const MENU_UPDATE_STATE = 'menu:updateState'

/** invoke: renderer asks main for current menu state */
export const MENU_GET_STATE = 'menu:getState'

// ---------------------------------------------------------------------------
// Updater channels
// ---------------------------------------------------------------------------

/** invoke: renderer asks main to check for updates */
export const UPDATER_CHECK = 'updater:check'

/** invoke: renderer asks main to download available update */
export const UPDATER_DOWNLOAD = 'updater:download'

/** invoke: renderer asks main to quit and install downloaded update */
export const UPDATER_INSTALL = 'updater:install'

/** event: main notifies renderer of update status changes */
export const UPDATER_STATUS = 'updater:status'

// ---------------------------------------------------------------------------
// All invoke channels (for validation / whitelisting)
// ---------------------------------------------------------------------------

export const INVOKE_CHANNELS = [
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
  MENU_UPDATE_STATE,
  MENU_GET_STATE,
  // Logger
  LOG_WRITE,
  LOG_GET_PATH,
  LOG_OPEN_FILE,
  // App lifecycle
  APP_CLOSE_CONFIRMED,
  // Object viewer
  OBJECT_VIEWER_OPEN,
  OBJECT_VIEWER_SET_CURRENT_THING,
  OBJECT_VIEWER_GET_CURRENT_THING,
  // Recovery
  RECOVERY_GET_DATA,
  RECOVERY_CLEAR,
  // Updater
  UPDATER_CHECK,
  UPDATER_DOWNLOAD,
  UPDATER_INSTALL
] as const

/** All event channels (main -> renderer) */
export const EVENT_CHANNELS = [
  FILE_CHANGED,
  PROJECT_STATE_CHANGED,
  MENU_ACTION,
  APP_CONFIRM_CLOSE,
  OBJECT_VIEWER_CURRENT_THING_CHANGED,
  UPDATER_STATUS
] as const
