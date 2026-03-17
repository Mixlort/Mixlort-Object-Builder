/**
 * Recent directories manager for the main process.
 * Tracks recently used directory paths for file operations and persists them
 * to a JSON file in the app data directory.
 *
 * Ported from legacy ObjectBuilderSettings directory management:
 * - lastDirectory (client files open/compile)
 * - lastMergeDirectory (merge operations)
 * - lastIODirectory (import/export operations)
 * - lastServerItemsDirectory (server items folder)
 */

import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Keys for recent directory tracking (matches legacy ObjectBuilderSettings) */
export type RecentDirectoryKey =
  | 'lastDirectory'
  | 'lastMergeDirectory'
  | 'lastIODirectory'
  | 'lastServerItemsDirectory'

interface RecentDirectoriesData {
  lastDirectory: string | null
  lastMergeDirectory: string | null
  lastIODirectory: string | null
  lastServerItemsDirectory: string | null
  recentClientDirectories: string[]
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_DATA: RecentDirectoriesData = {
  lastDirectory: null,
  lastMergeDirectory: null,
  lastIODirectory: null,
  lastServerItemsDirectory: null,
  recentClientDirectories: []
}

const MAX_RECENT_CLIENT_DIRECTORIES = 8

let data: RecentDirectoriesData = { ...DEFAULT_DATA }
let loaded = false

// ---------------------------------------------------------------------------
// File path (uses app.getPath which requires app ready)
// ---------------------------------------------------------------------------

function getStoragePath(): string {
  return join(app.getPath('userData'), 'recent-directories.json')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads recent directories from disk.
 * Safe to call multiple times - only loads once.
 */
export async function loadRecentDirectories(): Promise<void> {
  if (loaded) return

  try {
    const filePath = getStoragePath()
    const content = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<RecentDirectoriesData>

    data = {
      lastDirectory: parsed.lastDirectory ?? null,
      lastMergeDirectory: parsed.lastMergeDirectory ?? null,
      lastIODirectory: parsed.lastIODirectory ?? null,
      lastServerItemsDirectory: parsed.lastServerItemsDirectory ?? null,
      recentClientDirectories: Array.isArray(parsed.recentClientDirectories)
        ? parsed.recentClientDirectories.filter((value): value is string => typeof value === 'string')
        : parsed.lastDirectory
          ? [parsed.lastDirectory]
          : []
    }
  } catch {
    // File doesn't exist or is invalid - use defaults
    data = { ...DEFAULT_DATA }
  }

  loaded = true
}

/**
 * Saves recent directories to disk.
 */
export async function saveRecentDirectories(): Promise<void> {
  const filePath = getStoragePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Gets a recent directory path.
 * Returns null if no directory has been stored for this key.
 */
export function getRecentDirectory(key: RecentDirectoryKey): string | null {
  return data[key]
}

/**
 * Sets a recent directory path and auto-saves.
 * Extracts the directory from a file path if needed (matches legacy setLastDirectory behavior).
 */
export async function setRecentDirectory(
  key: RecentDirectoryKey,
  directoryPath: string | null
): Promise<void> {
  data[key] = directoryPath

  if (key === 'lastDirectory' && directoryPath) {
    data.recentClientDirectories = [
      directoryPath,
      ...data.recentClientDirectories.filter((path) => path !== directoryPath)
    ].slice(0, MAX_RECENT_CLIENT_DIRECTORIES)
  }

  await saveRecentDirectories()
}

/**
 * Gets all recent directories.
 */
export function getAllRecentDirectories(): Readonly<RecentDirectoriesData> {
  return { ...data }
}

/**
 * Clears all recent directories.
 */
export async function clearRecentDirectories(): Promise<void> {
  data = { ...DEFAULT_DATA }
  await saveRecentDirectories()
}

/**
 * Resets loaded state (for testing purposes).
 */
export function resetRecentDirectories(): void {
  data = { ...DEFAULT_DATA }
  loaded = false
}
