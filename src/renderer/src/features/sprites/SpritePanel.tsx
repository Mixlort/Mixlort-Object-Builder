/**
 * Sprite panel - right panel of the application.
 * Shows the sprites of the currently editing thing's frame group
 * in a grid layout with checkerboard transparency backgrounds.
 *
 * Features:
 * - Grid of sprite thumbnails (32x32 on checkerboard)
 * - Frame group type selector (for outfits with idle/walking groups)
 * - Selection support (click to select/deselect)
 * - Enlarged preview of selected/hovered sprite
 * - Action buttons (Import, Export, Replace, Remove)
 * - Drag-and-drop zone for sprite import
 * - Pagination stepper when sprite count exceeds page size
 *
 * Ported from legacy AS3:
 * - otlib/components/SpriteList.as (list layout, selection)
 * - otlib/components/renders/SpriteListRenderer.as (item renderer)
 * - otlib/components/AmountNumericStepper.as (pagination)
 * - ObjectBuilder.mxml (sprite panel integration, action buttons)
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useEditorStore, selectEditingThingData } from '../../stores'
import { useSpriteStore } from '../../stores'
import { useAppStore } from '../../stores'
import { FrameGroupType } from '../../types/animation'
import { SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_DATA_SIZE } from '../../types/sprites'
import { ThingCategory } from '../../types/things'
import { uncompressPixels, argbToRgba, rgbaToArgb, compressPixels } from '../../services/spr'
import { createSpriteData } from '../../types/sprites'
import { cloneThingType } from '../../types/things'
import { PaginationStepper } from '../../components/PaginationStepper'
import { IconClose } from '../../components/Icons'
import { useTranslation } from 'react-i18next'
import { compareFileNamesNaturally } from '../../utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 48
const PREVIEW_SIZE = 96

/** Default page size matching legacy spritesListAmount setting */
const DEFAULT_SPRITE_PAGE_SIZE = 100

/**
 * Module-level sprite clipboard for copy/paste within the sprite grid.
 * Stores compressed pixel data of the copied sprite.
 * Ported from legacy SpriteList.as internal clipboard.
 */
let _spriteClipboard: { spriteId: number; pixels: Uint8Array | null } | null = null

// ---------------------------------------------------------------------------
// Canvas rendering helpers
// ---------------------------------------------------------------------------

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tileSize: number = 4
): void {
  ctx.fillStyle = '#636363'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#555555'
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      if ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0) {
        ctx.fillRect(x, y, tileSize, tileSize)
      }
    }
  }
}

function renderSpriteToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array | null,
  displaySize: number
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = displaySize
  canvas.height = displaySize

  const tileSize = displaySize > 64 ? 8 : 4
  drawCheckerboard(ctx, displaySize, displaySize, tileSize)

  if (!pixels || pixels.length < SPRITE_DEFAULT_DATA_SIZE) return

  const rgba = argbToRgba(pixels)
  const imageData = new ImageData(
    rgba as Uint8ClampedArray<ArrayBuffer>,
    SPRITE_DEFAULT_SIZE,
    SPRITE_DEFAULT_SIZE
  )

  if (displaySize !== SPRITE_DEFAULT_SIZE) {
    const offscreen = document.createElement('canvas')
    offscreen.width = SPRITE_DEFAULT_SIZE
    offscreen.height = SPRITE_DEFAULT_SIZE
    const offCtx = offscreen.getContext('2d')
    if (offCtx) {
      offCtx.putImageData(imageData, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offscreen, 0, 0, displaySize, displaySize)
    }
    // Release offscreen canvas pixel buffer
    offscreen.width = 0
    offscreen.height = 0
  } else {
    ctx.putImageData(imageData, 0, 0)
  }
}

async function encodeSpritePng(pixels: Uint8Array): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_DEFAULT_SIZE
  canvas.height = SPRITE_DEFAULT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  ctx.putImageData(
    new ImageData(
      argbToRgba(pixels) as Uint8ClampedArray<ArrayBuffer>,
      SPRITE_DEFAULT_SIZE,
      SPRITE_DEFAULT_SIZE
    ),
    0,
    0
  )

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  canvas.width = 0
  canvas.height = 0
  if (!blob) {
    throw new Error('Failed to encode sprite PNG')
  }
  return blob.arrayBuffer()
}

function joinFilePath(directory: string, fileName: string): string {
  return `${directory.replace(/[\\/]+$/u, '')}/${fileName}`
}

// ---------------------------------------------------------------------------
// Sprite slot data (precomputed)
// ---------------------------------------------------------------------------

interface SpriteSlot {
  index: number
  spriteId: number
  pixels: Uint8Array | null
}

// ---------------------------------------------------------------------------
// SpriteCell
// ---------------------------------------------------------------------------

