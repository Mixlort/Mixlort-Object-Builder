import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'
import { loadWindowState, saveWindowState, loadSettings } from './services/settings-service'
import { buildApplicationMenu, updateMenuState } from './services/menu-service'
import { initLogger, closeLogger, writeError, writeLog } from './services/logger-service'
import { clearRecoveryData, resolveCompileRecoveryOnStartup } from './services/recovery-service'
import { initUpdater } from './services/updater-service'
import { closeObjectViewerWindow } from './services/object-viewer-window-service'
import { APP_CONFIRM_CLOSE } from '../shared/ipc-channels'

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplashWindow(
  bgColor: string,
  textColor: string,
  windowState: { x?: number; y?: number; width: number; height: number },
  maximized: boolean
): BrowserWindow {
  const splash = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 600,
    frame: true,
    backgroundColor: bgColor,
    resizable: true,
    title: 'Object Builder',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  if (maximized) {
    splash.maximize()
  }

  // Inject theme colors
  const colorCss = `body{background:${bgColor};color:${textColor}}`
  splash.webContents.on('did-finish-load', () => {
    splash.webContents.insertCSS(colorCss)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    splash.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`)
  } else {
    splash.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  return splash
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

async function createWindow(splash: BrowserWindow | null): Promise<void> {
  const windowState = await loadWindowState()
  const settings = await loadSettings()

  const themeSetting = settings.theme || 'system'
  const isDark =
    themeSetting === 'dark' || (themeSetting === 'system' && nativeTheme.shouldUseDarkColors)
  const bgColor = isDark ? '#121212' : '#fafafa'

  const mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: bgColor,
    title: 'Object Builder',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Restore maximized state from settings (legacy stores this in settings)
  if (windowState.maximized || settings.maximized) {
    mainWindow.maximize()
  }

  let closeConfirmedByMain = false

  // Intercept close to ask renderer about unsaved changes.
  // The renderer will either call app:closeConfirmed (which destroys the window)
  // or do nothing (which keeps the window open).
  mainWindow.on('close', (event) => {
    // Save window state regardless of outcome
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: isMaximized
    })

    if (closeConfirmedByMain) {
      return
    }

    const webContents = mainWindow.webContents
    if (mainWindow.isDestroyed() || webContents.isDestroyed() || webContents.isCrashed()) {
      return
    }

    // Prevent close and ask renderer to confirm
    event.preventDefault()
    try {
      webContents.send(APP_CONFIRM_CLOSE)
    } catch (error) {
      closeConfirmedByMain = true
      const message = error instanceof Error ? error.message : String(error)
      writeError(`Failed to send close confirmation to renderer: ${message}`)
      if (!mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Match main window to splash's current bounds (user may have moved/resized it)
    if (splash && !splash.isDestroyed()) {
      const isMax = splash.isMaximized()
      if (isMax) {
        mainWindow.maximize()
      } else {
        const bounds = splash.getBounds()
        mainWindow.setBounds(bounds)
      }
      splash.close()
    }
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    closeObjectViewerWindow()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---------------------------------------------------------------------------
// Global error handlers (main process)
// ---------------------------------------------------------------------------

process.on('uncaughtException', (error) => {
  writeError(`Uncaught exception: ${error.message}`, error.stack)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  writeError(`Unhandled rejection: ${message}`, stack)
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  initLogger()
  const compileRecovery = resolveCompileRecoveryOnStartup()
  if (compileRecovery.status === 'restored') {
    writeLog(
      'warning',
      `Recovered interrupted compile by restoring backup files: ${compileRecovery.restoredFiles.join(', ')}`
    )
  } else if (compileRecovery.status === 'clearedCompleted') {
    writeLog('info', 'Cleared stale completed compile recovery marker')
  }

  registerIpcHandlers()

  // Load settings and build menu with initial panel visibility state
  const settings = await loadSettings()

  // Resolve theme for splash window
  const themeSetting = settings.theme || 'system'
  const isDark =
    themeSetting === 'dark' || (themeSetting === 'system' && nativeTheme.shouldUseDarkColors)
  const bgColor = isDark ? '#121212' : '#fafafa'
  const textColor = isDark ? '#cccccc' : '#1f2937'

  // Show splash immediately (same size/position as main window)
  const windowState = await loadWindowState()
  const maximized = windowState.maximized || settings.maximized
  const splash = createSplashWindow(bgColor, textColor, windowState, maximized)
  splash.show()

  updateMenuState({
    showPreviewPanel: settings.showPreviewPanel,
    showThingsPanel: settings.showThingsPanel,
    showSpritesPanel: settings.showSpritesPanel,
    showLogPanel: settings.showLogPanel
  })
  buildApplicationMenu()

  // Initialize auto-updater (no-op in dev, checks GitHub Releases in production)
  initUpdater()

  await createWindow(splash)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(null)
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  clearRecoveryData()
  closeLogger()
})
