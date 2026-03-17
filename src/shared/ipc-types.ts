/**
 * Shared IPC types used by both main process handlers and renderer (via preload).
 * All types here are fully serializable over Electron IPC (structured clone).
 *
 * Dialog option types mirror file-service.ts but exclude BrowserWindow references.
 * Other types are re-exported from their original locations for convenience.
 */

// Re-export project types (already serializable)
export type {
  ProjectFeatures,
  ProjectState,
  CreateProjectParams,
  LoadProjectParams,
  CompileProjectParams,
  MergeProjectParams,
  LoadProjectResult,
  MergeProjectResult
} from './project-state'

// Re-export settings types (already serializable)
export type { ObjectBuilderSettings, WindowState } from './settings'

// Re-export menu types (already serializable)
export type { MenuAction, MenuState } from './menu-actions'

// ---------------------------------------------------------------------------
// File filter (same as Electron's, already serializable)
// ---------------------------------------------------------------------------

export interface FileFilter {
  name: string
  extensions: string[]
}

// ---------------------------------------------------------------------------
// Dialog options (IPC-safe: no BrowserWindow references)
// ---------------------------------------------------------------------------

export interface IpcOpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
  multiSelections?: boolean
}

export interface IpcSaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

export interface IpcDirectoryDialogOptions {
  title?: string
  defaultPath?: string
}

// ---------------------------------------------------------------------------
// Dialog results
// ---------------------------------------------------------------------------

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface SaveDialogResult {
  canceled: boolean
  filePath: string | null
}

export interface DirectoryDialogResult {
  canceled: boolean
  directoryPath: string | null
}

// ---------------------------------------------------------------------------
// File info
// ---------------------------------------------------------------------------

export interface FileInfo {
  path: string
  name: string
  extension: string
  directory: string
  size: number
  /** Last modified timestamp in milliseconds (Date.getTime()) */
  lastModified: number
  exists: boolean
}

// ---------------------------------------------------------------------------
// File watch event
// ---------------------------------------------------------------------------

export interface FileChangedEvent {
  filePath: string
  eventType: 'change' | 'rename'
}

// ---------------------------------------------------------------------------
// Recent directories
// ---------------------------------------------------------------------------

export type RecentDirectoryKey =
  | 'lastDirectory'
  | 'lastMergeDirectory'
  | 'lastIODirectory'
  | 'lastServerItemsDirectory'

export interface RecentDirectoriesData {
  lastDirectory: string | null
  lastMergeDirectory: string | null
  lastIODirectory: string | null
  lastServerItemsDirectory: string | null
  recentClientDirectories: string[]
}

// ---------------------------------------------------------------------------
// File discovery results
// ---------------------------------------------------------------------------

export interface ClientFilesDiscovery {
  datFile: string | null
  sprFile: string | null
  otfiFile: string | null
}

export interface ServerItemFilesDiscovery {
  otbFile: string | null
  xmlFile: string | null
}