interface SpriteCellProps {
  slot: SpriteSlot
  selected: boolean
  dragOverTarget: boolean
  onSelect: (index: number, event: React.MouseEvent<HTMLDivElement>) => void
  onHover: (index: number | null) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
}

function SpriteCell({
  slot,
  selected,
  dragOverTarget,
  onSelect,
  onHover,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: SpriteCellProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      renderSpriteToCanvas(canvasRef.current, slot.pixels, SPRITE_DEFAULT_SIZE)
    }
  }, [slot.pixels])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-sprite-index', slot.index.toString())
      onDragStart(slot.index)
    },
    [slot.index, onDragStart]
  )

  return (
    <div
      className={`flex flex-col items-center justify-center cursor-pointer p-1 rounded-sm transition-colors ${
        dragOverTarget
          ? 'bg-accent/40 ring-1 ring-accent'
          : selected
            ? 'bg-accent/80 ring-1 ring-accent'
            : 'hover:bg-bg-tertiary'
      }`}
      style={{ width: CELL_SIZE, height: CELL_SIZE + 14 }}
      draggable
      onClick={(event) => onSelect(slot.index, event)}
      onMouseEnter={() => onHover(slot.index)}
      onMouseLeave={() => onHover(null)}
      onDragStart={handleDragStart}
      onDragOver={(e) => onDragOver(e, slot.index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, slot.index)}
      onDragEnd={onDragEnd}
      data-testid={`sprite-cell-${slot.index}`}
    >
      <canvas
        ref={canvasRef}
        width={SPRITE_DEFAULT_SIZE}
        height={SPRITE_DEFAULT_SIZE}
        className="rounded-sm"
        style={{ imageRendering: 'pixelated' }}
      />
      <span className="mt-0.5 text-[8px] text-text-secondary truncate w-full text-center">
        {slot.spriteId > 0 ? `#${slot.spriteId}` : 'empty'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SpritePreview
// ---------------------------------------------------------------------------

interface SpritePreviewProps {
  spriteId: number
  pixels: Uint8Array | null
}

function SpritePreview({ spriteId, pixels }: SpritePreviewProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      renderSpriteToCanvas(canvasRef.current, pixels, PREVIEW_SIZE)
    }
  }, [pixels])

  return (
    <div
      className="flex flex-col items-center gap-1 p-2 border-t border-border"
      data-testid="sprite-preview"
    >
      <canvas
        ref={canvasRef}
        width={PREVIEW_SIZE}
        height={PREVIEW_SIZE}
        className="rounded"
        style={{ imageRendering: 'pixelated' }}
      />
      <span className="text-[9px] text-text-secondary">
        Sprite {spriteId > 0 ? `#${spriteId}` : '(empty)'}
      </span>
    </div>
  )
}

