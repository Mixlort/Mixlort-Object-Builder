/**
 * Tests for ThingListPanel component.
 * Covers category tabs, view modes, search/filter, selection,
 * context menu, pagination stepper, and virtual scrolling.
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThingListPanel } from '../ThingListPanel'
import { resetAppStore, useAppStore, resetEditorStore } from '../../../stores'
import { ThingCategory, createThingType, createClientInfo } from '../../../types'
import type { ThingType } from '../../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThing(id: number, category: ThingCategory, marketName = ''): ThingType {
  const t = createThingType()
  t.id = id
  t.category = category
  t.marketName = marketName
  return t
}

function loadProjectWithThings(itemCount = 5, outfitCount = 3): void {
  const items = Array.from({ length: itemCount }, (_, i) => makeThing(100 + i, ThingCategory.ITEM))
  const outfits = Array.from({ length: outfitCount }, (_, i) =>
    makeThing(1 + i, ThingCategory.OUTFIT)
  )

  const clientInfo = createClientInfo()
  clientInfo.minItemId = 100
  clientInfo.maxItemId = 100 + itemCount - 1
  clientInfo.minOutfitId = 1
  clientInfo.maxOutfitId = outfitCount

  useAppStore.setState({
    project: {
      loaded: true,
      isTemporary: false,
      changed: false,
      fileName: 'test.dat',
      datFilePath: '/test.dat',
      sprFilePath: '/test.spr'
    },
    clientInfo,
    things: {
      items,
      outfits,
      effects: [],
      missiles: []
    }
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAppStore()
  resetEditorStore()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThingListPanel', () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  describe('basic rendering', () => {
    it('renders the panel with category tabs', () => {
      render(<ThingListPanel />)
      expect(screen.getByTestId('thing-list-panel')).toBeInTheDocument()
      expect(screen.getByText('Items')).toBeInTheDocument()
      expect(screen.getByText('Outfits')).toBeInTheDocument()
      expect(screen.getByText('Effects')).toBeInTheDocument()
      expect(screen.getByText('Missiles')).toBeInTheDocument()
    })

    it('shows "No project loaded" when no project is loaded', () => {
      render(<ThingListPanel />)
      expect(screen.getByText('No project loaded')).toBeInTheDocument()
    })

    it('shows "No objects" when project is loaded but category is empty', () => {
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
        clientInfo,
        things: { items: [], outfits: [], effects: [], missiles: [] }
      })

      render(<ThingListPanel />)
      expect(screen.getByText('No objects')).toBeInTheDocument()
    })

    it('renders items when project is loaded', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      expect(screen.getByTestId('thing-list-item-100')).toBeInTheDocument()
      expect(screen.getByTestId('thing-list-item-101')).toBeInTheDocument()
    })

    it('shows pagination stepper in footer when project is loaded', () => {
      loadProjectWithThings(5)
      render(<ThingListPanel />)
      expect(screen.getByTestId('pagination-stepper')).toBeInTheDocument()
      // The stepper input shows the first item ID
      expect(screen.getByTestId('page-input')).toHaveValue(100)
    })
  })

  // -----------------------------------------------------------------------
  // Category tabs
  // -----------------------------------------------------------------------

  describe('category tabs', () => {
    it('switches category when tab is clicked', () => {
      loadProjectWithThings(3, 2)
      render(<ThingListPanel />)

      // Initially shows items (3 items starting at ID 100)
      expect(screen.getByTestId('thing-list-item-100')).toBeInTheDocument()
      expect(screen.getByTestId('thing-list-item-102')).toBeInTheDocument()

      // Switch to outfits (2 outfits starting at ID 1)
      fireEvent.click(screen.getByTestId('category-tab-outfit'))
      expect(screen.getByTestId('thing-list-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('thing-list-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-list-item-100')).not.toBeInTheDocument()
    })

    it('disables category tabs when no project is loaded', () => {
      render(<ThingListPanel />)
      const tab = screen.getByTestId('category-tab-item')
      expect(tab).toBeDisabled()
    })

    it('enables category tabs when project is loaded', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      const tab = screen.getByTestId('category-tab-item')
      expect(tab).not.toBeDisabled()
    })
  })

  // -----------------------------------------------------------------------
  // View modes
  // -----------------------------------------------------------------------

  describe('view modes', () => {
    it('renders in list mode by default', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      // List items have thing-list-item-* test ids
      expect(screen.getByTestId('thing-list-item-100')).toBeInTheDocument()
    })

    it('switches to grid view', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('view-mode-grid'))
      // Grid items have thing-grid-item-* test ids
      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
    })

    it('switches back to list view', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('view-mode-grid'))
      fireEvent.click(screen.getByTestId('view-mode-list'))

      expect(screen.getByTestId('thing-list-item-100')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Search/filter
  // -----------------------------------------------------------------------

  describe('search and filter', () => {
    it('filters by ID', () => {
      vi.useFakeTimers()
      loadProjectWithThings(5)
      render(<ThingListPanel />)

      const input = screen.getByTestId('thing-search-input')
      fireEvent.change(input, { target: { value: '102' } })
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.getByTestId('thing-list-item-102')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-list-item-100')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('filters by market name', () => {
      vi.useFakeTimers()
      const items = [
        makeThing(100, ThingCategory.ITEM, 'Golden Armor'),
        makeThing(101, ThingCategory.ITEM, 'Silver Sword'),
        makeThing(102, ThingCategory.ITEM, 'Magic Plate')
      ]
      const clientInfo = createClientInfo()
      clientInfo.minItemId = 100
      clientInfo.maxItemId = 102

      useAppStore.setState({
        project: {
          loaded: true,
          isTemporary: false,
          changed: false,
          fileName: 'test.dat',
          datFilePath: '/test.dat',
          sprFilePath: '/test.spr'
        },
        clientInfo,
        things: { items, outfits: [], effects: [], missiles: [] }
      })

      render(<ThingListPanel />)
      const input = screen.getByTestId('thing-search-input')
      fireEvent.change(input, { target: { value: 'golden' } })
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.getByTestId('thing-list-item-100')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-list-item-101')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('shows "No results found" when filter matches nothing', () => {
      vi.useFakeTimers()
      loadProjectWithThings()
      render(<ThingListPanel />)

      const input = screen.getByTestId('thing-search-input')
      fireEvent.change(input, { target: { value: '999999' } })
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.getByText('No results found')).toBeInTheDocument()
      vi.useRealTimers()
    })

    it('disables search input when no project is loaded', () => {
      render(<ThingListPanel />)
      const input = screen.getByTestId('thing-search-input')
      expect(input).toBeDisabled()
    })
  })

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  describe('selection', () => {
    it('selects a thing on click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-101'))
      expect(useAppStore.getState().selectedThingId).toBe(101)
      expect(useAppStore.getState().selectedThingIds).toEqual([101])
    })

    it('multi-selects with Ctrl+click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-100'))
      fireEvent.click(screen.getByTestId('thing-list-item-102'), { ctrlKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([100, 102])
    })

    it('range-selects with Shift+click', () => {
      loadProjectWithThings(5)
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-100'))
      fireEvent.click(screen.getByTestId('thing-list-item-103'), { shiftKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([100, 101, 102, 103])
    })

    it('deselects with Ctrl+click on already selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-100'))
      fireEvent.click(screen.getByTestId('thing-list-item-101'), { ctrlKey: true })
      fireEvent.click(screen.getByTestId('thing-list-item-100'), { ctrlKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([101])
    })
  })

  // -----------------------------------------------------------------------
  // Context menu
  // -----------------------------------------------------------------------

  describe('context menu', () => {
    it('opens context menu on right-click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-list-item-100'))
      expect(screen.getByTestId('thing-context-menu')).toBeInTheDocument()
    })

    it('selects the item when right-clicking an unselected item', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-list-item-102'))
      expect(useAppStore.getState().selectedThingId).toBe(102)
    })

    it('shows all context menu items', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-list-item-100'))

      expect(screen.getByText('Replace')).toBeInTheDocument()
      expect(screen.getByText('Export')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Duplicate')).toBeInTheDocument()
      expect(screen.getByText('Remove')).toBeInTheDocument()
      expect(screen.getByText('Copy Object')).toBeInTheDocument()
      expect(screen.getByText('Paste Object')).toBeInTheDocument()
    })

    it('closes context menu on Escape', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-list-item-100'))
      expect(screen.getByTestId('thing-context-menu')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByTestId('thing-context-menu')).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Pagination stepper
  // -----------------------------------------------------------------------

  describe('pagination stepper', () => {
    it('navigates to thing by ID via stepper input', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      const input = screen.getByTestId('page-input')
      fireEvent.change(input, { target: { value: '103' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(useAppStore.getState().selectedThingId).toBe(103)
    })

    it('navigates to closest thing for out-of-range ID', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      const input = screen.getByTestId('page-input')
      // 999 is clamped to max (104), then closest thing is selected
      fireEvent.change(input, { target: { value: '999' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(useAppStore.getState().selectedThingId).toBe(104)
    })

    it('disables stepper when no project is loaded', () => {
      render(<ThingListPanel />)
      expect(screen.getByTestId('page-input')).toBeDisabled()
    })

    it('renders pagination stepper in footer', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      expect(screen.getByTestId('pagination-stepper')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Action bar
  // -----------------------------------------------------------------------

  describe('action bar', () => {
    it('renders action bar with buttons', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      expect(screen.getByTestId('thing-action-bar')).toBeInTheDocument()
      expect(screen.getByTestId('action-replace')).toBeInTheDocument()
      expect(screen.getByTestId('action-import')).toBeInTheDocument()
      expect(screen.getByTestId('action-export')).toBeInTheDocument()
      expect(screen.getByTestId('action-edit')).toBeInTheDocument()
      expect(screen.getByTestId('action-duplicate')).toBeInTheDocument()
      expect(screen.getByTestId('action-new')).toBeInTheDocument()
      expect(screen.getByTestId('action-remove')).toBeInTheDocument()
      expect(screen.getByTestId('action-find')).toBeInTheDocument()
    })

    it('disables all buttons when no project is loaded', () => {
      render(<ThingListPanel />)
      expect(screen.getByTestId('action-replace')).toBeDisabled()
      expect(screen.getByTestId('action-import')).toBeDisabled()
      expect(screen.getByTestId('action-export')).toBeDisabled()
      expect(screen.getByTestId('action-edit')).toBeDisabled()
      expect(screen.getByTestId('action-duplicate')).toBeDisabled()
      expect(screen.getByTestId('action-new')).toBeDisabled()
      expect(screen.getByTestId('action-remove')).toBeDisabled()
      expect(screen.getByTestId('action-find')).toBeDisabled()
    })

    it('enables Import/New/Find when project loaded but nothing selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      // No selection - these should still be enabled
      expect(screen.getByTestId('action-import')).not.toBeDisabled()
      expect(screen.getByTestId('action-new')).not.toBeDisabled()
      expect(screen.getByTestId('action-find')).not.toBeDisabled()
      // These require selection
      expect(screen.getByTestId('action-replace')).toBeDisabled()
      expect(screen.getByTestId('action-export')).toBeDisabled()
      expect(screen.getByTestId('action-edit')).toBeDisabled()
      expect(screen.getByTestId('action-duplicate')).toBeDisabled()
      expect(screen.getByTestId('action-remove')).toBeDisabled()
    })

    it('enables selection-dependent buttons when a thing is selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-100'))

      expect(screen.getByTestId('action-replace')).not.toBeDisabled()
      expect(screen.getByTestId('action-export')).not.toBeDisabled()
      expect(screen.getByTestId('action-edit')).not.toBeDisabled()
      expect(screen.getByTestId('action-duplicate')).not.toBeDisabled()
      expect(screen.getByTestId('action-remove')).not.toBeDisabled()
    })

    it('disables Edit button when multiple things are selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-100'))
      fireEvent.click(screen.getByTestId('thing-list-item-101'), { ctrlKey: true })

      expect(screen.getByTestId('action-edit')).toBeDisabled()
      // Replace/Export/Duplicate/Remove still enabled
      expect(screen.getByTestId('action-replace')).not.toBeDisabled()
    })

    it('keeps non-tail ids in the list as empty entries when removing', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-101'))
      fireEvent.click(screen.getByTestId('action-remove'))

      expect(screen.getByTestId('thing-list-item-101')).toBeInTheDocument()
      expect(useAppStore.getState().things.items).toHaveLength(5)
      expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 101)).toBeTruthy()
    })

    it('removes the last id from the list when removing the tail entry', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-list-item-104'))
      fireEvent.click(screen.getByTestId('action-remove'))

      expect(screen.queryByTestId('thing-list-item-104')).not.toBeInTheDocument()
      expect(useAppStore.getState().things.items).toHaveLength(4)
      expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 104)).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // Double-click edit
  // -----------------------------------------------------------------------

  describe('double-click edit', () => {
    it('calls onEditThing on double-click', () => {
      loadProjectWithThings()
      const onEditThing = vi.fn()
      render(<ThingListPanel onEditThing={onEditThing} />)

      fireEvent.doubleClick(screen.getByTestId('thing-list-item-100'))
      expect(onEditThing).toHaveBeenCalledWith(100)
    })
  })

  // -----------------------------------------------------------------------
  // Display text
  // -----------------------------------------------------------------------

  describe('display text', () => {
    it('shows ID and market name for items with names', () => {
      const items = [makeThing(100, ThingCategory.ITEM, 'Golden Armor')]
      const clientInfo = createClientInfo()
      clientInfo.minItemId = 100
      clientInfo.maxItemId = 100

      useAppStore.setState({
        project: {
          loaded: true,
          isTemporary: false,
          changed: false,
          fileName: 'test.dat',
          datFilePath: null,
          sprFilePath: null
        },
        clientInfo,
        things: { items, outfits: [], effects: [], missiles: [] }
      })

      render(<ThingListPanel />)
      expect(screen.getByText('100 - Golden Armor')).toBeInTheDocument()
    })

    it('shows only ID for items without names', () => {
      const items = [makeThing(100, ThingCategory.ITEM)]
      const clientInfo = createClientInfo()
      clientInfo.minItemId = 100
      clientInfo.maxItemId = 100

      useAppStore.setState({
        project: {
          loaded: true,
          isTemporary: false,
          changed: false,
          fileName: 'test.dat',
          datFilePath: null,
          sprFilePath: null
        },
        clientInfo,
        things: { items, outfits: [], effects: [], missiles: [] }
      })

      render(<ThingListPanel />)
      expect(screen.getByTestId('thing-list-item-100')).toHaveTextContent('100')
    })
  })
})
