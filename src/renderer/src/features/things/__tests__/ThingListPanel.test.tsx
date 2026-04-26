/**
 * Tests for ThingListPanel component.
 * Covers category tabs, view modes, search/filter, selection,
 * context menu, pagination stepper, and virtual scrolling.
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, createEvent } from '@testing-library/react'
import { ThingListPanel, getGridMetrics } from '../ThingListPanel'
import { resetAppStore, useAppStore, resetEditorStore, resetSpriteStore, useSpriteStore } from '../../../stores'
import { compressPixels } from '../../../services/spr'
import { clearEffectColorAnalysisCache } from '../../../hooks/effect-dominant-color'
import { ThingCategory, createThingType, createClientInfo, createFrameGroup } from '../../../types'
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

function makePixels(red: number, green: number, blue: number, count = 4): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  for (let index = 0; index < count; index++) {
    const offset = index * 4
    pixels[offset] = 0xff
    pixels[offset + 1] = red
    pixels[offset + 2] = green
    pixels[offset + 3] = blue
  }
  return pixels
}

function makeMixedPixels(
  runs: Array<{ red: number; green: number; blue: number; count: number }>
): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  let index = 0
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) {
      const offset = index * 4
      pixels[offset] = 0xff
      pixels[offset + 1] = run.red
      pixels[offset + 2] = run.green
      pixels[offset + 3] = run.blue
      index++
    }
  }
  return pixels
}

function makeEffect(id: number, spriteId: number, marketName = ''): ThingType {
  const effect = makeThing(id, ThingCategory.EFFECT, marketName)
  const fg = createFrameGroup()
  fg.spriteIndex = [spriteId]
  effect.frameGroups[0] = fg
  return effect
}

function setMainFrameGroupSize(thing: ThingType, width: number, height: number): ThingType {
  const fg = createFrameGroup()
  fg.width = width
  fg.height = height
  fg.spriteIndex = new Array(Math.max(1, width * height)).fill(1)
  thing.frameGroups[0] = fg
  return thing
}

function loadFileBackedSpriteSource(readSprites: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      project: { readSprites }
    }
  })

  useSpriteStore.getState().loadFileBacked({
    kind: 'file-backed-pxg',
    signature: 0x59e48e02,
    spriteCount: 20,
    extended: true,
    sprFilePath: '/tmp/Tibia.spr',
    sprxFilePath: '/tmp/Tibia.sprx',
    baseSpriteCount: 10,
    extraSpriteCount: 10,
    baseAddressTableOffset: 8,
    extraAddressTableOffset: 16
  })
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

function loadProjectWithEffects(effects: ThingType[]): void {
  const clientInfo = createClientInfo()
  clientInfo.minEffectId = effects.length > 0 ? effects[0].id : 1
  clientInfo.maxEffectId = effects.length > 0 ? effects[effects.length - 1].id : 0

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
    currentCategory: ThingCategory.EFFECT,
    things: {
      items: [],
      outfits: [],
      effects,
      missiles: []
    }
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let getContextSpy: { mockRestore: () => void } | null = null
let toDataUrlSpy: { mockRestore: () => void } | null = null

beforeEach(() => {
  resetAppStore()
  resetEditorStore()
  resetSpriteStore()
  clearEffectColorAnalysisCache()
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        putImageData: vi.fn(),
        clearRect: vi.fn()
      }) as unknown as CanvasRenderingContext2D
  )
  toDataUrlSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(() => 'data:image/png;base64,test')
})

afterEach(() => {
  getContextSpy?.mockRestore()
  toDataUrlSpy?.mockRestore()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThingListPanel', () => {
  describe('grid metrics', () => {
    it('increases the number of columns when the panel becomes very wide', () => {
      expect(getGridMetrics(280).columns).toBe(2)
      expect(getGridMetrics(1200).columns).toBeGreaterThan(6)
    })
  })

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
      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-101')).toBeInTheDocument()
    })

    it('respects the configured page size for objects', () => {
      loadProjectWithThings(8)
      render(<ThingListPanel pageSize={3} />)

      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-101')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-102')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-103')).not.toBeInTheDocument()
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
      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-102')).toBeInTheDocument()

      // Switch to outfits (2 outfits starting at ID 1)
      fireEvent.click(screen.getByTestId('category-tab-outfit'))
      expect(screen.getByTestId('thing-grid-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-100')).not.toBeInTheDocument()
    })

    it('resets the scroll position when switching categories', () => {
      loadProjectWithThings(10, 2)
      render(<ThingListPanel />)

      const scrollContainer = screen.getByTestId('thing-list-scroll')
      scrollContainer.scrollTop = 160
      fireEvent.scroll(scrollContainer)

      fireEvent.click(screen.getByTestId('category-tab-outfit'))

      expect(scrollContainer.scrollTop).toBe(0)
      expect(screen.getByTestId('thing-grid-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-100')).not.toBeInTheDocument()
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
    it('renders in grid mode by default', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)
      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
    })

    it('switches to grid view', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('view-mode-grid'))
      const firstItem = screen.getByTestId('thing-grid-item-100')
      const secondItem = screen.getByTestId('thing-grid-item-101')

      expect(firstItem).toBeInTheDocument()
      expect(secondItem).toBeInTheDocument()
      expect(firstItem.style.top).toBe(secondItem.style.top)
      expect(firstItem.style.left).not.toBe(secondItem.style.left)
      expect(Number.parseFloat(firstItem.style.width)).toBeGreaterThan(64)
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

      expect(screen.getByTestId('thing-grid-item-102')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-100')).not.toBeInTheDocument()
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

      expect(screen.getByTestId('thing-grid-item-100')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-101')).not.toBeInTheDocument()
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

    it('filters objects by minimum grid area', () => {
      const items = [
        setMainFrameGroupSize(makeThing(100, ThingCategory.ITEM), 1, 1),
        setMainFrameGroupSize(makeThing(101, ThingCategory.ITEM), 2, 1),
        setMainFrameGroupSize(makeThing(102, ThingCategory.ITEM), 2, 2),
        setMainFrameGroupSize(makeThing(103, ThingCategory.ITEM), 3, 3)
      ]
      const clientInfo = createClientInfo()
      clientInfo.minItemId = 100
      clientInfo.maxItemId = 103

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

      fireEvent.change(screen.getByTestId('grid-area-filter'), { target: { value: '4' } })

      expect(screen.queryByTestId('thing-grid-item-100')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-101')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-102')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-103')).toBeInTheDocument()
    })

    it('combines text search with the minimum grid area filter', () => {
      vi.useFakeTimers()
      const items = [
        setMainFrameGroupSize(makeThing(100, ThingCategory.ITEM, 'Small Golden'), 1, 1),
        setMainFrameGroupSize(makeThing(101, ThingCategory.ITEM, 'Large Golden'), 2, 2),
        setMainFrameGroupSize(makeThing(102, ThingCategory.ITEM, 'Large Silver'), 2, 2)
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

      fireEvent.change(screen.getByTestId('grid-area-filter'), { target: { value: '4' } })
      fireEvent.change(screen.getByTestId('thing-search-input'), { target: { value: 'golden' } })
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.queryByTestId('thing-grid-item-100')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-101')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-102')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('shows a PXG loading overlay while applying a grid area filter', async () => {
      vi.useFakeTimers()
      let resolveReadSprites: (value: { entries: Array<[number, Uint8Array]> }) => void = () => {}
      const readSprites = vi.fn(
        () =>
          new Promise<{ entries: Array<[number, Uint8Array]> }>((resolve) => {
            resolveReadSprites = resolve
          })
      )
      loadFileBackedSpriteSource(readSprites)

      const items = [
        setMainFrameGroupSize(makeThing(100, ThingCategory.ITEM), 1, 1),
        setMainFrameGroupSize(makeThing(101, ThingCategory.ITEM), 2, 2)
      ]
      const clientInfo = createClientInfo()
      clientInfo.minItemId = 100
      clientInfo.maxItemId = 101
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
      fireEvent.change(screen.getByTestId('grid-area-filter'), { target: { value: '4' } })
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(screen.getByTestId('thing-filter-loading-overlay')).toBeInTheDocument()

      await act(async () => {
        resolveReadSprites({ entries: [[1, compressPixels(makePixels(255, 255, 255), false)]] })
        await Promise.resolve()
        vi.runOnlyPendingTimers()
      })

      expect(screen.queryByTestId('thing-filter-loading-overlay')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('does not intercept Cmd+V while typing in the search input', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      const input = screen.getByTestId('thing-search-input')
      const preventDefault = vi.fn()
      const event = createEvent.keyDown(input, {
        key: 'v',
        metaKey: true
      })
      event.preventDefault = preventDefault

      fireEvent(input, event)

      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('shows effect color controls only in the effects category', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      expect(screen.queryByTestId('effect-color-filter')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('category-tab-effect'))

      expect(screen.getByTestId('effect-color-filter')).toBeInTheDocument()
      expect(screen.getByTestId('effect-color-sort')).toBeInTheDocument()
    })

    it('filters effects by one dominant color and restores all colors', () => {
      useSpriteStore
        .getState()
        .loadSprites(
          new Map([
            [1, compressPixels(makePixels(255, 0, 0), false)],
            [2, compressPixels(makePixels(0, 64, 255), false)]
          ])
        )
      loadProjectWithEffects([makeEffect(1, 1, 'Fire Burst'), makeEffect(2, 2, 'Ice Wave')])
      render(<ThingListPanel />)

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'blue' } })

      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'all' } })

      expect(screen.getByTestId('thing-grid-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()
    })

    it('filters chromatic effects when the largest frame has stronger neutral glow', () => {
      useSpriteStore
        .getState()
        .loadSprites(
          new Map([
            [
              1,
              compressPixels(
                makeMixedPixels([
                  { red: 240, green: 240, blue: 240, count: 80 },
                  { red: 0, green: 96, blue: 255, count: 6 }
                ]),
                false
              )
            ],
            [
              2,
              compressPixels(
                makeMixedPixels([
                  { red: 240, green: 240, blue: 240, count: 80 },
                  { red: 255, green: 32, blue: 32, count: 6 }
                ]),
                false
              )
            ],
            [
              3,
              compressPixels(
                makeMixedPixels([
                  { red: 240, green: 240, blue: 240, count: 80 },
                  { red: 32, green: 220, blue: 32, count: 6 }
                ]),
                false
              )
            ],
            [4, compressPixels(makePixels(220, 220, 220, 86), false)]
          ])
        )
      loadProjectWithEffects([
        makeEffect(1, 1, 'Blue Glow'),
        makeEffect(2, 2, 'Red Glow'),
        makeEffect(3, 3, 'Green Glow'),
        makeEffect(4, 4, 'Neutral Glow')
      ])
      render(<ThingListPanel />)

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'blue' } })
      expect(screen.getByTestId('thing-grid-item-1')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-3')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-4')).not.toBeInTheDocument()

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'red' } })
      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-3')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-4')).not.toBeInTheDocument()

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'green' } })
      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-2')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-3')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-4')).not.toBeInTheDocument()

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'neutral' } })
      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-2')).not.toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-3')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-4')).toBeInTheDocument()
    })

    it('sorts effects by dominant color and then by ID within the same color', () => {
      useSpriteStore
        .getState()
        .loadSprites(
          new Map([
            [1, compressPixels(makePixels(0, 64, 255), false)],
            [2, compressPixels(makePixels(255, 0, 0), false)]
          ])
        )
      loadProjectWithEffects([
        makeEffect(4, 2, 'Fire Four'),
        makeEffect(3, 1, 'Ice Three'),
        makeEffect(2, 2, 'Fire Two')
      ])
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('effect-color-sort'))

      const renderedIds = screen
        .getAllByTestId(/thing-grid-item-/)
        .sort((a, b) => {
          const aTop = Number.parseFloat(a.style.top)
          const bTop = Number.parseFloat(b.style.top)
          if (aTop !== bTop) return aTop - bTop
          return Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left)
        })
        .map((item) => item.getAttribute('data-testid'))

      expect(renderedIds).toEqual(['thing-grid-item-2', 'thing-grid-item-4', 'thing-grid-item-3'])
    })

    it('combines text search with the effect color filter', () => {
      vi.useFakeTimers()
      useSpriteStore
        .getState()
        .loadSprites(
          new Map([
            [1, compressPixels(makePixels(255, 0, 0), false)],
            [2, compressPixels(makePixels(0, 64, 255), false)],
            [3, compressPixels(makePixels(0, 64, 255), false)]
          ])
        )
      loadProjectWithEffects([
        makeEffect(1, 1, 'Fire Burst'),
        makeEffect(2, 2, 'Ice Wave'),
        makeEffect(3, 3, 'Blue Spark')
      ])
      render(<ThingListPanel />)

      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'blue' } })
      fireEvent.change(screen.getByTestId('thing-search-input'), { target: { value: 'ice' } })
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-grid-item-3')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('waits for file-backed PXG sprites before applying effect color filtering', async () => {
      vi.useFakeTimers()
      let resolveReadSprites: (value: { entries: Array<[number, Uint8Array]> }) => void = () => {}
      const readSprites = vi.fn(
        () =>
          new Promise<{ entries: Array<[number, Uint8Array]> }>((resolve) => {
            resolveReadSprites = resolve
          })
      )
      loadFileBackedSpriteSource(readSprites)
      loadProjectWithEffects([makeEffect(1, 1, 'Fire Burst'), makeEffect(2, 2, 'Ice Wave')])

      render(<ThingListPanel />)
      fireEvent.change(screen.getByTestId('effect-color-filter'), { target: { value: 'blue' } })
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(screen.getByTestId('thing-filter-loading-overlay')).toHaveTextContent(
        'Filtering objects...'
      )

      await act(async () => {
        resolveReadSprites({
          entries: [
            [1, compressPixels(makePixels(255, 0, 0), false)],
            [2, compressPixels(makePixels(0, 64, 255), false)]
          ]
        })
        await Promise.resolve()
        vi.runOnlyPendingTimers()
      })

      expect(screen.queryByTestId('thing-grid-item-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('thing-grid-item-2')).toBeInTheDocument()
      expect(screen.queryByTestId('thing-filter-loading-overlay')).not.toBeInTheDocument()
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  describe('selection', () => {
    it('selects a thing on click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-101'))
      expect(useAppStore.getState().selectedThingId).toBe(101)
      expect(useAppStore.getState().selectedThingIds).toEqual([101])
    })

    it('multi-selects with Ctrl+click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-100'))
      fireEvent.click(screen.getByTestId('thing-grid-item-102'), { ctrlKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([100, 102])
    })

    it('range-selects with Shift+click', () => {
      loadProjectWithThings(5)
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-100'))
      fireEvent.click(screen.getByTestId('thing-grid-item-103'), { shiftKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([100, 101, 102, 103])
    })

    it('deselects with Ctrl+click on already selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-100'))
      fireEvent.click(screen.getByTestId('thing-grid-item-101'), { ctrlKey: true })
      fireEvent.click(screen.getByTestId('thing-grid-item-100'), { ctrlKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([101])
    })

    it('selects all filtered things with Cmd+A', () => {
      loadProjectWithThings(5)
      render(<ThingListPanel />)

      fireEvent.mouseDown(screen.getByTestId('thing-grid-item-100'))
      fireEvent.keyDown(screen.getByTestId('thing-list-panel'), { key: 'a', metaKey: true })

      expect(useAppStore.getState().selectedThingIds).toEqual([100, 101, 102, 103, 104])
    })
  })

  // -----------------------------------------------------------------------
  // Context menu
  // -----------------------------------------------------------------------

  describe('context menu', () => {
    it('opens context menu on right-click', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-grid-item-100'))
      expect(screen.getByTestId('thing-context-menu')).toBeInTheDocument()
    })

    it('selects the item when right-clicking an unselected item', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-grid-item-102'))
      expect(useAppStore.getState().selectedThingId).toBe(102)
    })

    it('shows all context menu items', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.contextMenu(screen.getByTestId('thing-grid-item-100'))

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

      fireEvent.contextMenu(screen.getByTestId('thing-grid-item-100'))
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

      fireEvent.click(screen.getByTestId('thing-grid-item-100'))

      expect(screen.getByTestId('action-replace')).not.toBeDisabled()
      expect(screen.getByTestId('action-export')).not.toBeDisabled()
      expect(screen.getByTestId('action-edit')).not.toBeDisabled()
      expect(screen.getByTestId('action-duplicate')).not.toBeDisabled()
      expect(screen.getByTestId('action-remove')).not.toBeDisabled()
    })

    it('disables Edit button when multiple things are selected', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-100'))
      fireEvent.click(screen.getByTestId('thing-grid-item-101'), { ctrlKey: true })

      expect(screen.getByTestId('action-edit')).toBeDisabled()
      // Replace/Export/Duplicate/Remove still enabled
      expect(screen.getByTestId('action-replace')).not.toBeDisabled()
    })

    it('keeps non-tail ids in the list as empty entries when removing', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-101'))
      fireEvent.click(screen.getByTestId('action-remove'))

      expect(screen.getByTestId('thing-grid-item-101')).toBeInTheDocument()
      expect(useAppStore.getState().things.items).toHaveLength(5)
      expect(useAppStore.getState().getThingById(ThingCategory.ITEM, 101)).toBeTruthy()
    })

    it('removes the last id from the list when removing the tail entry', () => {
      loadProjectWithThings()
      render(<ThingListPanel />)

      fireEvent.click(screen.getByTestId('thing-grid-item-104'))
      fireEvent.click(screen.getByTestId('action-remove'))

      expect(screen.queryByTestId('thing-grid-item-104')).not.toBeInTheDocument()
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

      fireEvent.doubleClick(screen.getByTestId('thing-grid-item-100'))
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
      fireEvent.click(screen.getByTestId('view-mode-list'))
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
      fireEvent.click(screen.getByTestId('view-mode-list'))
      expect(screen.getByTestId('thing-list-item-100')).toHaveTextContent('100')
    })
  })
})