async function loadArgbPixelsFromPath(filePath: string): Promise<Uint8Array> {
  if (!window.api?.file) {
    throw new Error('File API unavailable')
  }

  const buffer = await window.api.file.readBinary(filePath)
  const blob = new Blob([buffer])
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${filePath}`))
      img.src = objectUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = SPRITE_DEFAULT_SIZE
    canvas.height = SPRITE_DEFAULT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable')
    }

    ctx.clearRect(0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, 0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE)

    return rgbaToArgb(ctx.getImageData(0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE).data)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// ---------------------------------------------------------------------------
// SpritePanel
// ---------------------------------------------------------------------------

interface SpritePanelProps {
  pageSize?: number
}

export function SpritePanel({
  pageSize = DEFAULT_SPRITE_PAGE_SIZE
}: SpritePanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const togglePanel = useAppStore((s) => s.togglePanel)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
  const [frameGroupType, setFrameGroupType] = useState<FrameGroupType>(FrameGroupType.DEFAULT)
  const [isDragOver, setIsDragOver] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Store data
  const editingThingData = useEditorStore(selectEditingThingData)
  const clientInfo = useAppStore((s) => s.clientInfo)

  // Track sprite accessor/overrides changes to re-derive sprite slots
  const spriteAccessor = useSpriteStore((s) => s.spriteAccessor)
  const spriteOverrides = useSpriteStore((s) => s.sprites)
  const spriteCacheRevision = useSpriteStore((s) => s.spriteCacheRevision)
  const resolvedPageSize = Math.max(1, pageSize)

  // Derived data
  const thing = editingThingData?.thing
  const frameGroup = thing?.frameGroups[frameGroupType]
  const emptyArray: number[] = useMemo(() => [], [])
  const spriteIndex = frameGroup?.spriteIndex ?? emptyArray
  const inlineSprites = editingThingData?.sprites.get(frameGroupType) ?? []
  const isOutfit = thing?.category === ThingCategory.OUTFIT
  const hasWalkingGroup = thing?.frameGroups[FrameGroupType.WALKING] != null
  const transparent = clientInfo?.features?.transparency ?? false
  const spriteIdsKey = useMemo(() => {
    if (!spriteIndex.length) return ''
    const ids = new Set<number>()
    for (const spriteId of spriteIndex) {
      if (spriteId > 0) ids.add(spriteId)
    }
    return Array.from(ids)
      .sort((a, b) => a - b)
      .join(',')
  }, [spriteIndex])

  useEffect(() => {
    if (!spriteIdsKey) return
    const ids = spriteIdsKey
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
    void useSpriteStore.getState().ensureSpritesCached(ids)
  }, [spriteIdsKey])

  // Precompute sprite slot data
  const spriteSlots = useMemo((): SpriteSlot[] => {
    if (!frameGroup || spriteIndex.length === 0) return []

    return spriteIndex.map((spriteId, idx) => {
      // Try inline sprites first (uncompressed ARGB from OBD load)
      const inlineData = inlineSprites[idx]
      if (inlineData?.pixels && inlineData.pixels.length >= SPRITE_DEFAULT_DATA_SIZE) {
        return { index: idx, spriteId, pixels: inlineData.pixels }
      }

      // Try sprite store (accessor-aware: checks overrides first, then SpriteAccessor)
      if (spriteId > 0) {
        const compressed = useSpriteStore.getState().getSprite(spriteId)
        if (compressed && compressed.length > 0) {
          try {
            const pixels = uncompressPixels(compressed, transparent)
            return { index: idx, spriteId, pixels }
          } catch {
            // Decompression failed, show empty
          }
        }
      }

      return { index: idx, spriteId, pixels: null }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    frameGroup,
    spriteIndex,
    inlineSprites,
    spriteAccessor,
    spriteOverrides,
    spriteCacheRevision,
    transparent
  ])

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  const needsPagination = spriteSlots.length > resolvedPageSize
  const totalPages = Math.max(1, Math.ceil(spriteSlots.length / resolvedPageSize))

  // Clamp current page
  const safePage = Math.min(currentPage, totalPages - 1)
  if (safePage !== currentPage) {
    Promise.resolve().then(() => setCurrentPage(safePage))
  }

  const pageSlots = useMemo(() => {
    if (!needsPagination) return spriteSlots
    const start = safePage * resolvedPageSize
    const end = Math.min(start + resolvedPageSize, spriteSlots.length)
    return spriteSlots.slice(start, end)
  }, [spriteSlots, needsPagination, safePage, resolvedPageSize])

  // Stepper value: first slot index on the current page
  const spriteStepperValue = needsPagination ? safePage * resolvedPageSize : 0
  const spriteStepperMax = Math.max(0, spriteSlots.length - 1)

  const selectedSpriteTargets = useMemo(() => {
    const seen = new Set<number>()
    const targets: Array<{ slotIndex: number; spriteId: number }> = []

    for (const slotIndex of [...selectedSlots].sort((a, b) => a - b)) {
      const slot = spriteSlots[slotIndex]
      if (!slot || slot.spriteId <= 0 || seen.has(slot.spriteId)) {
        continue
      }

      seen.add(slot.spriteId)
      targets.push({ slotIndex, spriteId: slot.spriteId })
    }

    return targets
  }, [selectedSlots, spriteSlots])

  const hasInvalidReplaceSelection = useMemo(
    () =>
      selectedSlots.some((slotIndex) => {
        const slot = spriteSlots[slotIndex]
        return slot != null && slot.spriteId <= 0
      }),
    [selectedSlots, spriteSlots]
  )

  const handleSpriteStepperChange = useCallback(
    (targetIndex: number) => {
      if (spriteSlots.length === 0) return
      const clamped = Math.max(0, Math.min(spriteSlots.length - 1, targetIndex))
      const page = Math.floor(clamped / resolvedPageSize)
      setCurrentPage(page)
    },
    [spriteSlots.length, resolvedPageSize]
  )

  // Preview data
  const previewSlotIdx = hoveredSlot ?? selectedSlot
  const previewSlot = previewSlotIdx !== null ? spriteSlots[previewSlotIdx] : null

  // Reset selection when editing thing changes
  useEffect(() => {
    setSelectedSlot(null)
    setSelectedSlots([])
    setHoveredSlot(null)
    setFrameGroupType(FrameGroupType.DEFAULT)
    setCurrentPage(0)
    useSpriteStore.getState().clearSpriteSelection()
  }, [editingThingData])

  // Reset page when frame group changes
  useEffect(() => {
    setCurrentPage(0)
  }, [frameGroupType])

  const handleSelectSprite = useCallback(
    (index: number, event: React.MouseEvent<HTMLDivElement>) => {
      let nextSelectedSlots: number[] = []
      let nextPrimarySlot: number | null = index

      if (event.shiftKey && selectedSlot !== null) {
        const start = Math.min(selectedSlot, index)
        const end = Math.max(selectedSlot, index)
        nextSelectedSlots = Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
      } else if (event.metaKey || event.ctrlKey) {
        const alreadySelected = selectedSlots.includes(index)
        if (alreadySelected) {
          nextSelectedSlots = selectedSlots.filter((slot) => slot !== index)
          nextPrimarySlot =
            selectedSlot === index
              ? (nextSelectedSlots[nextSelectedSlots.length - 1] ?? null)
              : selectedSlot
        } else {
          nextSelectedSlots = [...selectedSlots, index].sort((a, b) => a - b)
        }
      } else if (selectedSlots.length === 1 && selectedSlots[0] === index) {
        nextSelectedSlots = []
        nextPrimarySlot = null
      } else {
        nextSelectedSlots = [index]
      }

      setSelectedSlots(nextSelectedSlots)
      setSelectedSlot(nextPrimarySlot)

      const nextSpriteIds = nextSelectedSlots
        .map((slotIndex) => spriteSlots[slotIndex]?.spriteId ?? 0)
        .filter((spriteId, slotIndex, array) => spriteId > 0 && array.indexOf(spriteId) === slotIndex)

      if (nextSpriteIds.length > 0) {
        useSpriteStore.getState().selectSprites(nextSpriteIds)
      } else {
        useSpriteStore.getState().clearSpriteSelection()
      }
    },
    [selectedSlot, selectedSlots, spriteSlots]
  )

  const handleHover = useCallback((index: number | null) => {
    setHoveredSlot(index)
  }, [])

  const handleFrameGroupChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFrameGroupType(Number(e.target.value) as FrameGroupType)
    setSelectedSlot(null)
    setSelectedSlots([])
    useSpriteStore.getState().clearSpriteSelection()
  }, [])

  // Internal sprite drag-and-drop (reorder within grid)
  const handleSpriteDragStart = useCallback((index: number) => {
    setDragSourceIndex(index)
  }, [])

  const handleSpriteDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.stopPropagation()
      if (dragSourceIndex !== null && dragSourceIndex !== index) {
        e.dataTransfer.dropEffect = 'move'
        setDragOverIndex(index)
      }
    },
    [dragSourceIndex]
  )

  const handleSpriteDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleSpriteDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverIndex(null)
      setDragSourceIndex(null)

      const sourceIndexStr = e.dataTransfer.getData('text/x-sprite-index')
      if (!sourceIndexStr || !editingThingData) return

      const sourceIndex = parseInt(sourceIndexStr, 10)
      if (isNaN(sourceIndex) || sourceIndex === targetIndex) return
      if (!frameGroup) return

      // Swap sprite IDs in the spriteIndex
      const updatedThing = cloneThingType(editingThingData.thing)
      const fg = updatedThing.frameGroups[frameGroupType]
      if (!fg || sourceIndex >= fg.spriteIndex.length || targetIndex >= fg.spriteIndex.length)
        return

      const newSpriteIndex = [...fg.spriteIndex]
      const temp = newSpriteIndex[sourceIndex]
      newSpriteIndex[sourceIndex] = newSpriteIndex[targetIndex]
      newSpriteIndex[targetIndex] = temp
      fg.spriteIndex = newSpriteIndex

      // Also swap inline sprites if present
      const currentSprites = editingThingData.sprites.get(frameGroupType) ?? []
      const newSprites = [...currentSprites]
      if (sourceIndex < newSprites.length && targetIndex < newSprites.length) {
        const tempSprite = newSprites[sourceIndex]
        newSprites[sourceIndex] = newSprites[targetIndex]
        newSprites[targetIndex] = tempSprite
      }

      const newSpritesMap = new Map(editingThingData.sprites)
      newSpritesMap.set(frameGroupType, newSprites)

      // Register undo
      const editorStore = useEditorStore.getState()
      editorStore.pushUndo({
        type: 'update-thing',
        timestamp: Date.now(),
        description: `Swap sprites #${sourceIndex} and #${targetIndex}`,
        before: [
          {
            id: editingThingData.thing.id,
            category: editingThingData.thing.category,
            thingType: cloneThingType(editingThingData.thing)
          }
        ],
        after: [
          {
            id: editingThingData.thing.id,
            category: editingThingData.thing.category,
            thingType: cloneThingType(updatedThing)
          }
        ]
      })

      editorStore.setEditingThingData({
        ...editingThingData,
        thing: updatedThing,
        sprites: newSpritesMap
      })
      editorStore.setEditingChanged(true)

      const appStore = useAppStore.getState()
      appStore.updateThing(editingThingData.thing.category, editingThingData.thing.id, updatedThing)
      appStore.setProjectChanged(true)

      if (window.api?.menu) {
        window.api.menu.updateState({ clientChanged: true })
      }
    },
    [editingThingData, frameGroup, frameGroupType]
  )

  const handleSpriteDragEnd = useCallback(() => {
    setDragSourceIndex(null)
    setDragOverIndex(null)
  }, [])

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (ported from legacy SpriteList.as)
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingThingData || !frameGroup || spriteIndex.length === 0) return

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

      const isMod = e.ctrlKey || e.metaKey

      // Ctrl+C: Copy selected sprite
      if (isMod && e.key === 'c') {
        if (selectedSlot === null) return
        e.preventDefault()
        const slot = spriteSlots[selectedSlot]
        if (!slot) return
        // Store compressed pixels from sprite store (or null for empty sprite)
        const compressed =
          slot.spriteId > 0 ? (useSpriteStore.getState().getSprite(slot.spriteId) ?? null) : null
        _spriteClipboard = {
          spriteId: slot.spriteId,
          pixels: compressed ? new Uint8Array(compressed) : null
        }
        return
      }

      // Ctrl+V: Paste sprite into selected slot
      if (isMod && e.key === 'v') {
        if (selectedSlot === null || !_spriteClipboard) return
        e.preventDefault()

        const clipPixels = _spriteClipboard.pixels
        // Add sprite to the sprite store and get new ID
        let newSpriteId = 0
        if (clipPixels && clipPixels.length > 0) {
          newSpriteId = useSpriteStore.getState().addSprite(clipPixels)
        }

        // Update thing's spriteIndex for this slot
        const updatedThing = cloneThingType(editingThingData.thing)
        const fg = updatedThing.frameGroups[frameGroupType]
        if (!fg || selectedSlot >= fg.spriteIndex.length) return

        const editorStore = useEditorStore.getState()
        const beforeThing = cloneThingType(editingThingData.thing)

        fg.spriteIndex = [...fg.spriteIndex]
        fg.spriteIndex[selectedSlot] = newSpriteId

        // Update inline sprites
        const currentSprites = editingThingData.sprites.get(frameGroupType) ?? []
        const newSprites = [...currentSprites]
        while (newSprites.length <= selectedSlot) {
          newSprites.push(createSpriteData(0))
        }
        if (clipPixels && clipPixels.length > 0) {
          const decompressed = uncompressPixels(clipPixels, transparent)
          newSprites[selectedSlot] = { id: newSpriteId, pixels: decompressed }
        } else {
          newSprites[selectedSlot] = createSpriteData(0)
        }

        const newSpritesMap = new Map(editingThingData.sprites)
        newSpritesMap.set(frameGroupType, newSprites)

        // Register undo
        editorStore.pushUndo({
          type: 'update-thing',
          timestamp: Date.now(),
          description: `Paste sprite into slot #${selectedSlot}`,
          before: [{ id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }],
          after: [
            {
              id: updatedThing.id,
              category: updatedThing.category,
              thingType: cloneThingType(updatedThing)
            }
          ]
        })

        editorStore.setEditingThingData({
          ...editingThingData,
          thing: updatedThing,
          sprites: newSpritesMap
        })
        editorStore.setEditingChanged(true)

        const appStore = useAppStore.getState()
        appStore.updateThing(
          editingThingData.thing.category,
          editingThingData.thing.id,
          updatedThing
        )
        appStore.setProjectChanged(true)
        if (window.api?.menu) {
          window.api.menu.updateState({ clientChanged: true })
        }
        return
      }

      // Delete: Remove selected sprite (set to empty)
      if (e.key === 'Delete') {
        if (selectedSlot === null) return
        e.preventDefault()

        const updatedThing = cloneThingType(editingThingData.thing)
        const fg = updatedThing.frameGroups[frameGroupType]
        if (!fg || selectedSlot >= fg.spriteIndex.length) return

        const editorStore = useEditorStore.getState()
        const beforeThing = cloneThingType(editingThingData.thing)

        fg.spriteIndex = [...fg.spriteIndex]
        fg.spriteIndex[selectedSlot] = 0

        // Clear inline sprite
        const currentSprites = editingThingData.sprites.get(frameGroupType) ?? []
        const newSprites = [...currentSprites]
        if (selectedSlot < newSprites.length) {
          newSprites[selectedSlot] = createSpriteData(0)
        }

        const newSpritesMap = new Map(editingThingData.sprites)
        newSpritesMap.set(frameGroupType, newSprites)

        // Register undo
        editorStore.pushUndo({
          type: 'update-thing',
          timestamp: Date.now(),
          description: `Remove sprite from slot #${selectedSlot}`,
          before: [{ id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }],
          after: [
            {
              id: updatedThing.id,
              category: updatedThing.category,
              thingType: cloneThingType(updatedThing)
            }
          ]
        })

        editorStore.setEditingThingData({
          ...editingThingData,
          thing: updatedThing,
          sprites: newSpritesMap
        })
        editorStore.setEditingChanged(true)

        const appStore = useAppStore.getState()
        appStore.updateThing(
          editingThingData.thing.category,
          editingThingData.thing.id,
          updatedThing
        )
        appStore.setProjectChanged(true)
        if (window.api?.menu) {
          window.api.menu.updateState({ clientChanged: true })
        }
        return
      }

      // Insert: Fill sprite with blank (trigger import-like behavior)
      if (e.key === 'Insert') {
        if (selectedSlot === null) return
        e.preventDefault()

        const updatedThing = cloneThingType(editingThingData.thing)
        const fg = updatedThing.frameGroups[frameGroupType]
        if (!fg || selectedSlot >= fg.spriteIndex.length) return

        // Allocate a new empty sprite in the sprite store
        const newSpriteId = useSpriteStore.getState().addSprite(null)

        const editorStore = useEditorStore.getState()
        const beforeThing = cloneThingType(editingThingData.thing)

        fg.spriteIndex = [...fg.spriteIndex]
        fg.spriteIndex[selectedSlot] = newSpriteId

        // Register undo
        editorStore.pushUndo({
          type: 'update-thing',
          timestamp: Date.now(),
          description: `Fill sprite slot #${selectedSlot}`,
          before: [{ id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }],
          after: [
            {
              id: updatedThing.id,
              category: updatedThing.category,
              thingType: cloneThingType(updatedThing)
            }
          ]
        })

        editorStore.setEditingThingData({ ...editingThingData, thing: updatedThing })
        editorStore.setEditingChanged(true)

        const appStore = useAppStore.getState()
        appStore.updateThing(
          editingThingData.thing.category,
          editingThingData.thing.id,
          updatedThing
        )
        appStore.setProjectChanged(true)
        appStore.setSpriteCount(Math.max(appStore.spriteCount ?? 0, newSpriteId))
        if (window.api?.menu) {
          window.api.menu.updateState({ clientChanged: true })
        }
        return
      }
    },
    [
      editingThingData,
      frameGroup,
      frameGroupType,
      spriteIndex,
      selectedSlot,
      spriteSlots,
      transparent
    ]
  )

  // File drag-and-drop handlers (external files)
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // Don't show file-drop indicator during internal sprite drag
      if (dragSourceIndex !== null) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
    },
    [dragSourceIndex]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (!editingThingData || !frameGroup) return

      const fileList = e.dataTransfer?.files
      if (!fileList || fileList.length === 0) return

      const files = Array.from(fileList).filter(
        (f) =>
          f.type.startsWith('image/') ||
          f.name.endsWith('.png') ||
          f.name.endsWith('.bmp') ||
          f.name.endsWith('.jpg')
      )

      if (files.length === 0) return

      // Import each image file as a sprite, starting from the selected slot or slot 0
      const startSlot = selectedSlot ?? 0
      const maxSlots = spriteIndex.length

      files.slice(0, maxSlots - startSlot).forEach((file, fileIdx) => {
        const reader = new FileReader()
        reader.onload = (): void => {
          const img = new Image()
          img.onload = (): void => {
            // Draw image to 32x32 canvas
            const canvas = document.createElement('canvas')
            canvas.width = SPRITE_DEFAULT_SIZE
            canvas.height = SPRITE_DEFAULT_SIZE
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            ctx.clearRect(0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE)
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(img, 0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE)
            const imageData = ctx.getImageData(0, 0, SPRITE_DEFAULT_SIZE, SPRITE_DEFAULT_SIZE)

            // Convert RGBA -> ARGB
            const argbPixels = rgbaToArgb(imageData.data)

            // Determine slot index
            const slotIdx = startSlot + fileIdx
            if (slotIdx >= maxSlots) return

            // Update editingThingData sprites (inline)
            const currentSprites = editingThingData.sprites.get(frameGroupType) ?? []
            const newSprites = [...currentSprites]
            while (newSprites.length <= slotIdx) {
              newSprites.push(createSpriteData())
            }
            newSprites[slotIdx] = { id: 0, pixels: argbPixels }

            // Build updated ThingData
            const newSpritesMap = new Map(editingThingData.sprites)
            newSpritesMap.set(frameGroupType, newSprites)

            // Compress and store in sprite store
            const compressed = compressPixels(argbPixels, transparent)
            const spriteStore = useSpriteStore.getState()
            const newSpriteId = spriteStore.addSprite(compressed)

            // Update the thing's spriteIndex
            const updatedThing = cloneThingType(editingThingData.thing)
            const fg = updatedThing.frameGroups[frameGroupType]
            if (fg) {
              const newSpriteIndex = [...fg.spriteIndex]
              newSpriteIndex[slotIdx] = newSpriteId
              fg.spriteIndex = newSpriteIndex
            }

            // Push to editor store
            const editorStore = useEditorStore.getState()
            editorStore.setEditingThingData({
              ...editingThingData,
              thing: updatedThing,
              sprites: newSpritesMap
            })
            editorStore.setEditingChanged(true)

            // Update app store thing
            const appStore = useAppStore.getState()
            appStore.updateThing(
              editingThingData.thing.category,
              editingThingData.thing.id,
              updatedThing
            )
            appStore.setProjectChanged(true)
            appStore.setSpriteCount(Math.max(appStore.spriteCount ?? 0, newSpriteId))

            // Update menu state
            if (window.api?.menu) {
              window.api.menu.updateState({ clientChanged: true })
            }
          }
          img.src = reader.result as string
        }
        reader.readAsDataURL(file)
      })
    },
    [editingThingData, frameGroup, frameGroupType, spriteIndex, selectedSlot, transparent]
  )

  const handleReplaceSelected = useCallback(async () => {
    if (!window.api?.file || !editingThingData || selectedSlots.length === 0) return

    const appStore = useAppStore.getState()

    if (hasInvalidReplaceSelection) {
      appStore.addLog('warning', t('error.spriteCannotBeReplaced'))
      return
    }

    if (selectedSpriteTargets.length === 0) return

    const result = await window.api.file.showOpenDialog({
      title: t('controls.replaceSprite'),
      filters: [
        { name: 'Images', extensions: ['png', 'bmp', 'jpg', 'jpeg'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      multiSelections: true
    })

    if (result.canceled || result.filePaths.length === 0) return

    const sortedFilePaths = [...result.filePaths].sort(compareFileNamesNaturally)
    if (sortedFilePaths.length !== selectedSpriteTargets.length) {
      appStore.addLog(
        'warning',
        `Sprite replace expects ${selectedSpriteTargets.length} file(s), received ${sortedFilePaths.length}.`
      )
      return
    }

    try {
      const replacementEntries: Array<[number, Uint8Array]> = []
      const updatedInlineSprites = [...(editingThingData.sprites.get(frameGroupType) ?? [])]

      for (let index = 0; index < selectedSpriteTargets.length; index++) {
        const target = selectedSpriteTargets[index]
        const pixels = await loadArgbPixelsFromPath(sortedFilePaths[index])
        replacementEntries.push([target.spriteId, compressPixels(pixels, transparent)])

        while (updatedInlineSprites.length <= target.slotIndex) {
          updatedInlineSprites.push(createSpriteData())
        }
        updatedInlineSprites[target.slotIndex] = { id: target.spriteId, pixels }
      }

      useSpriteStore.getState().replaceSprites(replacementEntries)

      const newSpritesMap = new Map(editingThingData.sprites)
      newSpritesMap.set(frameGroupType, updatedInlineSprites)

      const editorStore = useEditorStore.getState()
      editorStore.setEditingThingData({
        ...editingThingData,
        sprites: newSpritesMap
      })
      editorStore.setEditingChanged(true)

      appStore.setProjectChanged(true)
      appStore.addLog('info', `Replaced ${replacementEntries.length} sprite(s).`)

      if (window.api?.menu) {
        await window.api.menu.updateState({ clientChanged: true })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      appStore.addLog('error', `Failed to replace sprites: ${message}`)
    }
  }, [
    editingThingData,
    frameGroupType,
    hasInvalidReplaceSelection,
    selectedSlots,
    selectedSpriteTargets,
    t,
    transparent
  ])

  const handleExportSelected = useCallback(async () => {
    if (!window.api?.file || selectedSpriteTargets.length === 0) return

    const result = await window.api.file.showDirectoryDialog({
      title: 'Select Sprite Export Folder'
    })
    if (result.canceled || !result.directoryPath) return

    const appStore = useAppStore.getState()
    const spriteStore = useSpriteStore.getState()
    const spriteIds = selectedSpriteTargets.map((target) => target.spriteId)

    try {
      await spriteStore.ensureSpritesCached(spriteIds)

      let exportedCount = 0
      for (const spriteId of spriteIds) {
        const compressed = useSpriteStore.getState().getSprite(spriteId)
        if (!compressed || compressed.length === 0) {
          appStore.addLog('warning', `Sprite #${spriteId} has no pixel data and was skipped.`)
          continue
        }

        const pixels = uncompressPixels(compressed, transparent)
        const buffer = await encodeSpritePng(pixels)
        await window.api.file.writeBinary(
          joinFilePath(result.directoryPath, `sprite_${spriteId}.png`),
          buffer
        )
        exportedCount++
      }

      appStore.addLog('info', `Exported ${exportedCount} sprite(s).`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      appStore.addLog('error', `Failed to export sprites: ${message}`)
    }
  }, [selectedSpriteTargets, transparent])

  // -------------------------------------------------------------------------
  // Render: empty state
  // -------------------------------------------------------------------------

  if (!editingThingData) {
    return (
      <div className="flex h-full flex-col bg-bg-secondary" data-testid="sprite-panel">
        <div className="flex h-7 items-center border-b border-border px-2">
          <span className="flex-1 text-xs font-medium text-text-secondary">{t('labels.sprites')}</span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="Hide Sprite Panel"
            onClick={() => togglePanel('sprites')}
          >
            <IconClose size={14} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-text-secondary">No object selected</span>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: with editing data
  // -------------------------------------------------------------------------

  return (
    <div
      className={`flex h-full flex-col bg-bg-secondary outline-none ${isDragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      data-testid="sprite-panel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="text-xs font-medium text-text-secondary">
          {t('labels.sprites')}
          {spriteSlots.length > 0 ? ` (${spriteSlots.length})` : ''}
        </span>
        <div className="flex items-center gap-1">
          {isOutfit && hasWalkingGroup && (
            <select
              className="h-5 rounded border border-border bg-bg-primary px-1 text-[10px] text-text-primary outline-none focus:border-accent"
              value={frameGroupType}
              onChange={handleFrameGroupChange}
              data-testid="frame-group-select"
            >
              <option value={FrameGroupType.DEFAULT}>{t('thingType.idle')}</option>
              <option value={FrameGroupType.WALKING}>{t('thingType.walking')}</option>
            </select>
          )}
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="Hide Sprite Panel"
            onClick={() => togglePanel('sprites')}
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Pagination stepper (only shown when needed) */}
      {needsPagination && (
        <div className="flex shrink-0 items-center justify-center border-b border-border py-0.5 px-1">
          <PaginationStepper
            value={spriteStepperValue}
            min={0}
            max={spriteStepperMax}
            pageSize={resolvedPageSize}
            onChange={handleSpriteStepperChange}
          />
          <span className="ml-1 text-[9px] text-text-secondary">
            {safePage + 1}/{totalPages}
          </span>
        </div>
      )}

      {/* Sprite grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1" data-testid="sprite-grid">
        {spriteSlots.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[10px] text-text-secondary">{t('labels.empty')}</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-0.5">
            {pageSlots.map((slot) => (
              <SpriteCell
                key={slot.index}
                slot={slot}
                selected={selectedSlots.includes(slot.index)}
                dragOverTarget={dragOverIndex === slot.index}
                onSelect={handleSelectSprite}
                onHover={handleHover}
                onDragStart={handleSpriteDragStart}
                onDragOver={handleSpriteDragOver}
                onDragLeave={handleSpriteDragLeave}
                onDrop={handleSpriteDrop}
                onDragEnd={handleSpriteDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {previewSlot && <SpritePreview spriteId={previewSlot.spriteId} pixels={previewSlot.pixels} />}

      {/* Action buttons */}
      <div
        className="flex shrink-0 items-center gap-1 border-t border-border p-1"
        data-testid="sprite-actions"
      >
        <button
          className="flex-1 rounded px-1 py-0.5 text-[10px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          title="Import sprite from image file"
          data-testid="sprite-import-btn"
        >
          {t('labels.import')}
        </button>
        <button
          className="flex-1 rounded px-1 py-0.5 text-[10px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          disabled={selectedSpriteTargets.length === 0}
          title="Export selected sprite(s) as PNG"
          data-testid="sprite-export-btn"
          onClick={() => {
            void handleExportSelected()
          }}
        >
          {t('labels.export')}
        </button>
        <button
          className="flex-1 rounded px-1 py-0.5 text-[10px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          disabled={selectedSpriteTargets.length === 0}
          title="Replace selected sprite"
          data-testid="sprite-replace-btn"
          onClick={() => {
            void handleReplaceSelected()
          }}
        >
          {t('labels.replace')}
        </button>
        <button
          className="flex-1 rounded px-1 py-0.5 text-[10px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          disabled={selectedSlot === null}
          title="Remove selected sprite"
          data-testid="sprite-remove-btn"
        >
          {t('labels.remove')}
        </button>
      </div>
    </div>
  )
}
