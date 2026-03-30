/**
 * Recovery service for crash detection and project reopening.
 *
 * Saves project metadata to {userData}/recovery.json when a project is loaded.
 * Clears the file on clean close or project unload.
 * On startup, if recovery.json exists, the previous session crashed — the
 * renderer can offer to reopen the last project.
 *
 * Also provides backup-before-compile: copies existing DAT/SPR files to .bak
 * before overwriting them.
 */

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync, existsSync, copyFileSync } from 'fs'
import type { ProjectFeatures } from '../../shared/project-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecoveryData {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  serverItemsPath: string | null
  features: ProjectFeatures
  timestamp: number
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let recoveryPath = ''

function getRecoveryPath(): string {
  if (!recoveryPath) {
    recoveryPath = join(app.getPath('userData'), 'recovery.json')
  }
  return recoveryPath
}

// ---------------------------------------------------------------------------
// Recovery metadata
// ---------------------------------------------------------------------------

/**
 * Save recovery metadata (called when a project is loaded).
 * If the app crashes, this file will persist and be detected on next startup.
 */
export function saveRecoveryData(data: RecoveryData): void {
  try {
    writeFileSync(getRecoveryPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Silently ignore write errors (non-critical)
  }
}

/**
 * Clear recovery metadata (called on clean close or project unload).
 */
export function clearRecoveryData(): void {
  try {
    const p = getRecoveryPath()
    if (existsSync(p)) {
      unlinkSync(p)
    }
  } catch {
    // Silently ignore delete errors (non-critical)
  }
}

/**
 * Check if recovery data exists from a previous crashed session.
 * Returns the data if found, null otherwise.
 */
export function getRecoveryData(): RecoveryData | null {
  try {
    const p = getRecoveryPath()
    if (!existsSync(p)) return null
    const content = readFileSync(p, 'utf-8')
    const data = JSON.parse(content)
    if (data && typeof data.datFilePath === 'string' && typeof data.sprFilePath === 'string') {
      return data as RecoveryData
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Backup before compile
// ---------------------------------------------------------------------------

/**
 * Create backup copies of files before overwriting them.
 * Copies each file to {file}.bak, overwriting any previous backup.
 */
export function backupFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      if (existsSync(filePath)) {
        copyFileSync(filePath, filePath + '.bak')
      }
    } catch {
      // Silently ignore backup errors (non-critical)
    }
  }
}

// ---------------------------------------------------------------------------
// Testing
// ---------------------------------------------------------------------------

export function resetRecoveryService(): void {
  recoveryPath = ''
}
