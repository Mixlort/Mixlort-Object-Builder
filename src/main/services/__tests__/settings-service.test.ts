// @vitest-environment node

/**
 * Tests for the settings service.
 * Tests cover persistence, defaults, individual get/set, reset,
 * window state management, and migration safety (missing keys).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { ObjectBuilderSettings, WindowState } from '../../../shared/settings'
import { createObjectBuilderSettings, createDefaultWindowState } from '../../../shared/settings'

// ---------------------------------------------------------------------------
// Test helpers - mock app.getPath to use temp directories
// ---------------------------------------------------------------------------

let testDir: string

function getSettingsPath(): string {
  return join(testDir, 'settings.json')
}

function getWindowStatePath(): string {
  return join(testDir, 'window-state.json')
}

// We need to mock the electron app before importing the service
import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => testDir
  }
}))

// Import after mocking
import {
  loadSettings,
  saveSettings,
  getSettings,
  getSetting,
  setSetting,
  resetSettings,
  loadWindowState,
  saveWindowState,
  getWindowState,
  resetSettingsService
} from '../settings-service'

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = join(tmpdir(), `settings-test-${randomBytes(8).toString('hex')}`)
  await mkdir(testDir, { recursive: true })
  resetSettingsService()
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Shared settings type tests
// ---------------------------------------------------------------------------

describe('Shared Settings Types', () => {
  it('createObjectBuilderSettings returns all default values', () => {
    const settings = createObjectBuilderSettings()

    expect(settings.lastDirectory).toBeNull()
    expect(settings.lastMergeDirectory).toBeNull()
    expect(settings.lastIODirectory).toBeNull()
    expect(settings.lastServerItemsDirectory).toBeNull()
    expect(settings.exportThingFormat).toBeNull()
    expect(settings.exportSpriteFormat).toBeNull()
    expect(settings.datSignature).toBe(0)
    expect(settings.sprSignature).toBe(0)
    expect(settings.autosaveThingChanges).toBe(false)
    expect(settings.extended).toBe(false)
    expect(settings.transparency).toBe(false)
    expect(settings.improvedAnimations).toBe(false)
    expect(settings.frameGroups).toBe(false)
    expect(settings.maximized).toBe(true)
    expect(settings.showPreviewPanel).toBe(true)
    expect(settings.showThingsPanel).toBe(true)
    expect(settings.showEditorPanel).toBe(true)
    expect(settings.showSpritesPanel).toBe(true)
    expect(settings.objectsListAmount).toBe(100)
    expect(settings.spritesListAmount).toBe(100)
    expect(settings.hideEmptyObjects).toBe(false)
    expect(settings.exportWithTransparentBackground).toBe(false)
    expect(settings.jpegQuality).toBe(100)
    expect(settings.itemsDuration).toBe(500)
    expect(settings.outfitsDuration).toBe(300)
    expect(settings.effectsDuration).toBe(100)
    expect(settings.missilesDuration).toBe(75)
    expect(settings.thingListClipboardAction).toBe(0)
    expect(settings.deleteAfterPaste).toBe(false)
    expect(settings.lastAttributeServer).toBe('tfs1.4')
    expect(settings.syncOtbOnAdd).toBe(true)
    expect(settings.language).toBe('pt_BR')
    expect(settings.showLogPanel).toBe(true)
  })

  it('createDefaultWindowState returns correct defaults', () => {
    const state = createDefaultWindowState()

    expect(state.x).toBeUndefined()
    expect(state.y).toBeUndefined()
    expect(state.width).toBe(1280)
    expect(state.height).toBe(800)
    expect(state.maximized).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Settings persistence tests
// ---------------------------------------------------------------------------

describe('Settings Persistence', () => {
  it('loadSettings returns defaults when no file exists', async () => {
    const settings = await loadSettings()
    const defaults = createObjectBuilderSettings()

    expect(settings).toEqual(defaults)
  })

  it('saveSettings writes and loadSettings reads back', async () => {
    const settings = createObjectBuilderSettings()
    settings.language = 'pt_BR'
    settings.jpegQuality = 85
    settings.extended = true
    settings.lastDirectory = '/home/user/tibia'

    await saveSettings(settings)

    // Reset and reload
    resetSettingsService()
    const loaded = await loadSettings()

    expect(loaded.language).toBe('pt_BR')
    expect(loaded.jpegQuality).toBe(85)
    expect(loaded.extended).toBe(true)
    expect(loaded.lastDirectory).toBe('/home/user/tibia')
  })

  it('loadSettings merges with defaults for missing keys', async () => {
    // Write a partial settings file (simulates older version)
    const partial = { language: 'es_ES', jpegQuality: 90 }
    await writeFile(getSettingsPath(), JSON.stringify(partial), 'utf-8')

    const settings = await loadSettings()

    // Should have the saved values
    expect(settings.language).toBe('es_ES')
    expect(settings.jpegQuality).toBe(90)

    // Should have defaults for missing keys
    expect(settings.maximized).toBe(true)
    expect(settings.objectsListAmount).toBe(100)
    expect(settings.lastAttributeServer).toBe('tfs1.4')
  })

  it('loadSettings handles corrupted JSON gracefully', async () => {
    await writeFile(getSettingsPath(), 'not valid json {{{', 'utf-8')

    const settings = await loadSettings()
    const defaults = createObjectBuilderSettings()

    expect(settings).toEqual(defaults)
  })

  it('loadSettings only loads once (caches)', async () => {
    const settings1 = await loadSettings()
    settings1.language = 'de_DE'

    // Write a different file - should NOT be loaded since already cached
    const different = createObjectBuilderSettings()
    different.language = 'fr_FR'
    await writeFile(getSettingsPath(), JSON.stringify(different), 'utf-8')

    const settings2 = await loadSettings()
    // Should still be the first loaded value (pt_BR), not fr_FR
    expect(settings2.language).toBe('pt_BR')
  })

  it('saveSettings writes a valid JSON file', async () => {
    const settings = createObjectBuilderSettings()
    settings.language = 'pt_BR'
    settings.jpegQuality = 85

    await saveSettings(settings)

    // Verify the file was written and is valid JSON
    const content = await readFile(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(content) as ObjectBuilderSettings
    expect(parsed.language).toBe('pt_BR')
    expect(parsed.jpegQuality).toBe(85)
    // All default fields should be present
    expect(parsed.lastAttributeServer).toBe('tfs1.4')
  })

  it('settings JSON is human-readable (indented)', async () => {
    await saveSettings(createObjectBuilderSettings())

    const content = await readFile(getSettingsPath(), 'utf-8')
    expect(content).toContain('\n')
    expect(content).toContain('  ')
  })
})

// ---------------------------------------------------------------------------
// Individual get/set tests
// ---------------------------------------------------------------------------

describe('Individual Get/Set', () => {
  it('getSettings returns a copy of current settings', async () => {
    await loadSettings()
    const settings = getSettings()
    settings.language = 'changed'

    // Original should not be affected
    const again = getSettings()
    expect(again.language).toBe('pt_BR')
  })

  it('getSetting returns specific value', async () => {
    await loadSettings()

    expect(getSetting('language')).toBe('pt_BR')
    expect(getSetting('jpegQuality')).toBe(100)
    expect(getSetting('extended')).toBe(false)
    expect(getSetting('lastDirectory')).toBeNull()
  })

  it('setSetting updates and auto-saves', async () => {
    await loadSettings()

    await setSetting('language', 'pt_BR')
    expect(getSetting('language')).toBe('pt_BR')

    // Verify it was persisted
    const content = await readFile(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(content) as ObjectBuilderSettings
    expect(parsed.language).toBe('pt_BR')
  })

  it('setSetting handles multiple sequential updates', async () => {
    await loadSettings()

    await setSetting('jpegQuality', 75)
    await setSetting('extended', true)
    await setSetting('lastAttributeServer', 'tfs1.5')

    expect(getSetting('jpegQuality')).toBe(75)
    expect(getSetting('extended')).toBe(true)
    expect(getSetting('lastAttributeServer')).toBe('tfs1.5')
  })
})

// ---------------------------------------------------------------------------
// Reset tests
// ---------------------------------------------------------------------------

describe('Reset', () => {
  it('resetSettings restores all defaults', async () => {
    await loadSettings()
    await setSetting('language', 'pt_BR')
    await setSetting('jpegQuality', 50)
    await setSetting('extended', true)

    const reset = await resetSettings()
    const defaults = createObjectBuilderSettings()

    expect(reset).toEqual(defaults)
    expect(getSetting('language')).toBe('pt_BR')
    expect(getSetting('jpegQuality')).toBe(100)
    expect(getSetting('extended')).toBe(false)
  })

  it('resetSettings persists the reset values', async () => {
    await loadSettings()
    await setSetting('language', 'pt_BR')
    await resetSettings()

    // Verify file was updated
    const content = await readFile(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(content) as ObjectBuilderSettings
    expect(parsed.language).toBe('pt_BR')
  })
})

// ---------------------------------------------------------------------------
// Window state tests
// ---------------------------------------------------------------------------

describe('Window State', () => {
  it('loadWindowState returns defaults when no file exists', async () => {
    const state = await loadWindowState()
    const defaults = createDefaultWindowState()

    expect(state).toEqual(defaults)
  })

  it('saveWindowState writes and loadWindowState reads back', async () => {
    const state: WindowState = {
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      maximized: true
    }

    await saveWindowState(state)

    resetSettingsService()
    const loaded = await loadWindowState()

    expect(loaded.x).toBe(100)
    expect(loaded.y).toBe(200)
    expect(loaded.width).toBe(1400)
    expect(loaded.height).toBe(900)
    expect(loaded.maximized).toBe(true)
  })

  it('loadWindowState handles corrupted JSON gracefully', async () => {
    await writeFile(getWindowStatePath(), 'corrupt', 'utf-8')

    const state = await loadWindowState()
    const defaults = createDefaultWindowState()

    expect(state).toEqual(defaults)
  })

  it('loadWindowState validates numeric values', async () => {
    // Write invalid numeric values
    const invalid = { x: 'not-a-number', y: null, width: -100, height: 0, maximized: 'yes' }
    await writeFile(getWindowStatePath(), JSON.stringify(invalid), 'utf-8')

    const state = await loadWindowState()

    // Invalid values should fall back to defaults
    expect(state.x).toBeUndefined()
    expect(state.y).toBeUndefined()
    expect(state.width).toBe(1280) // default
    expect(state.height).toBe(800) // default
    expect(state.maximized).toBe(false) // default
  })

  it('loadWindowState only loads once (caches)', async () => {
    await loadWindowState()

    // Write different state
    const different: WindowState = { x: 999, y: 999, width: 999, height: 999, maximized: true }
    await writeFile(getWindowStatePath(), JSON.stringify(different), 'utf-8')

    const state = await loadWindowState()
    // Should still be defaults, not the new written values
    expect(state.width).toBe(1280)
  })

  it('getWindowState returns a copy', async () => {
    await loadWindowState()
    const state = getWindowState()
    state.width = 9999

    expect(getWindowState().width).toBe(1280)
  })

  it('window state JSON is human-readable', async () => {
    await saveWindowState(createDefaultWindowState())

    const content = await readFile(getWindowStatePath(), 'utf-8')
    expect(content).toContain('\n')
    expect(content).toContain('  ')
  })
})

// ---------------------------------------------------------------------------
// Settings service reset (for testing)
// ---------------------------------------------------------------------------

describe('Service Reset', () => {
  it('resetSettingsService clears cache so next load reads from disk', async () => {
    await loadSettings()
    await setSetting('language', 'pt_BR')

    // Save then reset
    resetSettingsService()

    // Should reload from disk
    const loaded = await loadSettings()
    expect(loaded.language).toBe('pt_BR')
  })
})
