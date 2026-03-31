/**
 * File management service for the Electron main process.
 * Provides native file dialogs, async binary file I/O, file watching,
 * and utility functions for file operations.
 *
 * Ported from legacy AIR File/FileReference usage across ObjectBuilder.mxml,
 * ObjectBuilderWorker.as, and various command classes.
 */

import { dialog, BrowserWindow } from 'electron'
import { readFile, stat, readdir, access, mkdir, open, rename, unlink } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { constants as fsConstants } from 'fs'
import type { FileFilter } from './file-filters'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
  multiSelections?: boolean
  /** Parent window for modal behavior */
  parentWindow?: BrowserWindow | null
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
  parentWindow?: BrowserWindow | null
}

export interface DirectoryDialogOptions {
  title?: string
  defaultPath?: string
  parentWindow?: BrowserWindow | null
}

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

export interface FileInfo {
  path: string
  name: string
  extension: string
  directory: string
  size: number
  lastModified: Date
  exists: boolean
}

export type FileWatchCallback = (eventType: 'change' | 'rename', filename: string | null) => void

// ---------------------------------------------------------------------------
// File Dialogs
// ---------------------------------------------------------------------------

/**
 * Shows a native open file dialog.
 * Equivalent to legacy File.browseForOpen() / File.browseForOpenMultiple().
 */
export async function showOpenDialog(options: OpenDialogOptions = {}): Promise<OpenDialogResult> {
  const properties: ('openFile' | 'multiSelections')[] = ['openFile']
  if (options.multiSelections) {
    properties.push('multiSelections')
  }

  const result = await dialog.showOpenDialog(
    options.parentWindow ?? BrowserWindow.getFocusedWindow()!,
    {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties
    }
  )

  return {
    canceled: result.canceled,
    filePaths: result.filePaths
  }
}

/**
 * Shows a native save file dialog.
 */
export async function showSaveDialog(options: SaveDialogOptions = {}): Promise<SaveDialogResult> {
  const result = await dialog.showSaveDialog(
    options.parentWindow ?? BrowserWindow.getFocusedWindow()!,
    {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters
    }
  )

  return {
    canceled: result.canceled,
    filePath: result.filePath ?? null
  }
}

/**
 * Shows a native directory picker dialog.
 * Equivalent to legacy File.browseForDirectory().
 */
export async function showDirectoryDialog(
  options: DirectoryDialogOptions = {}
): Promise<DirectoryDialogResult> {
  const result = await dialog.showOpenDialog(
    options.parentWindow ?? BrowserWindow.getFocusedWindow()!,
    {
      title: options.title,
      defaultPath: options.defaultPath,
      properties: ['openDirectory']
    }
  )

  return {
    canceled: result.canceled,
    directoryPath: result.filePaths[0] ?? null
  }
}

// ---------------------------------------------------------------------------
// Binary File I/O
// ---------------------------------------------------------------------------

function makeAtomicTempPath(filePath: string): string {
  return `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function commitAtomicTempFile(tempPath: string, filePath: string): Promise<void> {
  try {
    await rename(tempPath, filePath)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY') {
      await unlink(filePath).catch(() => undefined)
      await rename(tempPath, filePath)
      return
    }
    throw error
  }
}

async function writeBufferAtomic(filePath: string, buffer: Buffer): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })

  const tempPath = makeAtomicTempPath(filePath)
  const handle = await open(tempPath, 'w')

  try {
    await handle.writeFile(buffer)
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    await commitAtomicTempFile(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

/**
 * Reads a file as an ArrayBuffer (async).
 * Equivalent to legacy FileStream read operations.
 */
export async function readBinaryFile(filePath: string): Promise<ArrayBuffer> {
  const buffer = await readFile(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * Writes an ArrayBuffer to a file (async).
 * Creates parent directories if they don't exist.
 * Equivalent to legacy SaveHelper / FileStream write operations.
 */
export async function writeBinaryFile(filePath: string, data: ArrayBuffer): Promise<void> {
  await writeBufferAtomic(filePath, Buffer.from(data))
}

/**
 * Reads a text file as a string (async).
 */
export async function readTextFile(
  filePath: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<string> {
  return readFile(filePath, { encoding })
}

/**
 * Writes a string to a text file (async).
 * Creates parent directories if they don't exist.
 */
export async function writeTextFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  await writeBufferAtomic(filePath, Buffer.from(content, encoding))
}

// ---------------------------------------------------------------------------
// File Utilities
// ---------------------------------------------------------------------------

/**
 * Checks if a file or directory exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Gets file information (size, modification date, etc.).
 */
export async function getFileInfo(filePath: string): Promise<FileInfo> {
  const exists = await fileExists(filePath)

  if (!exists) {
    return {
      path: filePath,
      name: basename(filePath),
      extension: extname(filePath).toLowerCase(),
      directory: dirname(filePath),
      size: 0,
      lastModified: new Date(0),
      exists: false
    }
  }

  const stats = await stat(filePath)
  return {
    path: filePath,
    name: basename(filePath),
    extension: extname(filePath).toLowerCase(),
    directory: dirname(filePath),
    size: stats.size,
    lastModified: stats.mtime,
    exists: true
  }
}

/**
 * Lists files in a directory matching optional extension filter.
 * Equivalent to legacy directory listing used in ClientInfoLoader.
 */
export async function listFiles(directoryPath: string, extensions?: string[]): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue

    if (extensions && extensions.length > 0) {
      const ext = extname(entry.name).toLowerCase().slice(1) // Remove leading dot
      if (!extensions.includes(ext)) continue
    }

    files.push(join(directoryPath, entry.name))
  }

  return files.sort()
}

/**
 * Finds a file with specific name in a directory (case-insensitive).
 * Useful for finding Tibia.dat/Tibia.spr in a client directory.
 */
export async function findFileInDirectory(
  directoryPath: string,
  fileName: string
): Promise<string | null> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const lowerName = fileName.toLowerCase()

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === lowerName) {
      return join(directoryPath, entry.name)
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// File Watching
// ---------------------------------------------------------------------------

/** Active file watchers, keyed by file path */
const activeWatchers = new Map<string, FSWatcher>()

/**
 * Starts watching a file for changes.
 * Returns a cleanup function to stop watching.
 */
export function watchFile(filePath: string, callback: FileWatchCallback): () => void {
  // Stop existing watcher for this path if any
  unwatchFile(filePath)

  const watcher = watch(filePath, (eventType, filename) => {
    callback(eventType as 'change' | 'rename', filename)
  })

  activeWatchers.set(filePath, watcher)

  return () => unwatchFile(filePath)
}

/**
 * Stops watching a file.
 */
export function unwatchFile(filePath: string): void {
  const watcher = activeWatchers.get(filePath)
  if (watcher) {
    watcher.close()
    activeWatchers.delete(filePath)
  }
}

/**
 * Stops all active file watchers.
 */
export function unwatchAll(): void {
  for (const [, watcher] of activeWatchers) {
    watcher.close()
  }
  activeWatchers.clear()
}

/**
 * Returns the number of active file watchers.
 */
export function getActiveWatcherCount(): number {
  return activeWatchers.size
}
