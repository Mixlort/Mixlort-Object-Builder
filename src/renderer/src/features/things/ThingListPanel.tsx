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
import { workerService } from '../../workers/worker-service'
import { compareFileNamesNaturally } from '../../utils'
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
  createThingType,
  createThing,
  cloneThingType,
  cloneThingData,
  createFrameGroup,
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
  IconDelete
} from '../../components/Icons'
import { useTranslation } from 'react-i18next'
import { PaginationStepper } from '../../components/PaginationStepper'
import { ThingContextMenu, type ThingContextAction } from './ThingContextMenu'
import { useSpriteThumbnail } from '../../hooks/use-sprite-thumbnail'
import { debounce } from '../../utils/debounce'

// ---------------------------------------------------------------------------
// Constants (mirroring legacy renderer sizes)
// ---------------------------------------------------------------------------

const LIST_ITEM_HEIGHT = 40
const GRID_CELL_WIDTH = 64
const GRID_CELL_HEIGHT = 71
const OVERSCAN = 5

/** Default page size matching legacy objectsListAmount setting */
const DEFAULT_PAGE_SIZE = 100

type ViewMode = 'list' | 'grid'

const CATEGORIES = [
  { key: ThingCategory.ITEM, labelKey: 'labels.items' },
  { key: ThingCategory.OUTFIT, labelKey: 'labels.outfits' },
  { key: ThingCategory.EFFECT, labelKey: 'labels.effects' },
  { key: ThingCategory.MISSILE, labelKey: 'labels.missiles' }
] as const

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
  category
}: {
  thing: ThingType
  category: ThingCategory
}): React.JSX.Element {
  const dataUrl = useSpriteThumbnail(thing, category)
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        className="h-8 w-8 shrink-0 rounded-sm object-contain"
        style={{ imageRendering: 'pixelated' }}
        alt=""
      />
    )
  }
  return (
    <div className="h-8 w-8 shrink-0 rounded-sm bg-bg-tertiary">
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
}

