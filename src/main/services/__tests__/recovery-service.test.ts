// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, rm, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

let testDir = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => testDir
  }
}))

import {
  beginCompileRecovery,
  markCompileRecoveryCompleted,
  resolveCompileRecoveryOnStartup,
  resetRecoveryService
} from '../recovery-service'

beforeEach(async () => {
  testDir = join(tmpdir(), `recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(testDir, { recursive: true })
  resetRecoveryService()
})

afterEach(async () => {
  resetRecoveryService()
  await rm(testDir, { recursive: true, force: true })
})

describe('recovery-service compile recovery', () => {
  it('restores .bak files on next startup when compile was interrupted', async () => {
    const datPath = join(testDir, 'Tibia.dat')
    const sprPath = join(testDir, 'Tibia.spr')

    await writeFile(datPath, Buffer.from([9, 9, 9]))
    await writeFile(sprPath, Buffer.from([8, 8, 8]))
    await writeFile(`${datPath}.bak`, Buffer.from([1, 2, 3]))
    await writeFile(`${sprPath}.bak`, Buffer.from([4, 5, 6]))

    beginCompileRecovery([datPath, sprPath])

    const result = resolveCompileRecoveryOnStartup()

    expect(result.status).toBe('restored')
    expect(result.restoredFiles).toEqual([datPath, sprPath])
    expect(Array.from(await readFile(datPath))).toEqual([1, 2, 3])
    expect(Array.from(await readFile(sprPath))).toEqual([4, 5, 6])
    expect(resolveCompileRecoveryOnStartup()).toEqual({ status: 'none', restoredFiles: [] })
  })

  it('clears completed compile markers without restoring backups', async () => {
    const datPath = join(testDir, 'Tibia.dat')
    await writeFile(datPath, Buffer.from([9, 9, 9]))
    await writeFile(`${datPath}.bak`, Buffer.from([1, 2, 3]))

    beginCompileRecovery([datPath])
    markCompileRecoveryCompleted()

    const result = resolveCompileRecoveryOnStartup()

    expect(result).toEqual({ status: 'clearedCompleted', restoredFiles: [] })
    expect(Array.from(await readFile(datPath))).toEqual([9, 9, 9])
    expect(resolveCompileRecoveryOnStartup()).toEqual({ status: 'none', restoredFiles: [] })
  })
})
