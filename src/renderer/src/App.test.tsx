import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from './App'
import {
  resetAppStore,
  resetEditorStore,
  resetSpriteStore,
  useAppStore,
  useEditorStore
} from './stores'
import * as spriteThumbnailModule from './hooks/use-sprite-thumbnail'
import { createObjectBuilderSettings } from '../../shared/settings'
import {
  createClientInfo,
  createFrameGroup,
  createThingType,
  FrameGroupType,
  ThingCategory,
  type ThingData
} from './types'

const mockDecodeObd = vi.hoisted(() => vi.fn())

vi.mock('./workers/worker-service', () => ({
  workerService: {
    decodeObd: mockDecodeObd,
    decodeObdParallel: async (
      buffers: ArrayBuffer[],
      _durations?: Record<string, number>,
      onProgress?: (done: number) => void
    ) => {
      const out: unknown[] = []
      for (let i = 0; i < buffers.length; i++) {
        try {
          out.push(await mockDecodeObd(buffers[i]))
        } catch (e) {
          out.push(e instanceof Error ? e : new Error(String(e)))
        }
        onProgress?.(i + 1)
      }
      return out
    }
  }
}))

beforeEach(() => {
  mockDecodeObd.mockReset()
  resetAppStore()
  resetEditorStore()
  resetSpriteStore()
  window.api = undefined as never
})

function loadEditingEffect(): void {
  const clientInfo = createClientInfo()
  clientInfo.loaded = true
  useAppStore.setState({
    clientInfo,
    project: {
      loaded: true,
      isTemporary: false,
      changed: false,
      fileName: 'test.dat',
      datFilePath: '/test.dat',
      sprFilePath: '/test.spr'
    }
  })

  const thing = createThingType()
  thing.id = 100
  thing.category = ThingCategory.EFFECT
  const frameGroup = createFrameGroup()
  frameGroup.spriteIndex = [100, 101, 102, 103]
  thing.frameGroups = [frameGroup]

  const data: ThingData = {
    obdVersion: 0,
    clientVersion: clientInfo.clientVersion,
    thing,
    sprites: new Map([[FrameGroupType.DEFAULT, []]]),
    xmlAttributes: null
  }

  useEditorStore.getState().setEditingThingData(data)
}

function makeEffectThingData(id = 1): ThingData {
  const clientInfo = createClientInfo()
  const thing = createThingType()
  thing.id = id
  thing.category = ThingCategory.EFFECT
  const frameGroup = createFrameGroup()
  frameGroup.spriteIndex = [1]
  thing.frameGroups = [frameGroup]

  const pixels = new Uint8Array(32 * 32 * 4)
  pixels[0] = 0xff
  pixels[1] = 0xff

  return {
    obdVersion: 3,
    clientVersion: clientInfo.clientVersion,
    thing,
    sprites: new Map([[FrameGroupType.DEFAULT, [{ id: 1, pixels }]]]),
    xmlAttributes: null
  }
}

describe('App', () => {
  it('renders the main layout with all panels', () => {
    render(<App />)
    // ThingListPanel shows category tabs
    expect(screen.getByTestId('thing-list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('category-tab-item')).toBeInTheDocument()
    // Placeholder panels
    expect(screen.getAllByTestId('toolbar-toggle-editor-panel').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('toolbar-toggle-sprite-panel')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-toggle-effect-preview-frame')).toBeInTheDocument()
  })

  it('does not clear the global thumbnail cache when toggling effect preview mode', () => {
    const clearThumbnailCacheSpy = vi.spyOn(spriteThumbnailModule, 'clearThumbnailCache')

    render(<App />)
    fireEvent.click(screen.getByTestId('toolbar-toggle-effect-preview-frame'))

    expect(clearThumbnailCacheSpy).not.toHaveBeenCalled()
  })

  it('restores persisted editor, sprite, and log panel visibility on startup', async () => {
    const settings = createObjectBuilderSettings()
    settings.showEditorPanel = false
    settings.showSpritesPanel = false
    settings.showLogPanel = false

    window.api = {
      settings: {
        load: vi.fn().mockResolvedValue(settings),
        save: vi.fn().mockResolvedValue(undefined)
      }
    } as unknown as typeof window.api

    const clientInfo = createClientInfo()
    useAppStore.setState({
      project: {
        loaded: true,
        isTemporary: false,
        changed: false,
        fileName: 'test.dat',
        datFilePath: '/test.dat',
        sprFilePath: '/test.spr'
      },
      clientInfo
    })

    render(<App />)

    await waitFor(() => {
      expect(useAppStore.getState().ui.showEditorPanel).toBe(false)
      expect(useAppStore.getState().ui.showSpritesPanel).toBe(false)
      expect(useAppStore.getState().ui.showLogPanel).toBe(false)
    })
  })

  it('persists editor, sprite, and log panel visibility when toggled', async () => {
    const settings = createObjectBuilderSettings()
    const save = vi.fn().mockResolvedValue(undefined)

    window.api = {
      settings: {
        load: vi.fn().mockResolvedValue(settings),
        save
      }
    } as unknown as typeof window.api

    const clientInfo = createClientInfo()
    useAppStore.setState({
      project: {
        loaded: true,
        isTemporary: false,
        changed: false,
        fileName: 'test.dat',
        datFilePath: '/test.dat',
        sprFilePath: '/test.spr'
      },
      clientInfo
    })

    render(<App />)

    await waitFor(() => {
      expect(window.api?.settings?.load).toHaveBeenCalled()
    })

    save.mockClear()

    fireEvent.click(screen.getByTestId('toolbar-toggle-editor-panel'))

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ showEditorPanel: false }))
    })

    fireEvent.click(screen.getByTestId('toolbar-toggle-sprite-panel'))

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ showSpritesPanel: false }))
    })

    act(() => {
      useAppStore.getState().togglePanel('log')
    })

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ showLogPanel: false }))
    })
  })

  it('shows the global loading overlay while dropped sprites are importing', async () => {
    const originalFileReader = global.FileReader

    class PendingFileReader {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      onabort: null | (() => void) = null
      result: string | ArrayBuffer | null = 'data:image/png;base64,mock'

      readAsDataURL(): void {
        // Keep the import pending so the overlay must remain visible.
      }
    }

    global.FileReader = PendingFileReader as unknown as typeof FileReader

    try {
      loadEditingEffect()
      render(<App />)

      await act(async () => {
        fireEvent.drop(screen.getByTestId('sprite-cell-0'), {
          dataTransfer: {
            files: [new File(['sprite'], 'effect_1.png', { type: 'image/png' })]
          }
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Importing sprites... 0/1')).toBeInTheDocument()
      })
      expect(useAppStore.getState().ui.locked).toBe(true)
    } finally {
      global.FileReader = originalFileReader
    }
  })

  it('shows the global loading overlay while dropped OBD effects are importing', async () => {
    let resolveDecode: (value: ThingData) => void = () => {}
    mockDecodeObd.mockImplementation(
      () =>
        new Promise<ThingData>((resolve) => {
          resolveDecode = resolve
        })
    )

    loadEditingEffect()
    render(<App />)

    await act(async () => {
      fireEvent.drop(screen.getByTestId('thing-list-panel'), {
        dataTransfer: {
          files: [
            {
              name: 'effect_1.obd',
              arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1))
            }
          ]
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Importing Objects 0/1')).toBeInTheDocument()
    })
    expect(useAppStore.getState().ui.locked).toBe(true)

    await act(async () => {
      resolveDecode(makeEffectThingData(1))
      await Promise.resolve()
    })
  })
})
