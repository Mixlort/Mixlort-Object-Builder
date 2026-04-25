/**
 * Type declarations for the preload API exposed to the renderer.
 * The renderer accesses these via window.api.
 *
 * Referenced by src/renderer/src/env.d.ts via triple-slash directive.
 * Types use shared IPC types from src/shared/ipc-types.ts.
 */

import type {
  IpcOpenDialogOptions,
  IpcSaveDialogOptions,
  IpcDirectoryDialogOptions,
  OpenDialogResult,
  SaveDialogResult,
  DirectoryDialogResult,
  FileInfo,
  FileChangedEvent,
  RecentDirectoryKey,
  RecentDirectoriesData,
  ClientFilesDiscovery,
  ServerItemFilesDiscovery,
  ProjectFeatures,
  ProjectState,
  CreateProjectParams,
  LoadProjectParams,
  CompileProjectParams,
  MergeProjectParams,
  SpriteSourceDescriptor,
  LoadProjectResult,
  MergeProjectResult,
  ReadProjectSpritesResult,
  ObjectBuilderSettings,
  WindowState,
  MenuAction,
  MenuState
} from '../shared/ipc-types'
import type { ThingData } from '../renderer/src/types/things'

// Re-export types for renderer convenience
export type {
  IpcOpenDialogOptions,
  IpcSaveDialogOptions,
  IpcDirectoryDialogOptions,
  OpenDialogResult,
  SaveDialogResult,
  DirectoryDialogResult,
  FileInfo,
  FileChangedEvent,
  RecentDirectoryKey,
  RecentDirectoriesData,
  ClientFilesDiscovery,
  ServerItemFilesDiscovery,
  ProjectFeatures,
  ProjectState,
  CreateProjectParams,
  LoadProjectParams,
  CompileProjectParams,
  MergeProjectParams,
  SpriteSourceDescriptor,
  LoadProjectResult,
  MergeProjectResult,
  ReadProjectSpritesResult,
  ObjectBuilderSettings,
  WindowState,
  MenuAction,
  MenuState
}

// ---------------------------------------------------------------------------
// File API
// ---------------------------------------------------------------------------

export interface ElectronFileAPI {
  /** Show native open file dialog */
  showOpenDialog(options?: IpcOpenDialogOptions): Promise<OpenDialogResult>
  /** Show native save file dialog */
  showSaveDialog(options?: IpcSaveDialogOptions): Promise<SaveDialogResult>
  /** Show native directory picker dialog */
  showDirectoryDialog(options?: IpcDirectoryDialogOptions): Promise<DirectoryDialogResult>

  /** Read a file as ArrayBuffer */
  readBinary(filePath: string): Promise<ArrayBuffer>
  /** Read a byte range from a file as ArrayBuffer */
  readBinaryRange(filePath: string, position: number, length: number): Promise<ArrayBuffer>
  /** Write an ArrayBuffer to a file */
  writeBinary(filePath: string, data: ArrayBuffer): Promise<void>
  /** Read a file as text string */
  readText(filePath: string, encoding?: string): Promise<string>
  /** Write a text string to a file */
  writeText(filePath: string, content: string, encoding?: string): Promise<void>

  /** Check if a file exists */
  exists(filePath: string): Promise<boolean>
  /** Get file info (size, name, extension, etc.) */
  getInfo(filePath: string): Promise<FileInfo>
  /** List files in a directory, optionally filtered by extensions */
  list(directoryPath: string, extensions?: string[]): Promise<string[]>
  /** Find a file by name in a directory (case-insensitive) */
  findInDirectory(directoryPath: string, fileName: string): Promise<string | null>

  /** Start watching a file for changes */
  watch(filePath: string): Promise<void>
  /** Stop watching a file */
  unwatch(filePath: string): Promise<void>
  /** Stop all file watchers */
  unwatchAll(): Promise<void>
  /** Listen for file change events. Returns cleanup function. */
  onFileChanged(callback: (event: FileChangedEvent) => void): () => void
}

// ---------------------------------------------------------------------------
// Recent Directories API
// ---------------------------------------------------------------------------

export interface ElectronRecentAPI {
  /** Load recent directories from persistent storage */
  load(): Promise<void>
  /** Get a recent directory path by key */
  get(key: RecentDirectoryKey): Promise<string | null>
  /** Set a recent directory path (auto-persists) */
  set(key: RecentDirectoryKey, path: string | null): Promise<void>
  /** Get all recent directory paths */
  getAll(): Promise<RecentDirectoriesData>
  /** Clear all recent directory paths */
  clear(): Promise<void>
}

// ---------------------------------------------------------------------------
// Project API
// ---------------------------------------------------------------------------

export interface ElectronProjectAPI {
  /** Get current project state (read-only snapshot) */
  getState(): Promise<ProjectState>
  /** Check if a project is loaded */
  isLoaded(): Promise<boolean>

  /** Create a new empty project */
  create(params: CreateProjectParams): Promise<ProjectState>
  /** Load project files from disk */
  load(params: LoadProjectParams): Promise<LoadProjectResult>
  /** Compile (save) project files to disk */
  compile(params: CompileProjectParams): Promise<void>
  /** Load another set of client files for merging */
  loadMergeFiles(params: MergeProjectParams): Promise<MergeProjectResult>
  /** Unload the current project */
  unload(): Promise<void>

