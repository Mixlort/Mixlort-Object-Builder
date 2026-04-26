/**
 * Things list panel - left panel of the application.
 * Shows a paginated, virtualized list of things (Items, Outfits, Effects, Missiles)
 * with category tabs, list/grid view modes, search/filter, selection,
 * context menu, and pagination stepper.
 *
 * Ported from legacy AS3:
 * - ObjectBuilder.mxml (things panel layout, category dropdown, toolbar)
 * - otlib/components/ThingList.as (virtual list, view modes, selection)
 * - otlib/components/ListBase.as (selection management, scroll preservation)
 * - otlib/components/renders/ThingListRenderer.as (list item: 40px height)
 * - otlib/components/renders/ThingGridRenderer.as (grid cell: 64x71px)
 * - otlib/components/AmountNumericStepper.as (pagination stepper)
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { workerService } from '../../workers/worker-service'
import { compareFileNamesNaturally } from '../../utils'
import { materializeImportedThingData } from '../../services/thing-import/thing-import-service'
import { useSpriteStore } from '../../stores'
import {
  useAppStore,
  useEditorStore,
  selectCurrentCategory,
  selectSelectedThingId,
  selectSelectedThingIds,
  selectIsProjectLoaded
} from '../../stores'
import {
  ThingCategory,
  type ThingType,
  type ThingData,
  createThing,
  cloneThingType,
  cloneThingData,
  copyThingProperties,
  copyThingPatterns,
  ClipboardAction,
  FrameGroupType
} from '../../types'
import {
  IconList,
  IconGrid,
  IconSearch,
  IconReplace,
  IconImport,
  IconExport,
  IconEdit,
  IconDuplicate,
  IconAdd,
  IconDelete,
  IconLookType
} from '../../components/Icons'
import { useTranslation } from 'react-i18next'
import { PaginationStepper } from '../../components/PaginationStepper'
import { ThingContextMenu, type ThingContextAction } from './ThingContextMenu'
import {
  hasThingThumbnailCache,
  useSpriteThumbnail,
  warmThingThumbnailCache
} from '../../hooks/use-sprite-thumbnail'
import {
  collectThingThumbnailSpriteIds,
  collectThingsSpriteIds,
  collectThingsThumbnailSpriteIds
} from '../../services/sprite-preload'
import {
  filterThingsByMinGridArea,
  GRID_AREA_FILTER_OPTIONS
} from '../../services/thing-grid-filter'
import type { EffectPreviewFrameMode } from '../../hooks/effect-preview-frame'
import {
  EFFECT_COLOR_BUCKETS,
  EFFECT_COLOR_BUCKET_LABELS,
  filterEffectsByColorBucket,
  sortEffectsByColorBucket,
  type EffectColorFilter
} from '../../hooks/effect-dominant-color'
import { debounce } from '../../utils/debounce'

// ---------------------------------------------------------------------------
// Constants (mirroring legacy renderer sizes)
// ---------------------------------------------------------------------------

const LIST_ITEM_HEIGHT = 40
const GRID_GAP = 4
const GRID_PADDING = 4
const GRID_FALLBACK_WIDTH = 220
const GRID_THREE_COLUMN_MIN_CARD_WIDTH = 92
const MIN_OVERSCAN_ROWS = 5
const OVERSCAN_VIEWPORT_MULTIPLIER = 2
const FAST_SCROLL_SYNC_VIEWPORT_RATIO = 0.75
const PAGE_PRELOAD_CHUNK_SIZE = 750
const THUMBNAIL_WARM_CHUNK_SIZE = 75
const EFFECT_ANALYSIS_CHUNK_SIZE = 2000
const EFFECT_ANALYSIS_CACHE_NOTE = 'This runs once and stays cached afterwards.'

/** Default page size matching legacy objectsListAmount setting */
const DEFAULT_PAGE_SIZE = 100

type ViewMode = 'list' | 'grid'

const CATEGORIES = [
  { key: ThingCategory.ITEM, labelKey: 'labels.items' },
  { key: ThingCategory.OUTFIT, labelKey: 'labels.outfits' },
  { key: ThingCategory.EFFECT, labelKey: 'labels.effects' },
  { key: ThingCategory.MISSILE, labelKey: 'labels.missiles' }
] as const

