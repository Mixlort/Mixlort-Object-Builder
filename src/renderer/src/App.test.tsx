import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from './App'
import { resetAppStore, useAppStore } from './stores'
import * as spriteThumbnailModule from './hooks/use-sprite-thumbnail'
import { createObjectBuilderSettings } from '../../shared/settings'
import { createClientInfo } from './types'

beforeEach(() => {
  resetAppStore()
  window.api = undefined as never
})

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
})
