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

export interface CompileRecoveryData {
  status: 'writing' | 'completed'
  files: string[]
  startedAt: number
  completedAt?: number
}

export interface CompileRecoveryResolution {
  status: 'none' | 'restored' | 'clearedCompleted'
  restoredFiles: string[]
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let recoveryPath = ''
let compileRecoveryPath = ''

function getRecoveryPath(): string {
  if (!recoveryPath) {
    recoveryPath = join(app.getPath('userData'), 'recovery.json')
  }
  return recoveryPath
}

function getCompileRecoveryPath(): string {
  if (!compileRecoveryPath) {
    compileRecoveryPath = join(app.getPath('userData'), 'compile-recovery.json')
  }
  return compileRecoveryPath
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

function saveCompileRecoveryData(data: CompileRecoveryData): void {
  try {
    writeFileSync(getCompileRecoveryPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Silently ignore write errors (non-critical)
  }
}

function getCompileRecoveryData(): CompileRecoveryData | null {
  try {
    const p = getCompileRecoveryPath()
    if (!existsSync(p)) return null
    const content = readFileSync(p, 'utf-8')
    const data = JSON.parse(content)
    if (
      data &&
      Array.isArray(data.files) &&
      (data.status === 'writing' || data.status === 'completed')
    ) {
      return data as CompileRecoveryData
    }
    return null
  } catch {
    return null
  }
}

export function beginCompileRecovery(filePaths: string[]): void {
  saveCompileRecoveryData({
    status: 'writing',
    files: Array.from(new Set(filePaths)),
    startedAt: Date.now()
  })
}

export function markCompileRecoveryCompleted(): void {
  const current = getCompileRecoveryData()
  if (!current) return

  saveCompileRecoveryData({
    ...current,
    status: 'completed',
    completedAt: Date.now()
  })
}

export function clearCompileRecovery(): void {
  try {
    const p = getCompileRecoveryPath()
    if (existsSync(p)) {
      unlinkSync(p)
    }
  } catch {
    // Silently ignore delete errors (non-critical)
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

export function restoreBackedUpFiles(filePaths: string[]): string[] {
  const restoredFiles: string[] = []

  for (const filePath of filePaths) {
    const backupPath = `${filePath}.bak`
    try {
      if (!existsSync(backupPath)) {
        continue
      }
      copyFileSync(backupPath, filePath)
      restoredFiles.push(filePath)
    } catch {
      // Silently ignore restore errors (non-critical)
    }
  }

  return restoredFiles
}

export function resolveCompileRecoveryOnStartup(): CompileRecoveryResolution {
  const data = getCompileRecoveryData()
  if (!data) {
    return { status: 'none', restoredFiles: [] }
  }

  if (data.status === 'completed') {
    clearCompileRecovery()
    return { status: 'clearedCompleted', restoredFiles: [] }
  }

  const restoredFiles = restoreBackedUpFiles(data.files)
  clearCompileRecovery()
  return {
    status: 'restored',
    restoredFiles
  }
}

// ---------------------------------------------------------------------------
// Testing
// ---------------------------------------------------------------------------

export function resetRecoveryService(): void {
  recoveryPath = ''
  compileRecoveryPath = ''
}
