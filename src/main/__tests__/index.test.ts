// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

type AppHandler = (...args: unknown[]) => unknown

const { appHandlers, appMock } = vi.hoisted(() => {
  const handlers = new Map<string, AppHandler>()
  return {
    appHandlers: handlers,
    appMock: {
      whenReady: vi.fn(() => new Promise(() => {})),
      on: vi.fn((event: string, handler: AppHandler) => {
        handlers.set(event, handler)
      }),
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      hasSingleInstanceLock: vi.fn(() => true)
    }
  }
})

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: vi.fn(),
  nativeTheme: {
    shouldUseDarkColors: false
  },
  shell: {
    openExternal: vi.fn()
  }
}))

vi.mock('../ipc-handlers', () => ({
  registerIpcHandlers: vi.fn()
}))

vi.mock('../services/settings-service', () => ({
  loadWindowState: vi.fn(),
  saveWindowState: vi.fn(),
  loadSettings: vi.fn()
}))

vi.mock('../services/menu-service', () => ({
  buildApplicationMenu: vi.fn(),
  updateMenuState: vi.fn()
}))

vi.mock('../services/logger-service', () => ({
  initLogger: vi.fn(),
  closeLogger: vi.fn(),
  writeError: vi.fn(),
  writeLog: vi.fn()
}))

vi.mock('../services/recovery-service', () => ({
  clearRecoveryData: vi.fn(),
  resolveCompileRecoveryOnStartup: vi.fn(() => ({ status: 'none' }))
}))

vi.mock('../services/updater-service', () => ({
  initUpdater: vi.fn()
}))

vi.mock('../services/object-viewer-window-service', () => ({
  closeObjectViewerWindow: vi.fn(),
  isObjectViewerWindow: vi.fn(() => false)
}))

describe('main process lifecycle', () => {
  beforeEach(() => {
    appHandlers.clear()
    vi.clearAllMocks()
    appMock.on.mockImplementation((event: string, handler: AppHandler) => {
      appHandlers.set(event, handler)
    })
    appMock.whenReady.mockImplementation(() => new Promise(() => {}))
    appMock.requestSingleInstanceLock.mockReturnValue(true)
    appMock.hasSingleInstanceLock.mockReturnValue(true)
  })

  it('quits the app when the last window closes', async () => {
    vi.resetModules()

    await import('../index')

    const onWindowAllClosed = appHandlers.get('window-all-closed')
    expect(onWindowAllClosed).toBeTypeOf('function')

    onWindowAllClosed?.()

    expect(appMock.quit).toHaveBeenCalledTimes(1)
  })

  it('quits immediately when another instance already holds the single-instance lock', async () => {
    vi.resetModules()
    appMock.requestSingleInstanceLock.mockReturnValue(false)

    await import('../index')

    expect(appMock.requestSingleInstanceLock).toHaveBeenCalled()
    expect(appMock.quit).toHaveBeenCalled()
  })
})