  /** Mark project as having unsaved changes */
  markChanged(): Promise<void>
  /** Mark project as saved (no unsaved changes) */
  markSaved(): Promise<void>
  /** Update the server items path */
  setServerItemsPath(path: string | null): Promise<void>
  /** Update project feature flags */
  updateFeatures(features: Partial<ProjectFeatures>): Promise<void>

  /** Discover client files (DAT, SPR, OTFI) in a directory */
  discoverClientFiles(dir: string): Promise<ClientFilesDiscovery>
  /** Discover server item files (OTB, XML) in a directory */
  discoverServerItemFiles(dir: string): Promise<ServerItemFilesDiscovery>
  /** Read compressed sprites from the current file-backed sprite source */
  readSprites(ids: number[]): Promise<ReadProjectSpritesResult>

  /** Listen for project state change events. Returns cleanup function. */
  onStateChanged(callback: (state: ProjectState) => void): () => void
}

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export interface ElectronSettingsAPI {
  /** Load settings from persistent storage */
  load(): Promise<ObjectBuilderSettings>
  /** Save full settings to persistent storage */
  save(settings: ObjectBuilderSettings): Promise<void>
  /** Get a single setting value by key */
  get<K extends keyof ObjectBuilderSettings>(key: K): Promise<ObjectBuilderSettings[K]>
  /** Set a single setting value (auto-persists) */
  set<K extends keyof ObjectBuilderSettings>(key: K, value: ObjectBuilderSettings[K]): Promise<void>
  /** Get all settings */
  getAll(): Promise<ObjectBuilderSettings>
  /** Reset all settings to defaults */
  reset(): Promise<ObjectBuilderSettings>
  /** Get saved window state (bounds, maximized) */
  getWindowState(): Promise<WindowState>
  /** Save window state */
  saveWindowState(state: WindowState): Promise<void>
}

// ---------------------------------------------------------------------------
// Menu API
// ---------------------------------------------------------------------------

export interface ElectronMenuAPI {
  /** Update menu state (enable/disable items, checked state). Auto-rebuilds menu. */
  updateState(state: Partial<MenuState>): Promise<void>
  /** Get the current menu state */
  getState(): Promise<MenuState>
  /** Listen for menu action events (menu item clicks). Returns cleanup function. */
  onAction(callback: (action: MenuAction) => void): () => void
}

// ---------------------------------------------------------------------------
// Logger API
// ---------------------------------------------------------------------------

export interface ElectronLogAPI {
  /** Write a log entry to the persistent log file */
  write(level: 'info' | 'warning' | 'error', message: string): Promise<void>
  /** Get the path to the persistent log file */
  getPath(): Promise<string>
  /** Open the log file in the system default editor */
  openFile(): Promise<void>
}

// ---------------------------------------------------------------------------
// App Lifecycle API
// ---------------------------------------------------------------------------

export interface ElectronAppAPI {
  /** Listen for close confirmation request from main process. Returns cleanup function. */
  onConfirmClose(callback: () => void): () => void
  /** Confirm that the window can be closed (destroys the window) */
  closeConfirmed(): Promise<void>
}

// ---------------------------------------------------------------------------
// Object Viewer API
// ---------------------------------------------------------------------------

export interface ElectronObjectViewerAPI {
  /** Open or focus the detached object viewer window. */
  open(): Promise<void>
  /** Store the current thing snapshot for the detached object viewer. */
  setCurrentThing(thingData: ThingData | null): Promise<void>
  /** Read the latest stored thing snapshot. */
  getCurrentThing(): Promise<ThingData | null>
  /** Listen for thing snapshot changes. Returns cleanup function. */
  onCurrentThingChanged(callback: (thingData: ThingData | null) => void): () => void
}

// ---------------------------------------------------------------------------
// Recovery API
// ---------------------------------------------------------------------------

export interface RecoveryData {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  serverItemsPath: string | null
  features?: {
    extended: boolean
    transparency: boolean
    improvedAnimations: boolean
    frameGroups: boolean
    metadataController: string
    attributeServer: string | null
  }
  timestamp: number
}

export interface ElectronRecoveryAPI {
  /** Check if recovery data exists from a previous crashed session */
  getData(): Promise<RecoveryData | null>
  /** Clear recovery data (after handling or dismissing) */
  clear(): Promise<void>
}

// ---------------------------------------------------------------------------
// Updater API
// ---------------------------------------------------------------------------

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
}

export interface ElectronUpdaterAPI {
  /** Check for available updates */
  checkForUpdates(): Promise<void>
  /** Download the available update */
  downloadUpdate(): Promise<void>
  /** Quit and install the downloaded update */
  installUpdate(): Promise<void>
  /** Listen for update status events. Returns cleanup function. */
  onStatus(callback: (status: UpdateStatus) => void): () => void
}

// ---------------------------------------------------------------------------
// Combined API
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  file: ElectronFileAPI
  recent: ElectronRecentAPI
  project: ElectronProjectAPI
  settings: ElectronSettingsAPI
  menu: ElectronMenuAPI
  log: ElectronLogAPI
  app: ElectronAppAPI
  objectViewer: ElectronObjectViewerAPI
  recovery: ElectronRecoveryAPI
  updater: ElectronUpdaterAPI
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
