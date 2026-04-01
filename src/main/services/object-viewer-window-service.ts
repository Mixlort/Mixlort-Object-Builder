import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { OBJECT_VIEWER_CURRENT_THING_CHANGED } from '../../shared/ipc-channels'
import { loadSettings, setSetting } from './settings-service'

let objectViewerWindow: BrowserWindow | null = null
let currentThingData: unknown = null

function getViewerUrl(): { devUrl?: string; filePath?: string } {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return {
      devUrl: `${process.env['ELECTRON_RENDERER_URL']}?window=object-viewer`
    }
  }

  return {
    filePath: join(__dirname, '../renderer/index.html')
  }
}

function resolveBackgroundColor(theme: 'system' | 'light' | 'dark'): string {
  const isDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return isDark ? '#121212' : '#fafafa'
}

async function persistObjectViewerWindowState(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return

  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()

  await Promise.all([
    setSetting('objectViewerWidth', bounds.width),
    setSetting('objectViewerHeight', bounds.height),
    setSetting('objectViewerMaximized', win.isMaximized())
  ])
}

async function createObjectViewerWindow(): Promise<BrowserWindow> {
  const settings = await loadSettings()

  const width = settings.objectViewerWidth > 0 ? settings.objectViewerWidth : 1100
  const height = settings.objectViewerHeight > 0 ? settings.objectViewerHeight : 760

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 840,
    minHeight: 560,
    show: false,
    backgroundColor: resolveBackgroundColor(settings.theme || 'system'),
    title: 'Object Viewer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  objectViewerWindow = win

  if (settings.objectViewerMaximized) {
    win.maximize()
  }

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })

  win.on('close', () => {
    void persistObjectViewerWindowState(win)
  })

  win.on('maximize', () => {
    void setSetting('objectViewerMaximized', true)
  })

  win.on('unmaximize', () => {
    void persistObjectViewerWindowState(win)
  })

  win.on('closed', () => {
    objectViewerWindow = null
  })

  win.webContents.on('did-finish-load', () => {
    if (currentThingData !== null) {
      win.webContents.send(OBJECT_VIEWER_CURRENT_THING_CHANGED, currentThingData)
    }
  })

  const { devUrl, filePath } = getViewerUrl()
  if (devUrl) {
    await win.loadURL(devUrl)
  } else if (filePath) {
    await win.loadFile(filePath, { query: { window: 'object-viewer' } })
  }

  return win
}

export async function openObjectViewerWindow(): Promise<void> {
  if (objectViewerWindow && !objectViewerWindow.isDestroyed()) {
    objectViewerWindow.show()
    objectViewerWindow.focus()
    return
  }

  await createObjectViewerWindow()
}

export function closeObjectViewerWindow(): void {
  if (objectViewerWindow && !objectViewerWindow.isDestroyed()) {
    objectViewerWindow.close()
  }
}

export function isObjectViewerWindow(win: BrowserWindow | null | undefined): boolean {
  return Boolean(win && objectViewerWindow && !objectViewerWindow.isDestroyed() && win === objectViewerWindow)
}

export function setObjectViewerCurrentThing(thingData: unknown): void {
  currentThingData = thingData ?? null

  if (objectViewerWindow && !objectViewerWindow.isDestroyed()) {
    objectViewerWindow.webContents.send(OBJECT_VIEWER_CURRENT_THING_CHANGED, currentThingData)
  }
}

export function getObjectViewerCurrentThing(): unknown {
  return currentThingData
}