export function ThingListPanel({
  onEditThing,
  onAction,
  pageSize = DEFAULT_PAGE_SIZE
}: ThingListPanelProps = {}): React.JSX.Element {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchInput, setSearchInput] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Debounced search filter (150ms delay for filtering, immediate input update)
  const debouncedSetFilter = useMemo(
    () => debounce((value: string) => setSearchFilter(value), 150),
    []
  )

  useEffect(() => {
    return () => debouncedSetFilter.cancel()
  }, [debouncedSetFilter])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchInput(value)
      debouncedSetFilter(value)
    },
    [debouncedSetFilter]
  )

  // Scroll container state
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

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
  const resolvedPageSize = Math.max(1, pageSize)

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

  const filteredThings = useMemo((): ThingType[] => {
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

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(filteredThings.length / resolvedPageSize))

  // Clamp current page to valid range when filtered list changes
  const safePage = Math.min(currentPage, totalPages - 1)
  if (safePage !== currentPage) {
    // Schedule state update to avoid render-during-render
    Promise.resolve().then(() => setCurrentPage(safePage))
  }

  const pageStart = safePage * resolvedPageSize
  const pageEnd = Math.min(pageStart + resolvedPageSize, filteredThings.length)
  const pageThings = useMemo(
    () => filteredThings.slice(pageStart, pageEnd),
    [filteredThings, pageStart, pageEnd]
  )

  // Reset page when category or filter changes (render-time state adjustment)
  const [prevCategoryForPage, setPrevCategoryForPage] = useState(currentCategory)
  const [prevSearchFilter, setPrevSearchFilter] = useState(searchFilter)
  if (currentCategory !== prevCategoryForPage || searchFilter !== prevSearchFilter) {
    setPrevCategoryForPage(currentCategory)
    setPrevSearchFilter(searchFilter)
    setCurrentPage(0)
    setScrollTop(0)
  }

  // Reset search input when category changes (render-time state adjustment)
  const [prevCategoryForSearch, setPrevCategoryForSearch] = useState(currentCategory)
  if (currentCategory !== prevCategoryForSearch) {
    setPrevCategoryForSearch(currentCategory)
    setSearchInput('')
    setSearchFilter('')
    debouncedSetFilter.cancel()
  }

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
          const cols = Math.max(1, Math.floor(containerWidth / GRID_CELL_WIDTH))
          targetTop = Math.floor(idxInPage / cols) * GRID_CELL_HEIGHT
        }
        scrollRef.current.scrollTop = Math.max(0, targetTop - containerHeight / 2)
      }
    },
    [filteredThings, selectThing, viewMode, containerWidth, containerHeight, resolvedPageSize]
  )

  // -------------------------------------------------------------------------
  // Scroll / resize tracking
  // -------------------------------------------------------------------------

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop)
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Reset scroll when page changes (render-time state adjustment + DOM sync)
  const [prevPage, setPrevPage] = useState(currentPage)
  if (currentPage !== prevPage) {
    setPrevPage(currentPage)
    setScrollTop(0)
  }
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [currentPage])

  // -------------------------------------------------------------------------
  // Virtual scroll computation (operates on pageThings)
  // -------------------------------------------------------------------------

  const virtualState = useMemo((): { totalHeight: number; items: VirtualItem[] } => {
    const count = pageThings.length
    if (count === 0) return { totalHeight: 0, items: [] }

    if (viewMode === 'list') {
      const totalHeight = count * LIST_ITEM_HEIGHT
      const startIdx = Math.max(0, Math.floor(scrollTop / LIST_ITEM_HEIGHT) - OVERSCAN)
      const endIdx = Math.min(
        count - 1,
        Math.ceil((scrollTop + containerHeight) / LIST_ITEM_HEIGHT) + OVERSCAN
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
    const cols = Math.max(1, Math.floor(containerWidth / GRID_CELL_WIDTH))
    const totalRows = Math.ceil(count / cols)
    const totalHeight = totalRows * GRID_CELL_HEIGHT
    const startRow = Math.max(0, Math.floor(scrollTop / GRID_CELL_HEIGHT) - OVERSCAN)
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + containerHeight) / GRID_CELL_HEIGHT) + OVERSCAN
    )

    const items: VirtualItem[] = []
    for (let row = startRow; row <= endRow; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        if (idx < count) {
          items.push({
            thing: pageThings[idx],
            index: idx,
            top: row * GRID_CELL_HEIGHT,
            left: col * GRID_CELL_WIDTH
          })
        }
      }
    }
    return { totalHeight, items }
  }, [viewMode, pageThings, scrollTop, containerHeight, containerWidth])

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

          // Add as new thing to the matching category
          const category = thingData.thing.category
          const allThings = appStore.getThingsByCategory(category)
          const maxId = allThings.length > 0 ? allThings[allThings.length - 1].id : 0
          thingData.thing.id = maxId + 1

          appStore.addThing(category, thingData.thing)
          appStore.setProjectChanged(true)
          appStore.addLog('info', `Imported ${file.name} as ${category} #${thingData.thing.id}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          appStore.addLog('error', `Failed to import ${file.name}: ${msg}`)
        }
      }

      if (window.api?.menu) {
        window.api.menu.updateState({ clientChanged: true })
      }
    },
    [isLoaded]
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
          } else {
            // Scroll into view within current page
            const idxInPage = nextIdx - safePage * resolvedPageSize
            if (scrollRef.current) {
              let itemTop: number
              if (viewMode === 'list') {
                itemTop = idxInPage * LIST_ITEM_HEIGHT
              } else {
                const cols = Math.max(1, Math.floor(containerWidth / GRID_CELL_WIDTH))
                itemTop = Math.floor(idxInPage / cols) * GRID_CELL_HEIGHT
              }
              const scrollBottom = scrollRef.current.scrollTop + containerHeight
              if (itemTop < scrollRef.current.scrollTop) {
                scrollRef.current.scrollTop = itemTop
              } else if (itemTop + LIST_ITEM_HEIGHT > scrollBottom) {
                scrollRef.current.scrollTop = itemTop + LIST_ITEM_HEIGHT - containerHeight
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
      handleContextAction,
      viewMode,
      containerWidth,
      containerHeight,
      safePage,
      resolvedPageSize
    ]
  )

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  const selectedIdSet = useMemo(() => new Set(selectedThingIds), [selectedThingIds])
  const multipleSelected = selectedThingIds.length > 1

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={`flex h-full flex-col bg-bg-secondary ${isDragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      onKeyDown={handleKeyDown}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
      tabIndex={-1}
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
            onClick={() => setCurrentCategory(cat.key)}
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
          onClick={() => setViewMode('list')}
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
          onClick={() => setViewMode('grid')}
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
      </div>

      {/* Virtual scroll list area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto"
        onScroll={handleScroll}
        data-testid="thing-list-scroll"
      >
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
                  <SpriteThumbnail thing={item.thing} category={currentCategory} />
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
                  className={`absolute flex h-[71px] w-[64px] cursor-pointer flex-col items-center justify-center border border-border-subtle ${
                    selectedIdSet.has(item.thing.id)
                      ? 'bg-accent text-white'
                      : 'hover:bg-accent-subtle'
                  }`}
                  style={{ top: item.top, left: item.left }}
                  onClick={(e) => handleItemClick(item.thing, e)}
                  onDoubleClick={() => handleItemDoubleClick(item.thing)}
                  onContextMenu={(e) => handleContextMenu(e, item.thing)}
                  data-testid={`thing-grid-item-${item.thing.id}`}
                >
                  <SpriteThumbnail thing={item.thing} category={currentCategory} />
                  <span className="mt-1 text-[9px]">{item.thing.id}</span>
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
            const newThing = createThingType()
            const allThings = categoryThings
            const maxId = allThings.length > 0 ? allThings[allThings.length - 1].id : 0
            newThing.id = maxId + 1
            const fg = createFrameGroup()
            newThing.frameGroups = [fg]
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