function parseSpriteIdsKey(key: string): number[] {
  if (!key) return []
  return key
    .split(',')
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

type PagePrepareProgress = {
  done: number
  total: number
}

export interface ThingListLoadingState {
  active: boolean
  label: string
  progress?: PagePrepareProgress
  note?: string
}

export function getThingListLoadingMessages(
  filterLoadingLabel: string,
  pagePrepareProgress: PagePrepareProgress | null,
  filterLoadingProgress: PagePrepareProgress | null = null,
  filterLoadingNote: string | null = null
): {
  globalLabel: string | null
  globalProgress: PagePrepareProgress | null
  globalNote: string | null
  localLabel: string | null
} {
  if (filterLoadingLabel) {
    return {
      globalLabel: filterLoadingLabel,
      globalProgress: filterLoadingProgress,
      globalNote: filterLoadingNote,
      localLabel: null
    }
  }

  if (pagePrepareProgress) {
    return {
      globalLabel: null,
      globalProgress: null,
      globalNote: null,
      localLabel: `Preparing page... ${pagePrepareProgress.done}/${pagePrepareProgress.total}`
    }
  }

  return {
    globalLabel: null,
    globalProgress: null,
    globalNote: null,
    localLabel: null
  }
}

function warmThumbnails(
  things: ThingType[],
  category: ThingCategory,
  transparent: boolean,
  effectPreviewFrameMode: EffectPreviewFrameMode
): void {
  for (const thing of things) {
    try {
      warmThingThumbnailCache(thing, category, transparent, effectPreviewFrameMode)
    } catch {
      // Missing or malformed sprite data leaves the regular placeholder visible.
    }
  }
}

function areThumbnailsWarm(
  things: ThingType[],
  category: ThingCategory,
  transparent: boolean,
  effectPreviewFrameMode: EffectPreviewFrameMode
): boolean {
  return things.every((thing) =>
    hasThingThumbnailCache(thing, category, transparent, effectPreviewFrameMode)
  )
}

// Checkerboard CSS for sprite thumbnail background
const CHECKERBOARD_STYLE = {
  backgroundImage: [
    'linear-gradient(45deg, #555 25%, transparent 25%)',
    'linear-gradient(-45deg, #555 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #555 75%)',
    'linear-gradient(-45deg, transparent 75%, #555 75%)'
  ].join(', '),
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
}

// ---------------------------------------------------------------------------
// Sprite thumbnail component
// ---------------------------------------------------------------------------

function SpriteThumbnail({
  thing,
  category,
  effectPreviewFrameMode,
  sizePx = 32
}: {
  thing: ThingType
  category: ThingCategory
  effectPreviewFrameMode: EffectPreviewFrameMode
  sizePx?: number
}): React.JSX.Element {
  const dataUrl = useSpriteThumbnail(thing, category, effectPreviewFrameMode)
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        className="shrink-0 rounded-sm object-contain"
        style={{ imageRendering: 'pixelated', width: sizePx, height: sizePx }}
        alt=""
      />
    )
  }
  return (
    <div className="shrink-0 rounded-sm bg-bg-tertiary" style={{ width: sizePx, height: sizePx }}>
      <div className="h-full w-full" style={CHECKERBOARD_STYLE} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Virtual item types
// ---------------------------------------------------------------------------

interface VirtualItem {
  thing: ThingType
  index: number
  top: number
  left?: number
}

interface GridMetrics {
  columns: number
  cardWidth: number
  cardHeight: number
  columnWidth: number
  iconSize: number
  rowHeight: number
}

export function getGridMetrics(containerWidth: number): GridMetrics {
  const effectiveWidth = Math.max(containerWidth, GRID_FALLBACK_WIDTH)
  let columns = 2
  const maxColumns = Math.max(
    3,
    Math.floor(
      (effectiveWidth - GRID_PADDING * 2 + GRID_GAP) /
        (GRID_THREE_COLUMN_MIN_CARD_WIDTH + GRID_GAP)
    )
  )

  for (let candidate = maxColumns; candidate >= 3; candidate--) {
    const estimatedCardWidth =
      Math.floor(
        (effectiveWidth - GRID_PADDING * 2 - GRID_GAP * (candidate - 1)) / candidate
      ) - 4

    if (estimatedCardWidth >= GRID_THREE_COLUMN_MIN_CARD_WIDTH) {
      columns = candidate
      break
    }
  }

  const totalGap = GRID_GAP * (columns - 1)
  const availableWidth = effectiveWidth - GRID_PADDING * 2 - totalGap
  const columnWidth = Math.max(72, Math.floor(availableWidth / columns))
  const cardWidth = columns === 2 ? Math.max(76, columnWidth) : Math.max(92, columnWidth)
  const cardHeight = columns === 2
    ? Math.max(68, Math.min(cardWidth - 10, 82))
    : Math.max(84, Math.min(cardWidth - 8, 96))
  const iconSize = columns === 2
    ? Math.max(50, Math.min(cardWidth - 12, 60))
    : Math.max(58, Math.min(cardWidth - 12, 70))

  return {
    columns,
    cardWidth,
    cardHeight,
    columnWidth,
    iconSize,
    rowHeight: cardHeight + GRID_GAP
  }
}

export function getVirtualOverscanRows(containerHeight: number, rowHeight: number): number {
  if (containerHeight <= 0 || rowHeight <= 0) return MIN_OVERSCAN_ROWS
  return Math.max(
    MIN_OVERSCAN_ROWS,
    Math.ceil((containerHeight / rowHeight) * OVERSCAN_VIEWPORT_MULTIPLIER)
  )
}

export function getShouldFlushVirtualScroll(
  previousScrollTop: number,
  nextScrollTop: number,
  containerHeight: number
): boolean {
  if (containerHeight <= 0) return false
  return Math.abs(nextScrollTop - previousScrollTop) >= containerHeight * FAST_SCROLL_SYNC_VIEWPORT_RATIO
}

// ---------------------------------------------------------------------------
// ActionButton (footer toolbar icon button)
// ---------------------------------------------------------------------------

function ActionButton({
  icon,
  title,
  disabled,
  onClick,
  testId
}: {
  icon: React.ReactNode
  title: string
  disabled: boolean
  onClick: () => void
  testId: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[22px] w-[22px] items-center justify-center rounded ${
        disabled
          ? 'text-text-secondary/30 cursor-not-allowed'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      }`}
      data-testid={testId}
    >
      {icon}
    </button>
  )
}

// ---------------------------------------------------------------------------
// ThingListPanel
// ---------------------------------------------------------------------------

/** Actions that require App-level handling (dialogs) */
export type ThingListAction = 'replace' | 'import' | 'export' | 'find'

interface ThingListPanelProps {
  onEditThing?: (thingId: number) => void
  onAction?: (action: ThingListAction) => void
  pageSize?: number
  effectPreviewFrameMode?: EffectPreviewFrameMode
  onLoadingStateChange?: (state: ThingListLoadingState) => void
}

export function ThingListPanel({
  onEditThing,
  onAction,
  pageSize = DEFAULT_PAGE_SIZE,
  effectPreviewFrameMode = 'first',
  onLoadingStateChange
}: ThingListPanelProps = {}): React.JSX.Element {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchInput, setSearchInput] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [effectColorFilter, setEffectColorFilter] = useState<EffectColorFilter>('all')
  const [effectColorSortEnabled, setEffectColorSortEnabled] = useState(false)
  const [minGridArea, setMinGridArea] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [filterLoadingLabel, setFilterLoadingLabel] = useState('')
  const [filterLoadingProgress, setFilterLoadingProgress] = useState<PagePrepareProgress | null>(null)
  const [filterLoadingNote, setFilterLoadingNote] = useState<string | null>(null)
  const [pagePrepareProgress, setPagePrepareProgress] = useState<PagePrepareProgress | null>(null)
  const preloadTokenRef = useRef(0)

  // Debounced search filter (150ms delay for filtering, immediate input update)
  const debouncedSetFilter = useMemo(
    () => debounce((value: string) => setSearchFilter(value), 150),
    []
  )

  useEffect(() => {
    return () => debouncedSetFilter.cancel()
  }, [debouncedSetFilter])

  // Scroll container state
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const scrollTopRef = useRef(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const syncScrollPosition = useCallback((nextScrollTop: number) => {
    scrollTopRef.current = nextScrollTop
    setScrollTop(nextScrollTop)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = nextScrollTop
    }
  }, [])
  const resetScrollPosition = useCallback(() => {
    syncScrollPosition(0)
  }, [syncScrollPosition])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchInput(value)
      setCurrentPage(0)
      resetScrollPosition()
      debouncedSetFilter(value)
    },
    [debouncedSetFilter, resetScrollPosition]
  )

  const handleGridAreaFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setMinGridArea(Number(e.target.value))
      setCurrentPage(0)
      resetScrollPosition()
    },
    [resetScrollPosition]
  )

  const handlePanelMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }

    panelRef.current?.focus()
  }, [])

  // Store state
  const currentCategory = useAppStore(selectCurrentCategory)
  const selectedThingId = useAppStore(selectSelectedThingId)
  const selectedThingIds = useAppStore(selectSelectedThingIds)
  const isLoaded = useAppStore(selectIsProjectLoaded)
  const things = useAppStore((s) => s.things)

  // Store actions
  const setCurrentCategory = useAppStore((s) => s.setCurrentCategory)
  const selectThing = useAppStore((s) => s.selectThing)
  const selectThingsAction = useAppStore((s) => s.selectThings)
  const addThing = useAppStore((s) => s.addThing)
  const getThingById = useAppStore((s) => s.getThingById)
  const clientInfo = useAppStore((s) => s.clientInfo)
  const transparentEnabled = clientInfo?.features.transparency ?? false
  const resolvedPageSize = Math.max(1, pageSize)
  const isFileBackedSpriteSource = useSpriteStore((s) => s.fileBackedSource !== null)
  const spriteCacheLoading = useSpriteStore((s) => s.spriteCacheLoading)
  const spriteCachePendingCount = useSpriteStore((s) => s.spriteCachePendingCount)

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const categoryThings = useMemo((): ThingType[] => {
    switch (currentCategory) {
      case ThingCategory.ITEM:
        return things.items
      case ThingCategory.OUTFIT:
        return things.outfits
      case ThingCategory.EFFECT:
        return things.effects
      case ThingCategory.MISSILE:
        return things.missiles
    }
  }, [currentCategory, things])

  const textFilteredThings = useMemo((): ThingType[] => {
    const filter = searchFilter.trim()
    if (!filter) return categoryThings

    const lowerFilter = filter.toLowerCase()
    const numFilter = parseInt(filter, 10)

    return categoryThings.filter((t) => {
      // Match by ID (partial)
      if (!isNaN(numFilter) && t.id.toString().includes(filter)) return true
      // Match by market name or name
      if (t.marketName && t.marketName.toLowerCase().includes(lowerFilter)) return true
      if (t.name && t.name.toLowerCase().includes(lowerFilter)) return true
      return false
    })
  }, [categoryThings, searchFilter])

  const gridFilteredThings = useMemo(
    () => filterThingsByMinGridArea(textFilteredThings, minGridArea),
    [textFilteredThings, minGridArea]
  )

  const effectColorAnalysisKey = useMemo(() => {
    if (
      !isFileBackedSpriteSource ||
      currentCategory !== ThingCategory.EFFECT ||
      (effectColorFilter === 'all' && !effectColorSortEnabled)
    ) {
      return ''
    }

    return collectThingsSpriteIds(gridFilteredThings)
      .sort((a, b) => a - b)
      .join(',')
  }, [
    currentCategory,
    effectColorFilter,
    effectColorSortEnabled,
    gridFilteredThings,
    isFileBackedSpriteSource
  ])
  const [readyEffectColorAnalysisKey, setReadyEffectColorAnalysisKey] = useState('')

  useEffect(() => {
    if (!effectColorAnalysisKey) {
      setReadyEffectColorAnalysisKey('')
      setFilterLoadingLabel('')
      setFilterLoadingProgress(null)
      setFilterLoadingNote(null)
      return
    }

    const effectColorAnalysisIds = effectColorAnalysisKey
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (useSpriteStore.getState().areSpritesCached(effectColorAnalysisIds)) {
      setReadyEffectColorAnalysisKey(effectColorAnalysisKey)
      setFilterLoadingLabel('')
      setFilterLoadingProgress(null)
      setFilterLoadingNote(null)
      return
    }

    let cancelled = false
    void (async () => {
      const spriteStore = useSpriteStore.getState()
      setFilterLoadingLabel('Filtering objects...')
      setFilterLoadingProgress({ done: 0, total: effectColorAnalysisIds.length })
      setFilterLoadingNote(EFFECT_ANALYSIS_CACHE_NOTE)

      for (
        let start = 0;
        start < effectColorAnalysisIds.length && !cancelled;
        start += EFFECT_ANALYSIS_CHUNK_SIZE
      ) {
        const chunk = effectColorAnalysisIds.slice(start, start + EFFECT_ANALYSIS_CHUNK_SIZE)
        await spriteStore.ensureSpritesCached(chunk)
        if (cancelled) return
        setFilterLoadingProgress({
          done: Math.min(start + chunk.length, effectColorAnalysisIds.length),
          total: effectColorAnalysisIds.length
        })
        await nextTask()
      }

      if (!cancelled) {
        setReadyEffectColorAnalysisKey(effectColorAnalysisKey)
        setFilterLoadingProgress(null)
        setFilterLoadingNote(null)
        setFilterLoadingLabel('')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectColorAnalysisKey])

  const effectColorAnalysisReady =
    effectColorAnalysisKey === '' || readyEffectColorAnalysisKey === effectColorAnalysisKey

  const filteredThings = useMemo((): ThingType[] => {
    if (currentCategory !== ThingCategory.EFFECT) return gridFilteredThings
    if (!effectColorAnalysisReady) return gridFilteredThings

    const spriteStore = useSpriteStore.getState()
    const getSprite = (spriteId: number) => spriteStore.getSprite(spriteId)
    let result = filterEffectsByColorBucket(
      gridFilteredThings,
      effectColorFilter,
      getSprite,
      transparentEnabled
    )

    if (effectColorSortEnabled) {
      result = sortEffectsByColorBucket(result, getSprite, transparentEnabled)
    }

    return result
  }, [
    currentCategory,
    gridFilteredThings,
    effectColorFilter,
    effectColorSortEnabled,
    transparentEnabled,
    effectColorAnalysisReady
  ])

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(filteredThings.length / resolvedPageSize))
  const safePage = Math.min(currentPage, totalPages - 1)

  const pageStart = safePage * resolvedPageSize
  const pageEnd = Math.min(pageStart + resolvedPageSize, filteredThings.length)
  const pageThings = useMemo(
    () => filteredThings.slice(pageStart, pageEnd),
    [filteredThings, pageStart, pageEnd]
  )

  // Stepper value: selected thing's ID if it's in filteredThings, otherwise first thing on page
  const stepperValue = useMemo(() => {
    if (selectedThingId !== null) {
      const inFiltered = filteredThings.some((t) => t.id === selectedThingId)
      if (inFiltered) return selectedThingId
    }
    return pageThings.length > 0 ? pageThings[0].id : 0
  }, [selectedThingId, filteredThings, pageThings])

  const stepperMin = filteredThings.length > 0 ? filteredThings[0].id : 0
  const stepperMax = filteredThings.length > 0 ? filteredThings[filteredThings.length - 1].id : 0

  // Find closest thing to a target ID and navigate to its page
  const handleStepperChange = useCallback(
    (targetId: number) => {
      if (filteredThings.length === 0) return

      // Find closest thing by ID
      let bestIdx = 0
      let bestDist = Math.abs(filteredThings[0].id - targetId)
      for (let i = 1; i < filteredThings.length; i++) {
        const dist = Math.abs(filteredThings[i].id - targetId)
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = i
        }
      }

      const thing = filteredThings[bestIdx]
      selectThing(thing.id)

      const page = Math.floor(bestIdx / resolvedPageSize)
      setCurrentPage(page)

      // Scroll to the thing within the page
      if (scrollRef.current) {
        const idxInPage = bestIdx - page * resolvedPageSize
        let targetTop: number
        if (viewMode === 'list') {
          targetTop = idxInPage * LIST_ITEM_HEIGHT
        } else {
          const { columns, rowHeight } = getGridMetrics(containerWidth)
          targetTop = GRID_PADDING + Math.floor(idxInPage / columns) * rowHeight
        }
        syncScrollPosition(Math.max(0, targetTop - containerHeight / 2))
      }
    },
    [
      filteredThings,
      selectThing,
      viewMode,
      containerWidth,
      containerHeight,
      resolvedPageSize,
      syncScrollPosition
    ]
  )

  // -------------------------------------------------------------------------
  // Scroll / resize tracking
  // -------------------------------------------------------------------------

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const nextScrollTop = scrollRef.current.scrollTop
      const shouldFlush = getShouldFlushVirtualScroll(
        scrollTopRef.current,
        nextScrollTop,
        containerHeight
      )
      scrollTopRef.current = nextScrollTop
      if (shouldFlush) {
        flushSync(() => {
          setScrollTop(nextScrollTop)
        })
      } else {
        setScrollTop(nextScrollTop)
      }
    }
  }, [containerHeight])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    setContainerWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // -------------------------------------------------------------------------
  // Virtual scroll computation (operates on pageThings)
  // -------------------------------------------------------------------------

  const virtualState = useMemo((): { totalHeight: number; items: VirtualItem[] } => {
    const count = pageThings.length
    if (count === 0) return { totalHeight: 0, items: [] }

    if (viewMode === 'list') {
      const totalHeight = count * LIST_ITEM_HEIGHT
      const overscanRows = getVirtualOverscanRows(containerHeight, LIST_ITEM_HEIGHT)
      const startIdx = Math.max(0, Math.floor(scrollTop / LIST_ITEM_HEIGHT) - overscanRows)
      const endIdx = Math.min(
        count - 1,
        Math.ceil((scrollTop + containerHeight) / LIST_ITEM_HEIGHT) + overscanRows
      )

      const items: VirtualItem[] = []
      for (let i = startIdx; i <= endIdx; i++) {
        items.push({
          thing: pageThings[i],
          index: i,
          top: i * LIST_ITEM_HEIGHT
        })
      }
      return { totalHeight, items }
    }

    // Grid mode
    const { columns, cardWidth, cardHeight, columnWidth, rowHeight } = getGridMetrics(containerWidth)
    const totalRows = Math.ceil(count / columns)
    const totalHeight =
      totalRows * cardHeight + Math.max(0, totalRows - 1) * GRID_GAP + GRID_PADDING * 2
    const overscanRows = getVirtualOverscanRows(containerHeight, rowHeight)
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscanRows
    )

    const items: VirtualItem[] = []
    for (let row = startRow; row <= endRow; row++) {
      for (let col = 0; col < columns; col++) {
        const idx = row * columns + col
        if (idx < count) {
          items.push({
            thing: pageThings[idx],
            index: idx,
            top: GRID_PADDING + row * rowHeight,
            left: GRID_PADDING + col * (columnWidth + GRID_GAP) + Math.floor((columnWidth - cardWidth) / 2)
          })
        }
      }
    }
    return { totalHeight, items }
  }, [viewMode, pageThings, scrollTop, containerHeight, containerWidth])

  const gridMetrics = useMemo(() => getGridMetrics(containerWidth), [containerWidth])
  const visibleThings = useMemo(
    () => virtualState.items.map((item) => item.thing),
    [virtualState.items]
  )
  const visibleThumbnailSpriteIdsKey = useMemo(() => {
    if (!isFileBackedSpriteSource || virtualState.items.length === 0) return ''
    const ids = new Set<number>()
    for (const item of virtualState.items) {
      for (const spriteId of collectThingThumbnailSpriteIds(
        item.thing,
        currentCategory,
        effectPreviewFrameMode
      )) {
        ids.add(spriteId)
      }
    }
    return Array.from(ids)
      .sort((a, b) => a - b)
      .join(',')
  }, [isFileBackedSpriteSource, virtualState.items, currentCategory, effectPreviewFrameMode])
  const pageThumbnailSpriteIdsKey = useMemo(() => {
    if (!isFileBackedSpriteSource || pageThings.length === 0) return ''
    return collectThingsThumbnailSpriteIds(pageThings, currentCategory, effectPreviewFrameMode)
      .sort((a, b) => a - b)
      .join(',')
  }, [isFileBackedSpriteSource, pageThings, currentCategory, effectPreviewFrameMode])
  const visibleThingsRef = useRef(visibleThings)
  const visibleThumbnailSpriteIdsKeyRef = useRef(visibleThumbnailSpriteIdsKey)

  useEffect(() => {
    visibleThingsRef.current = visibleThings
    visibleThumbnailSpriteIdsKeyRef.current = visibleThumbnailSpriteIdsKey
  }, [visibleThings, visibleThumbnailSpriteIdsKey])

  const foregroundPreloadKey = useMemo(
    () =>
      [
        currentCategory,
        searchFilter,
        minGridArea,
        effectColorFilter,
        effectColorSortEnabled ? 1 : 0,
        safePage,
        viewMode,
        containerWidth,
        containerHeight,
        effectPreviewFrameMode,
        effectColorAnalysisReady ? 1 : 0,
        pageThumbnailSpriteIdsKey
      ].join('|'),
    [
      currentCategory,
      searchFilter,
      minGridArea,
      effectColorFilter,
      effectColorSortEnabled,
      safePage,
      viewMode,
      containerWidth,
      containerHeight,
      effectPreviewFrameMode,
      effectColorAnalysisReady,
      pageThumbnailSpriteIdsKey
    ]
  )

  useEffect(() => {
    if (!isFileBackedSpriteSource) {
      setFilterLoadingLabel('')
      setFilterLoadingProgress(null)
      setFilterLoadingNote(null)
      setPagePrepareProgress(null)
      return
    }

    const token = preloadTokenRef.current + 1
    preloadTokenRef.current = token
    let cancelled = false

    const isCurrent = () => !cancelled && preloadTokenRef.current === token
    const run = async (): Promise<void> => {
      setPagePrepareProgress(null)

      if (!effectColorAnalysisReady) {
        return
      }

      const visibleSpriteIds = parseSpriteIdsKey(visibleThumbnailSpriteIdsKeyRef.current)
      const spriteStore = useSpriteStore.getState()
      const visibleSpritesReady = spriteStore.areSpritesCached(visibleSpriteIds)
      if (!visibleSpritesReady) {
        setFilterLoadingLabel('Loading page sprites...')
        await spriteStore.ensureSpritesCached(visibleSpriteIds)
      }
      if (!isCurrent()) return

      const visibleThumbnailsReady = areThumbnailsWarm(
        visibleThingsRef.current,
        currentCategory,
        transparentEnabled,
        effectPreviewFrameMode
      )
      if (!visibleThumbnailsReady) {
        setFilterLoadingLabel('Preparing thumbnails...')
        warmThumbnails(
          visibleThingsRef.current,
          currentCategory,
          transparentEnabled,
          effectPreviewFrameMode
        )
      }
      if (!isCurrent()) return

      setFilterLoadingLabel('')

      const pageSpriteIds = parseSpriteIdsKey(pageThumbnailSpriteIdsKey)
      if (pageSpriteIds.length === 0) return

      const pageSpritesReady = spriteStore.areSpritesCached(pageSpriteIds)
      if (!pageSpritesReady) {
        setPagePrepareProgress({ done: 0, total: pageSpriteIds.length })
        for (let start = 0; start < pageSpriteIds.length; start += PAGE_PRELOAD_CHUNK_SIZE) {
          if (!isCurrent()) return
          const chunk = pageSpriteIds.slice(start, start + PAGE_PRELOAD_CHUNK_SIZE)
          await spriteStore.ensureSpritesCached(chunk)
          if (!isCurrent()) return
          setPagePrepareProgress({
            done: Math.min(start + chunk.length, pageSpriteIds.length),
            total: pageSpriteIds.length
          })
          await nextTask()
        }
      }

      const pageThumbnailsReady = areThumbnailsWarm(
        pageThings,
        currentCategory,
        transparentEnabled,
        effectPreviewFrameMode
      )
      if (!pageThumbnailsReady) {
        const thumbnailTotal = pageThings.length
        if (!pageSpritesReady) {
          setPagePrepareProgress({ done: 0, total: thumbnailTotal })
        }

        for (let start = 0; start < pageThings.length; start += THUMBNAIL_WARM_CHUNK_SIZE) {
          if (!isCurrent()) return
          warmThumbnails(
            pageThings.slice(start, start + THUMBNAIL_WARM_CHUNK_SIZE),
            currentCategory,
            transparentEnabled,
            effectPreviewFrameMode
          )
          if (!pageSpritesReady) {
            setPagePrepareProgress({
              done: Math.min(start + THUMBNAIL_WARM_CHUNK_SIZE, thumbnailTotal),
              total: thumbnailTotal
            })
          }
          await nextTask()
        }
      }

      if (pageSpritesReady && pageThumbnailsReady) {
        setPagePrepareProgress(null)
        return
      }

      if (isCurrent()) {
        setPagePrepareProgress(null)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    currentCategory,
    effectColorAnalysisReady,
    effectPreviewFrameMode,
    foregroundPreloadKey,
    isFileBackedSpriteSource,
    pageThings,
    pageThumbnailSpriteIdsKey,
    transparentEnabled
  ])

  useEffect(() => {
    if (!onLoadingStateChange) return

    const { globalLabel, globalProgress, globalNote } = getThingListLoadingMessages(
      filterLoadingLabel,
      pagePrepareProgress,
      filterLoadingProgress,
      filterLoadingNote
    )
    if (globalLabel) {
      onLoadingStateChange({
        active: true,
        label: globalLabel,
        progress: globalProgress ?? undefined,
        note: globalNote ?? undefined
      })
      return
    }

    onLoadingStateChange({ active: false, label: '' })
  }, [
    filterLoadingLabel,
    filterLoadingNote,
    filterLoadingProgress,
    onLoadingStateChange,
    pagePrepareProgress
  ])

  useEffect(() => {
    return () => {
      onLoadingStateChange?.({ active: false, label: '' })
    }
  }, [onLoadingStateChange])

  useEffect(() => {
    if (!isFileBackedSpriteSource || !visibleThumbnailSpriteIdsKey) return
    void useSpriteStore.getState().ensureSpritesCached(parseSpriteIdsKey(visibleThumbnailSpriteIdsKey))
  }, [isFileBackedSpriteSource, visibleThumbnailSpriteIdsKey])

  const { localLabel: localPagePrepareLabel } = useMemo(
    () =>
      getThingListLoadingMessages(
        filterLoadingLabel,
        pagePrepareProgress,
        filterLoadingProgress,
        filterLoadingNote
      ),
    [filterLoadingLabel, filterLoadingNote, filterLoadingProgress, pagePrepareProgress]
  )

  // -------------------------------------------------------------------------
  // Selection handlers
  // -------------------------------------------------------------------------

  const handleItemClick = useCallback(
    (thing: ThingType, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Toggle in multi-selection
        const newIds = selectedThingIds.includes(thing.id)
          ? selectedThingIds.filter((id) => id !== thing.id)
          : [...selectedThingIds, thing.id]
        selectThingsAction(newIds)
      } else if (e.shiftKey && selectedThingId !== null) {
        // Range selection (within the full filtered list for cross-page ranges)
        const allIds = filteredThings.map((t) => t.id)
        const anchorIdx = allIds.indexOf(selectedThingId)
        const targetIdx = allIds.indexOf(thing.id)
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
          selectThingsAction(allIds.slice(from, to + 1))
        }
      } else {
        selectThing(thing.id)
      }
    },
    [selectedThingId, selectedThingIds, filteredThings, selectThing, selectThingsAction]
  )

  const handleItemDoubleClick = useCallback(
    (thing: ThingType) => {
      if (onEditThing) {
        onEditThing(thing.id)
      }
    },
    [onEditThing]
  )

  // -------------------------------------------------------------------------
  // Context menu
  // -------------------------------------------------------------------------

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, thing: ThingType) => {
      e.preventDefault()
      // Ensure the right-clicked item is in the selection
      if (!selectedThingIds.includes(thing.id)) {
        selectThing(thing.id)
      }
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [selectedThingIds, selectThing]
  )

  const handleContextAction = useCallback(
    (action: ThingContextAction) => {
      const editorStore = useEditorStore.getState()

      switch (action) {
        case 'edit':
          if (selectedThingId !== null && onEditThing) {
            onEditThing(selectedThingId)
          }
          break
        case 'replace':
          if (onAction) onAction('replace')
          break
        case 'export':
          if (onAction) onAction('export')
          break
        case 'duplicate':
          if (selectedThingId !== null) {
            const source = getThingById(currentCategory, selectedThingId)
            if (source) {
              const clone = cloneThingType(source)
              // Assign next available ID
              const allThings = categoryThings
              const maxId = allThings.length > 0 ? allThings[allThings.length - 1].id : 0
              clone.id = maxId + 1
              addThing(currentCategory, clone)
              selectThing(clone.id)
            }
          }
          break
        case 'remove':
          if (selectedThingIds.length > 0) {
            const appStore = useAppStore.getState()
            const idsToRemove = [...selectedThingIds].sort((a, b) => b - a)
            const useFrameGroups = clientInfo?.features?.frameGroups ?? false
            let changed = false

            for (const id of idsToRemove) {
              const currentThings = appStore.getThingsByCategory(currentCategory)
              if (currentThings.length === 0) continue

              const maxId = currentThings[currentThings.length - 1].id
              const thing = appStore.getThingById(currentCategory, id)
              if (!thing) continue

              // Keep fixed IDs: blank middle entries, shrink only at the tail.
              if (id === maxId) {
                appStore.removeThing(currentCategory, id)
              } else {
                const emptyThing = createThing(id, currentCategory, useFrameGroups, 0)
                appStore.updateThing(currentCategory, id, emptyThing)
              }
              changed = true
            }

            if (changed) {
              appStore.setProjectChanged(true)
              if (window.api?.menu) {
                window.api.menu.updateState({ clientChanged: true })
              }
            }
            selectThing(null)
          }
          break

        // ----- Clipboard: Copy -----
        case 'copy-object': {
          if (selectedThingId === null) break
          const thing = getThingById(currentCategory, selectedThingId)
          if (!thing) break
          const ci = clientInfo ?? useAppStore.getState().clientInfo
          // Build ThingData for the clipboard (uses inline empty sprites since we copy the thing reference)
          const thingData: ThingData = {
            obdVersion: 0,
            clientVersion: ci?.clientVersion ?? 0,
            thing: cloneThingType(thing),
            sprites: new Map([[FrameGroupType.DEFAULT, []]]),
            xmlAttributes: null
          }
          editorStore.copyObject(thingData, selectedThingId, currentCategory)
          // Also store properties clone for convenience (matching legacy behavior)
          editorStore.copyProperties(thing)
          break
        }
        case 'copy-properties': {
          if (selectedThingId === null) break
          const thing = getThingById(currentCategory, selectedThingId)
          if (thing) {
            editorStore.copyProperties(thing)
          }
          break
        }
        case 'copy-patterns': {
          if (selectedThingId === null) break
          const thing = getThingById(currentCategory, selectedThingId)
          if (thing) {
            editorStore.copyPatterns(thing)
          }
          break
        }

        // ----- Clipboard: Paste -----
        case 'paste-object': {
          const { clipboard } = editorStore
          if (!clipboard.object) break
          if (clipboard.sourceCategory !== currentCategory) break

          const targetIds =
            selectedThingIds.length > 0
              ? [...selectedThingIds]
              : selectedThingId !== null
                ? [selectedThingId]
                : []
          if (targetIds.length === 0) break

          const appStore = useAppStore.getState()
          for (const targetId of targetIds) {
            const existing = appStore.getThingById(currentCategory, targetId)
            if (!existing) continue

            const cloned = cloneThingData(clipboard.object)
            cloned.thing.id = targetId
            cloned.thing.category = currentCategory

            // Record undo
            editorStore.pushUndo({
              type: 'replace-thing',
              timestamp: Date.now(),
              description: `Paste object to ${currentCategory} #${targetId}`,
              before: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(existing) }
              ],
              after: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(cloned.thing) }
              ]
            })

            appStore.updateThing(currentCategory, targetId, cloned.thing)
          }

          // Handle deleteAfterPaste setting
          if (window.api?.settings) {
            window.api.settings.get('deleteAfterPaste').then((deleteAfter: boolean) => {
              if (deleteAfter) {
                useEditorStore.getState().clearClipboardObject()
              }
            })
          }

          appStore.setProjectChanged(true)
          if (window.api?.menu) {
            window.api.menu.updateState({ clientChanged: true })
          }
          break
        }
        case 'paste-properties': {
          const { clipboard } = editorStore
          if (!clipboard.properties) break

          const targetIds =
            selectedThingIds.length > 0
              ? [...selectedThingIds]
              : selectedThingId !== null
                ? [selectedThingId]
                : []
          if (targetIds.length === 0) break

          const appStore = useAppStore.getState()
          for (const targetId of targetIds) {
            const existing = appStore.getThingById(currentCategory, targetId)
            if (!existing) continue

            const updated = cloneThingType(existing)
            copyThingProperties(clipboard.properties, updated)

            editorStore.pushUndo({
              type: 'paste-properties',
              timestamp: Date.now(),
              description: `Paste properties to ${currentCategory} #${targetId}`,
              before: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(existing) }
              ],
              after: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(updated) }
              ]
            })

            appStore.updateThing(currentCategory, targetId, updated)
          }

          appStore.setProjectChanged(true)
          if (window.api?.menu) {
            window.api.menu.updateState({ clientChanged: true })
          }
          break
        }
        case 'paste-patterns': {
          const { clipboard } = editorStore
          if (!clipboard.patterns) break

          const targetIds =
            selectedThingIds.length > 0
              ? [...selectedThingIds]
              : selectedThingId !== null
                ? [selectedThingId]
                : []
          if (targetIds.length === 0) break

          const appStore = useAppStore.getState()
          for (const targetId of targetIds) {
            const existing = appStore.getThingById(currentCategory, targetId)
            if (!existing) continue

            const updated = cloneThingType(existing)
            copyThingPatterns(clipboard.patterns, updated)

            editorStore.pushUndo({
              type: 'paste-patterns',
              timestamp: Date.now(),
              description: `Paste patterns to ${currentCategory} #${targetId}`,
              before: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(existing) }
              ],
              after: [
                { id: targetId, category: currentCategory, thingType: cloneThingType(updated) }
              ]
            })

            appStore.updateThing(currentCategory, targetId, updated)
          }

          appStore.setProjectChanged(true)
          if (window.api?.menu) {
            window.api.menu.updateState({ clientChanged: true })
          }
          break
        }

        case 'copy-client-id':
          if (selectedThingId !== null) {
            navigator.clipboard.writeText(selectedThingId.toString())
          }
          break
        case 'copy-server-id':
          // Will be connected when server items are loaded
          break
        case 'bulk-edit':
          if (selectedThingIds.length > 0) {
            editorStore.startBulkEdit(selectedThingIds, currentCategory)
          }
          break
        default:
          break
      }
    },
    [
      selectedThingId,
      selectedThingIds,
      currentCategory,
      categoryThings,
      clientInfo,
      onEditThing,
      onAction,
      getThingById,
      addThing,
      selectThing
    ]
  )

  // -------------------------------------------------------------------------
  // File drag-and-drop handlers (OBD file import)
  // -------------------------------------------------------------------------

  const handleFileDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isLoaded) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    },
    [isLoaded]
  )

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (!isLoaded) return

      const fileList = e.dataTransfer?.files
      if (!fileList || fileList.length === 0) return

      // Filter for .obd files
      const obdFiles = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.obd'))

      if (obdFiles.length === 0) return

      // Sort files by numeric file name order: 1, 2, 3, 10...
      obdFiles.sort((a, b) => compareFileNamesNaturally(a.name, b.name))

      const appStore = useAppStore.getState()

      for (const file of obdFiles) {
        try {
          const buffer = await file.arrayBuffer()
          const thingData = await workerService.decodeObd(new Uint8Array(buffer).buffer)
          const imported = materializeImportedThingData({
            thingData,
            transparent: transparentEnabled,
            addSprite: (compressed) => useSpriteStore.getState().addSprite(compressed)
          })

          // Add as new thing to the matching category
          const category = imported.thing.category
          const allThings = appStore.getThingsByCategory(category)
          const maxId = allThings.length > 0 ? allThings[allThings.length - 1].id : 0
          imported.thing.id = maxId + 1

          appStore.addThing(category, imported.thing)
          appStore.setProjectChanged(true)
          appStore.setSpriteCount(useSpriteStore.getState().getSpriteCount())
          appStore.addLog('info', `Imported ${file.name} as ${category} #${imported.thing.id}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          appStore.addLog('error', `Failed to import ${file.name}: ${msg}`)
        }
      }

      if (window.api?.menu) {
        window.api.menu.updateState({ clientChanged: true })
      }
    },
    [isLoaded, transparentEnabled]
  )

  // -------------------------------------------------------------------------
  // Keyboard handler (works across page boundaries)
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isLoaded || filteredThings.length === 0) return

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      // Ctrl+C: Copy based on clipboardAction setting
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectThingsAction(filteredThings.map((thing) => thing.id))
        return
      }

      // Ctrl+C: Copy based on clipboardAction setting
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        if (selectedThingId === null || selectedThingIds.length > 1) return
        const clipAction = useEditorStore.getState().clipboardAction
        switch (clipAction) {
          case ClipboardAction.OBJECT:
            handleContextAction('copy-object')
            break
          case ClipboardAction.PATTERNS:
            handleContextAction('copy-patterns')
            break
          case ClipboardAction.PROPERTIES:
            handleContextAction('copy-properties')
            break
        }
        return
      }

      // Ctrl+V: Paste based on clipboardAction setting
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        const clipAction = useEditorStore.getState().clipboardAction
        switch (clipAction) {
          case ClipboardAction.OBJECT:
            handleContextAction('paste-object')
            break
          case ClipboardAction.PATTERNS:
            handleContextAction('paste-patterns')
            break
          case ClipboardAction.PROPERTIES:
            handleContextAction('paste-properties')
            break
        }
        return
      }

      // Delete: Remove selected thing(s)
      if (e.key === 'Delete') {
        e.preventDefault()
        handleContextAction('remove')
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const currentIdx = selectedThingId
          ? filteredThings.findIndex((t) => t.id === selectedThingId)
          : -1
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(filteredThings.length - 1, currentIdx + 1)
            : Math.max(0, currentIdx - 1)
        if (nextIdx >= 0 && nextIdx < filteredThings.length) {
          const nextThing = filteredThings[nextIdx]
          selectThing(nextThing.id)

          // Auto-navigate to the correct page if needed
          const targetPage = Math.floor(nextIdx / resolvedPageSize)
          if (targetPage !== safePage) {
            setCurrentPage(targetPage)
            resetScrollPosition()
          } else {
            // Scroll into view within current page
            const idxInPage = nextIdx - safePage * resolvedPageSize
            if (scrollRef.current) {
              let itemTop: number
              if (viewMode === 'list') {
                itemTop = idxInPage * LIST_ITEM_HEIGHT
              } else {
                itemTop = GRID_PADDING + Math.floor(idxInPage / gridMetrics.columns) * gridMetrics.rowHeight
              }
              const itemHeight = viewMode === 'list' ? LIST_ITEM_HEIGHT : gridMetrics.cardHeight
              const scrollBottom = scrollRef.current.scrollTop + containerHeight
              if (itemTop < scrollRef.current.scrollTop) {
                syncScrollPosition(itemTop)
              } else if (itemTop + itemHeight > scrollBottom) {
                syncScrollPosition(itemTop + itemHeight - containerHeight)
              }
            }
          }
        }
      }
    },
    [
      isLoaded,
      filteredThings,
      selectedThingId,
      selectedThingIds,
      selectThing,
      selectThingsAction,
      handleContextAction,
      viewMode,
      containerHeight,
      safePage,
      resolvedPageSize,
      gridMetrics.columns,
      gridMetrics.cardHeight,
      gridMetrics.rowHeight,
      resetScrollPosition,
      syncScrollPosition
    ]
  )

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  const selectedIdSet = useMemo(() => new Set(selectedThingIds), [selectedThingIds])
  const multipleSelected = selectedThingIds.length > 1
  const handleCategoryChange = useCallback(
    (category: ThingCategory) => {
      if (category === currentCategory) return
      debouncedSetFilter.cancel()
      setSearchInput('')
      setSearchFilter('')
      setCurrentPage(0)
      setCurrentCategory(category)
      resetScrollPosition()
    },
    [currentCategory, debouncedSetFilter, setCurrentCategory, resetScrollPosition]
  )
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      if (mode === viewMode) return
      setViewMode(mode)
      resetScrollPosition()
    },
    [viewMode, resetScrollPosition]
  )
  const handleEffectColorFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setEffectColorFilter(e.target.value as EffectColorFilter)
      setCurrentPage(0)
      resetScrollPosition()
    },
    [resetScrollPosition]
  )
  const handleEffectColorSortToggle = useCallback(() => {
    setEffectColorSortEnabled((enabled) => !enabled)
    setCurrentPage(0)
    resetScrollPosition()
  }, [resetScrollPosition])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={panelRef}
      className={`flex h-full flex-col bg-bg-secondary outline-none select-none ${isDragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      onKeyDown={handleKeyDown}
      onMouseDownCapture={handlePanelMouseDownCapture}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
      tabIndex={0}
      data-testid="thing-list-panel"
    >
      {/* Category tabs */}
      <div className="flex h-7 shrink-0 items-center border-b border-border-subtle">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className={`h-full flex-1 text-[10px] font-semibold transition-colors ${
              currentCategory === cat.key
                ? 'border-b-2 border-accent text-accent'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
            onClick={() => handleCategoryChange(cat.key)}
            disabled={!isLoaded}
            data-testid={`category-tab-${cat.key}`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Search + view mode toggle */}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border-subtle px-1">
        <button
          title="List view"
          className={`flex h-5 w-5 items-center justify-center rounded ${
            viewMode === 'list'
              ? 'bg-bg-tertiary text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => handleViewModeChange('list')}
          data-testid="view-mode-list"
        >
          <IconList size={12} />
        </button>
        <button
          title="Grid view"
          className={`flex h-5 w-5 items-center justify-center rounded ${
            viewMode === 'grid'
              ? 'bg-bg-tertiary text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => handleViewModeChange('grid')}
          data-testid="view-mode-grid"
        >
          <IconGrid size={12} />
        </button>
        <input
          type="text"
          className="h-5 flex-1 rounded border border-border bg-bg-input px-1.5 text-[10px] text-text-primary outline-none transition-colors focus:border-border-focus"
          placeholder="Filter by ID or name..."
          value={searchInput}
          onChange={handleSearchChange}
          disabled={!isLoaded}
          data-testid="thing-search-input"
        />
        <select
          className="h-5 w-[78px] rounded border border-border bg-bg-input px-1 text-[10px] text-text-primary outline-none transition-colors focus:border-border-focus"
          value={minGridArea}
          onChange={handleGridAreaFilterChange}
          disabled={!isLoaded}
          title="Filter by minimum grid area"
          data-testid="grid-area-filter"
        >
          {GRID_AREA_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {currentCategory === ThingCategory.EFFECT && (
          <>
            <select
              className="h-5 w-[76px] rounded border border-border bg-bg-input px-1 text-[10px] text-text-primary outline-none transition-colors focus:border-border-focus"
              value={effectColorFilter}
              onChange={handleEffectColorFilterChange}
              disabled={!isLoaded}
              title="Filter effects by dominant color"
              data-testid="effect-color-filter"
            >
              <option value="all">All</option>
              {EFFECT_COLOR_BUCKETS.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {EFFECT_COLOR_BUCKET_LABELS[bucket]}
                </option>
              ))}
            </select>
            <button
              title="Sort effects by dominant color"
              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${
                effectColorSortEnabled
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={handleEffectColorSortToggle}
              disabled={!isLoaded}
              data-testid="effect-color-sort"
            >
              <IconLookType size={12} />
            </button>
          </>
        )}
      </div>

      {/* Virtual scroll list area */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-hidden overflow-y-auto"
        onScroll={handleScroll}
        data-testid="thing-list-scroll"
      >
        {isFileBackedSpriteSource && localPagePrepareLabel && (
          <div className="pointer-events-none absolute top-2 right-2 z-10 flex w-fit items-center gap-2 rounded border border-border bg-bg-primary/95 px-2 py-1 text-[10px] text-text-secondary shadow">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <span>{localPagePrepareLabel}</span>
          </div>
        )}
        {isFileBackedSpriteSource &&
          spriteCacheLoading &&
          !filterLoadingLabel &&
          !localPagePrepareLabel && (
            <div className="pointer-events-none absolute top-2 right-2 z-10 flex w-fit items-center gap-2 rounded border border-border bg-bg-primary/95 px-2 py-1 text-[10px] text-text-secondary shadow">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span>
                Loading sprites
                {spriteCachePendingCount > 0 ? ` (${spriteCachePendingCount})` : ''}
              </span>
            </div>
          )}
        {!isLoaded ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-text-secondary">No project loaded</span>
          </div>
        ) : pageThings.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-text-secondary">
              {searchFilter ? 'No results found' : 'No objects'}
            </span>
          </div>
        ) : (
          <div style={{ height: virtualState.totalHeight, position: 'relative' }}>
            {virtualState.items.map((item) =>
              viewMode === 'list' ? (
                <div
                  key={item.thing.id}
                  className={`absolute left-0 right-0 flex h-[40px] cursor-pointer items-center gap-2 border-b border-border-subtle px-2 ${
                    selectedIdSet.has(item.thing.id)
                      ? 'bg-accent text-white'
                      : 'hover:bg-accent-subtle'
                  }`}
                  style={{ top: item.top }}
                  onClick={(e) => handleItemClick(item.thing, e)}
                  onDoubleClick={() => handleItemDoubleClick(item.thing)}
                  onContextMenu={(e) => handleContextMenu(e, item.thing)}
                  data-testid={`thing-list-item-${item.thing.id}`}
                >
                  <SpriteThumbnail
                    thing={item.thing}
                    category={currentCategory}
                    effectPreviewFrameMode={effectPreviewFrameMode}
                  />
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-xs">
                      {item.thing.id}
                      {(item.thing.marketName || item.thing.name) &&
                        ` - ${item.thing.marketName || item.thing.name}`}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  key={item.thing.id}
                  className={`absolute flex cursor-pointer flex-col items-center justify-between rounded-sm border border-border-subtle p-1 ${
                    selectedIdSet.has(item.thing.id)
                      ? 'bg-accent text-white'
                      : 'hover:bg-accent-subtle'
                  }`}
                  style={{
                    top: item.top,
                    left: item.left,
                    width: gridMetrics.cardWidth,
                    height: gridMetrics.cardHeight
                  }}
                  onClick={(e) => handleItemClick(item.thing, e)}
                  onDoubleClick={() => handleItemDoubleClick(item.thing)}
                  onContextMenu={(e) => handleContextMenu(e, item.thing)}
                  data-testid={`thing-grid-item-${item.thing.id}`}
                >
                  <SpriteThumbnail
                    thing={item.thing}
                    category={currentCategory}
                    effectPreviewFrameMode={effectPreviewFrameMode}
                    sizePx={gridMetrics.iconSize}
                  />
                  <span className="text-[8px] leading-none">{item.thing.id}</span>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Footer: pagination stepper */}
      <div className="flex shrink-0 items-center border-t border-border-subtle px-1 py-0.5">
        <PaginationStepper
          value={stepperValue}
          min={stepperMin}
          max={stepperMax}
          pageSize={resolvedPageSize}
          onChange={handleStepperChange}
          disabled={!isLoaded || filteredThings.length === 0}
        />
      </div>

      {/* Action bar */}
      <div
        className="flex shrink-0 items-center gap-0.5 border-t border-border-subtle px-1 py-0.5"
        data-testid="thing-action-bar"
      >
        <ActionButton
          icon={<IconReplace size={14} />}
          title={t('labels.replace')}
          disabled={!isLoaded || selectedThingId === null}
          onClick={() => handleContextAction('replace')}
          testId="action-replace"
        />
        <ActionButton
          icon={<IconImport size={14} />}
          title={t('labels.import')}
          disabled={!isLoaded}
          onClick={() => {
            if (onAction) onAction('import')
          }}
          testId="action-import"
        />
        <ActionButton
          icon={<IconExport size={14} />}
          title={t('labels.export')}
          disabled={!isLoaded || selectedThingId === null}
          onClick={() => handleContextAction('export')}
          testId="action-export"
        />
        <ActionButton
          icon={<IconEdit size={14} />}
          title={t('labels.edit')}
          disabled={!isLoaded || selectedThingId === null || multipleSelected}
          onClick={() => {
            if (selectedThingId !== null && onEditThing) {
              onEditThing(selectedThingId)
            }
          }}
          testId="action-edit"
        />
        <ActionButton
          icon={<IconDuplicate size={14} />}
          title={t('labels.duplicate')}
          disabled={!isLoaded || selectedThingId === null}
          onClick={() => handleContextAction('duplicate')}
          testId="action-duplicate"
        />
        <ActionButton
          icon={<IconAdd size={14} />}
          title="New"
          disabled={!isLoaded}
          onClick={() => {
            if (!clientInfo) return
            const allThings = categoryThings
            const maxId = allThings.length > 0 ? allThings[allThings.length - 1].id : 0
            const newThing = createThing(
              maxId + 1,
              currentCategory,
              clientInfo.features.frameGroups,
              0
            )
            addThing(currentCategory, newThing)
            selectThing(newThing.id)
          }}
          testId="action-new"
        />
        <ActionButton
          icon={<IconDelete size={14} />}
          title={t('labels.remove')}
          disabled={!isLoaded || selectedThingId === null}
          onClick={() => handleContextAction('remove')}
          testId="action-remove"
        />
        <div className="flex-1" />
        <ActionButton
          icon={<IconSearch size={14} />}
          title={t('labels.find')}
          disabled={!isLoaded}
          onClick={() => {
            if (onAction) onAction('find')
          }}
          testId="action-find"
        />
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <ThingContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          multipleSelected={multipleSelected}
          selectedId={selectedThingId}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
