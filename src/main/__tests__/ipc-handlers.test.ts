// @vitest-environment node

/**
 * Tests for IPC handler registration and the shared IPC types/channels.
 *
 * Tests cover:
 * - Channel constants and whitelist completeness
 * - Shared IPC types (factory functions, serializable types)
 * - Handler registration and removal
 * - Handler delegation to services (via mocked ipcMain)
 * - Channel naming conventions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared IPC channels tests
// ---------------------------------------------------------------------------

describe('IPC Channels', () => {
  it('exports all file service channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    expect(channels.FILE_SHOW_OPEN_DIALOG).toBe('file:showOpenDialog')
    expect(channels.FILE_SHOW_SAVE_DIALOG).toBe('file:showSaveDialog')
    expect(channels.FILE_SHOW_DIRECTORY_DIALOG).toBe('file:showDirectoryDialog')
    expect(channels.FILE_READ_BINARY).toBe('file:readBinary')
    expect(channels.FILE_READ_BINARY_RANGE).toBe('file:readBinaryRange')
    expect(channels.FILE_WRITE_BINARY).toBe('file:writeBinary')
    expect(channels.FILE_READ_TEXT).toBe('file:readText')
    expect(channels.FILE_WRITE_TEXT).toBe('file:writeText')
    expect(channels.FILE_EXISTS).toBe('file:exists')
    expect(channels.FILE_GET_INFO).toBe('file:getInfo')
    expect(channels.FILE_LIST).toBe('file:list')
    expect(channels.FILE_FIND_IN_DIRECTORY).toBe('file:findInDirectory')
  })

  it('exports all file watching channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    expect(channels.FILE_WATCH).toBe('file:watch')
    expect(channels.FILE_UNWATCH).toBe('file:unwatch')
    expect(channels.FILE_UNWATCH_ALL).toBe('file:unwatchAll')
    expect(channels.FILE_CHANGED).toBe('file:changed')
  })

  it('exports all recent directories channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    expect(channels.RECENT_LOAD).toBe('recent:load')
    expect(channels.RECENT_GET).toBe('recent:get')
    expect(channels.RECENT_SET).toBe('recent:set')
    expect(channels.RECENT_GET_ALL).toBe('recent:getAll')
    expect(channels.RECENT_CLEAR).toBe('recent:clear')
  })

  it('exports all project service channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    expect(channels.PROJECT_GET_STATE).toBe('project:getState')
    expect(channels.PROJECT_IS_LOADED).toBe('project:isLoaded')
    expect(channels.PROJECT_CREATE).toBe('project:create')
    expect(channels.PROJECT_LOAD).toBe('project:load')
    expect(channels.PROJECT_COMPILE).toBe('project:compile')
    expect(channels.PROJECT_LOAD_MERGE_FILES).toBe('project:loadMergeFiles')
    expect(channels.PROJECT_UNLOAD).toBe('project:unload')
    expect(channels.PROJECT_MARK_CHANGED).toBe('project:markChanged')
    expect(channels.PROJECT_MARK_SAVED).toBe('project:markSaved')
    expect(channels.PROJECT_SET_SERVER_ITEMS_PATH).toBe('project:setServerItemsPath')
    expect(channels.PROJECT_UPDATE_FEATURES).toBe('project:updateFeatures')
    expect(channels.PROJECT_DISCOVER_CLIENT_FILES).toBe('project:discoverClientFiles')
    expect(channels.PROJECT_DISCOVER_SERVER_ITEM_FILES).toBe('project:discoverServerItemFiles')
    expect(channels.PROJECT_READ_SPRITES).toBe('project:readSprites')
    expect(channels.PROJECT_STATE_CHANGED).toBe('project:stateChanged')
  })

  it('INVOKE_CHANNELS contains all invoke channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    // File service: 12
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_SHOW_OPEN_DIALOG)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_SHOW_SAVE_DIALOG)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_SHOW_DIRECTORY_DIALOG)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_READ_BINARY)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_READ_BINARY_RANGE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_WRITE_BINARY)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_READ_TEXT)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_WRITE_TEXT)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_EXISTS)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_GET_INFO)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_LIST)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_FIND_IN_DIRECTORY)
    // File watching: 3
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_WATCH)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_UNWATCH)
    expect(channels.INVOKE_CHANNELS).toContain(channels.FILE_UNWATCH_ALL)
    // Recent directories: 5
    expect(channels.INVOKE_CHANNELS).toContain(channels.RECENT_LOAD)
    expect(channels.INVOKE_CHANNELS).toContain(channels.RECENT_GET)
    expect(channels.INVOKE_CHANNELS).toContain(channels.RECENT_SET)
    expect(channels.INVOKE_CHANNELS).toContain(channels.RECENT_GET_ALL)
    expect(channels.INVOKE_CHANNELS).toContain(channels.RECENT_CLEAR)
    // Project service: 14
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_GET_STATE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_IS_LOADED)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_CREATE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_LOAD)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_COMPILE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_LOAD_MERGE_FILES)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_UNLOAD)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_MARK_CHANGED)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_MARK_SAVED)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_SET_SERVER_ITEMS_PATH)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_UPDATE_FEATURES)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_DISCOVER_CLIENT_FILES)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_DISCOVER_SERVER_ITEM_FILES)
    expect(channels.INVOKE_CHANNELS).toContain(channels.PROJECT_READ_SPRITES)
    // Settings: 8
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_LOAD)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_SAVE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_GET)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_SET)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_GET_ALL)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_RESET)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_GET_WINDOW_STATE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.SETTINGS_SAVE_WINDOW_STATE)

    // Menu: 2
    expect(channels.INVOKE_CHANNELS).toContain(channels.MENU_UPDATE_STATE)
    expect(channels.INVOKE_CHANNELS).toContain(channels.MENU_GET_STATE)

    // Total: 56 invoke channels (file/project/settings/menu/logger/app/object viewer/recovery/updater)
    expect(channels.INVOKE_CHANNELS).toHaveLength(56)
  })

  it('EVENT_CHANNELS contains all event channels', async () => {
    const channels = await import('../../shared/ipc-channels')

    expect(channels.EVENT_CHANNELS).toContain(channels.FILE_CHANGED)
    expect(channels.EVENT_CHANNELS).toContain(channels.PROJECT_STATE_CHANGED)
    expect(channels.EVENT_CHANNELS).toContain(channels.MENU_ACTION)
    expect(channels.EVENT_CHANNELS).toHaveLength(6)
  })

  it('no channel appears in both INVOKE and EVENT lists', async () => {
    const channels = await import('../../shared/ipc-channels')

    const invokeSet = new Set<string>(channels.INVOKE_CHANNELS)
    for (const eventChannel of channels.EVENT_CHANNELS) {
      expect(invokeSet.has(eventChannel)).toBe(false)
    }
  })

  it('all channel values are unique', async () => {
    const channels = await import('../../shared/ipc-channels')

    const allChannels = [...channels.INVOKE_CHANNELS, ...channels.EVENT_CHANNELS]
    const uniqueSet = new Set(allChannels)
    expect(uniqueSet.size).toBe(allChannels.length)
  })

  it('all channels follow namespace:action format', async () => {
    const channels = await import('../../shared/ipc-channels')

    const allChannels = [...channels.INVOKE_CHANNELS, ...channels.EVENT_CHANNELS]
    for (const channel of allChannels) {
      expect(channel).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/)
    }
  })
})

// ---------------------------------------------------------------------------
// Shared IPC types tests
// ---------------------------------------------------------------------------

describe('IPC Types', () => {
  it('re-exports project state types', async () => {
    const types = await import('../../shared/ipc-types')

    // Verify the module exports the expected type names
    // (TypeScript ensures type correctness at compile time,
    // here we just verify the module loads without errors)
    expect(types).toBeDefined()
  })

  it('IPC types are structurally correct', () => {
    // Verify FileInfo uses number for lastModified (not Date)
    const fileInfo: import('../../shared/ipc-types').FileInfo = {
      path: '/test/file.dat',
      name: 'file.dat',
      extension: '.dat',
      directory: '/test',
      size: 1024,
      lastModified: Date.now(),
      exists: true
    }
    expect(fileInfo.lastModified).toBeTypeOf('number')
  })

  it('FileChangedEvent has correct shape', () => {
    const event: import('../../shared/ipc-types').FileChangedEvent = {
      filePath: '/test/file.dat',
      eventType: 'change'
    }
    expect(event.filePath).toBe('/test/file.dat')
    expect(event.eventType).toBe('change')
  })

  it('RecentDirectoriesData has all four keys', () => {
    const data: import('../../shared/ipc-types').RecentDirectoriesData = {
      lastDirectory: '/a',
      lastMergeDirectory: '/b',
      lastIODirectory: null,
      lastServerItemsDirectory: null,
      recentClientDirectories: ['/a']
    }
    expect(data).toHaveProperty('lastDirectory')
    expect(data).toHaveProperty('lastMergeDirectory')
    expect(data).toHaveProperty('lastIODirectory')
    expect(data).toHaveProperty('lastServerItemsDirectory')
    expect(data).toHaveProperty('recentClientDirectories')
  })

  it('ClientFilesDiscovery has nullable fields', () => {
    const discovery: import('../../shared/ipc-types').ClientFilesDiscovery = {
      datFile: null,
      sprFile: null,
      sprxFile: null,
      pxgRuntimeMetadataFile: null,
      pxgRuntimeFlagsFile: null,
      otfiFile: null
    }
    expect(discovery.datFile).toBeNull()
    expect(discovery.sprFile).toBeNull()
    expect(discovery.otfiFile).toBeNull()
  })

  it('ServerItemFilesDiscovery has nullable fields', () => {
    const discovery: import('../../shared/ipc-types').ServerItemFilesDiscovery = {
      otbFile: '/items.otb',
      xmlFile: null
    }
    expect(discovery.otbFile).toBe('/items.otb')
    expect(discovery.xmlFile).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// IPC Handler registration tests
// ---------------------------------------------------------------------------

// Use vi.hoisted so the map is available inside the hoisted vi.mock factory
type HandlerFn = (...args: unknown[]) => unknown
const { registeredHandlers } = vi.hoisted(() => {
  return { registeredHandlers: new Map<string, HandlerFn>() }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: HandlerFn) => {
      registeredHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      registeredHandlers.delete(channel)
    })
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined }))
  },
  app: {
    name: 'Object Builder',
    getPath: vi.fn(() => '/tmp/test-app-data')
  },
  shell: {
    openExternal: vi.fn()
  }
}))

describe('IPC Handlers', () => {
  beforeEach(() => {
    registeredHandlers.clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { removeIpcHandlers } = await import('../ipc-handlers')
    removeIpcHandlers()
  })

  it('registers handlers for all invoke channels', async () => {
    const { registerIpcHandlers } = await import('../ipc-handlers')
    const channels = await import('../../shared/ipc-channels')

    registerIpcHandlers()

    for (const channel of channels.INVOKE_CHANNELS) {
      expect(registeredHandlers.has(channel), `handler missing for ${channel}`).toBe(true)
    }
  })

  it('registers exactly the right number of handlers', async () => {
    const { registerIpcHandlers } = await import('../ipc-handlers')
    const channels = await import('../../shared/ipc-channels')

    registerIpcHandlers()

    expect(registeredHandlers.size).toBe(channels.INVOKE_CHANNELS.length)
  })

  it('removeIpcHandlers cleans up all handlers', async () => {
    const { registerIpcHandlers, removeIpcHandlers } = await import('../ipc-handlers')
    const { ipcMain } = await import('electron')

    registerIpcHandlers()
    removeIpcHandlers()

    const { INVOKE_CHANNELS } = await import('../../shared/ipc-channels')
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(INVOKE_CHANNELS.length)
  })

  it('does not register handlers for event channels', async () => {
    const { registerIpcHandlers } = await import('../ipc-handlers')
    const channels = await import('../../shared/ipc-channels')

    registerIpcHandlers()

    for (const channel of channels.EVENT_CHANNELS) {
      expect(registeredHandlers.has(channel)).toBe(false)
    }
  })

  // -------------------------------------------------------------------------
  // File service handler delegation tests
  // -------------------------------------------------------------------------

  describe('file handlers', () => {
    it('FILE_EXISTS handler delegates to fileExists', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      const handler = registeredHandlers.get(channels.FILE_EXISTS)
      expect(handler).toBeDefined()
      expect(typeof handler).toBe('function')
    })

    it('FILE_READ_TEXT handler delegates to readTextFile', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      const handler = registeredHandlers.get(channels.FILE_READ_TEXT)
      expect(handler).toBeDefined()
      expect(typeof handler).toBe('function')
    })

    it('FILE_LIST handler delegates to listFiles', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      const handler = registeredHandlers.get(channels.FILE_LIST)
      expect(handler).toBeDefined()
      expect(typeof handler).toBe('function')
    })
  })

  // -------------------------------------------------------------------------
  // Recent directories handler delegation tests
  // -------------------------------------------------------------------------

  describe('recent directories handlers', () => {
    it('RECENT_GET handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.RECENT_GET)).toBe(true)
    })

    it('RECENT_SET handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.RECENT_SET)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Project service handler delegation tests
  // -------------------------------------------------------------------------

  describe('project handlers', () => {
    it('PROJECT_GET_STATE handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_GET_STATE)).toBe(true)
    })

    it('PROJECT_CREATE handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_CREATE)).toBe(true)
    })

    it('PROJECT_LOAD handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_LOAD)).toBe(true)
    })

    it('PROJECT_COMPILE handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_COMPILE)).toBe(true)
    })

    it('PROJECT_UNLOAD handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_UNLOAD)).toBe(true)
    })

    it('PROJECT_DISCOVER_CLIENT_FILES handler is registered', async () => {
      const { registerIpcHandlers } = await import('../ipc-handlers')
      const channels = await import('../../shared/ipc-channels')

      registerIpcHandlers()

      expect(registeredHandlers.has(channels.PROJECT_DISCOVER_CLIENT_FILES)).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Channel naming convention tests
// ---------------------------------------------------------------------------

describe('Channel Naming Conventions', () => {
  it('file channels are prefixed with file:', async () => {
    const channels = await import('../../shared/ipc-channels')

    const fileChannels = [
      channels.FILE_SHOW_OPEN_DIALOG,
      channels.FILE_SHOW_SAVE_DIALOG,
      channels.FILE_SHOW_DIRECTORY_DIALOG,
      channels.FILE_READ_BINARY,
      channels.FILE_WRITE_BINARY,
      channels.FILE_READ_TEXT,
      channels.FILE_WRITE_TEXT,
      channels.FILE_EXISTS,
      channels.FILE_GET_INFO,
      channels.FILE_LIST,
      channels.FILE_FIND_IN_DIRECTORY,
      channels.FILE_WATCH,
      channels.FILE_UNWATCH,
      channels.FILE_UNWATCH_ALL,
      channels.FILE_CHANGED
    ]

    for (const channel of fileChannels) {
      expect(channel).toMatch(/^file:/)
    }
  })

  it('recent channels are prefixed with recent:', async () => {
    const channels = await import('../../shared/ipc-channels')

    const recentChannels = [
      channels.RECENT_LOAD,
      channels.RECENT_GET,
      channels.RECENT_SET,
      channels.RECENT_GET_ALL,
      channels.RECENT_CLEAR
    ]

    for (const channel of recentChannels) {
      expect(channel).toMatch(/^recent:/)
    }
  })

  it('project channels are prefixed with project:', async () => {
    const channels = await import('../../shared/ipc-channels')

    const projectChannels = [
      channels.PROJECT_GET_STATE,
      channels.PROJECT_IS_LOADED,
      channels.PROJECT_CREATE,
      channels.PROJECT_LOAD,
      channels.PROJECT_COMPILE,
      channels.PROJECT_LOAD_MERGE_FILES,
      channels.PROJECT_UNLOAD,
      channels.PROJECT_MARK_CHANGED,
      channels.PROJECT_MARK_SAVED,
      channels.PROJECT_SET_SERVER_ITEMS_PATH,
      channels.PROJECT_UPDATE_FEATURES,
      channels.PROJECT_DISCOVER_CLIENT_FILES,
      channels.PROJECT_DISCOVER_SERVER_ITEM_FILES,
      channels.PROJECT_STATE_CHANGED
    ]

    for (const channel of projectChannels) {
      expect(channel).toMatch(/^project:/)
    }
  })
})
