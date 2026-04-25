/**
 * Canvas-based sprite renderer component with zoom and pan.
 * Renders composed multi-tile, multi-layer OpenTibia objects
 * on a Canvas 2D surface with checkerboard transparency background.
 *
 * Ported from legacy AS3:
 * - otlib/components/ThingDataView.as (composition + rendering)
 * - otlib/components/CheckerBoard.as (transparency pattern)
 *
 * Features:
 * - Multi-layer composition (base + blend for outfits)
 * - Pattern support (patternX for directions, patternZ for mounts)
 * - Outfit colorization via OutfitData
 * - Checkerboard transparency background
 * - Zoom (mouse wheel) and pan (mouse drag)
 * - Auto-scale for small sprites (minSize)
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import type { ThingData } from '../../types/things'
import { ThingCategory } from '../../types/things'
import type { FrameGroupType } from '../../types/animation'
import { FrameGroupType as FGT } from '../../types/animation'
import { SPRITE_DEFAULT_DATA_SIZE } from '../../types/sprites'
import { useAppStore } from '../../stores'
import { useSpriteStore } from '../../stores'
import { uncompressPixels } from '../../services/spr'
import {
  type OutfitData,
  type SpriteSheet,
  type SpritePixelProvider,
  buildSpriteSheet,
  buildColoredSpriteSheet,
  extractFrame,
  frameToImageData,
  drawCheckerboard
} from '../../services/sprite-render'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
const ZOOM_STEP = 0.15

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpriteRendererProps {
  /** Thing data to render (null = empty) */
  thingData: ThingData | null
  /** Frame group type (DEFAULT or WALKING) */
  frameGroupType?: FrameGroupType
  /** Current animation frame index */
  frame?: number
  /** Pattern X index (direction: 0=N, 1=E, 2=S, 3=W) */
  patternX?: number
  /** Pattern Z index (mount layer) */
  patternZ?: number
  /** Outfit colors (null for non-outfits or default gray) */
  outfitData?: OutfitData | null
  /** Initial zoom level (1.0 = 100%) */
  zoom?: number
  /** Minimum display size - auto-scales small sprites up */
  minSize?: number
  /** Show checkerboard pattern for transparency */
  showCheckerboard?: boolean
  /** Show all layers including blend layer */
  drawBlendLayer?: boolean
  /** CSS class name for the wrapper div */
  className?: string
  /** Callback when zoom changes (mouse wheel) */
  onZoomChange?: (zoom: number) => void
}

// ---------------------------------------------------------------------------
// SpriteRenderer
// ---------------------------------------------------------------------------

export function SpriteRenderer({
  thingData,
  frameGroupType = FGT.DEFAULT,
  frame = 0,
  patternX = 0,
  patternZ = 0,
  outfitData = null,
  zoom: controlledZoom,
  minSize = 0,
  showCheckerboard = true,
  drawBlendLayer = false,
  className,
  onZoomChange
}: SpriteRendererProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [internalZoom, setInternalZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const zoom = controlledZoom ?? internalZoom

  // Store data for sprite resolution
  const spriteAccessor = useSpriteStore((s) => s.spriteAccessor)
  const spriteOverrides = useSpriteStore((s) => s.sprites)
  const spriteCacheRevision = useSpriteStore((s) => s.spriteCacheRevision)
  const clientInfo = useAppStore((s) => s.clientInfo)
  const transparent = clientInfo?.features?.transparency ?? false

  // Resolve frame group
  const thing = thingData?.thing
  const frameGroup = thing?.frameGroups[frameGroupType] ?? thing?.frameGroups[FGT.DEFAULT]
  const inlineSprites =
    thingData?.sprites.get(frameGroupType) ?? thingData?.sprites.get(FGT.DEFAULT) ?? []
  const isOutfit = thing?.category === ThingCategory.OUTFIT
  const spriteIdsKey = useMemo(() => {
    if (!frameGroup) return ''
    const ids = new Set<number>()
    for (const spriteId of frameGroup.spriteIndex) {
      if (spriteId > 0) ids.add(spriteId)
    }
    return Array.from(ids)
      .sort((a, b) => a - b)
      .join(',')
  }, [frameGroup])

  useEffect(() => {
    if (!spriteIdsKey) return
    const ids = spriteIdsKey
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
    void useSpriteStore.getState().ensureSpritesCached(ids)
  }, [spriteIdsKey])

  // Create sprite pixel provider
  const getPixels: SpritePixelProvider = useCallback(
    (spriteArrayIndex: number): Uint8Array | null => {
      // Try inline sprites first (uncompressed ARGB from OBD load)
      const inlineData = inlineSprites[spriteArrayIndex]
      if (inlineData?.pixels && inlineData.pixels.length >= SPRITE_DEFAULT_DATA_SIZE) {
        return inlineData.pixels
      }

      // Try sprite store (accessor-aware: checks overrides first, then SpriteAccessor)
      if (frameGroup) {
        const spriteId = frameGroup.spriteIndex[spriteArrayIndex]
        if (spriteId != null && spriteId > 0) {
          const compressed = useSpriteStore.getState().getSprite(spriteId)
          if (compressed && compressed.length > 0) {
            try {
              return uncompressPixels(compressed, transparent)
            } catch {
              // Decompression failed
            }
          }
        }
      }

      return null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inlineSprites, spriteAccessor, spriteOverrides, spriteCacheRevision, frameGroup, transparent]
  )

  // Build sprite sheet (memoized)
  const spriteSheet: SpriteSheet | null = useMemo(() => {
    if (!frameGroup || frameGroup.spriteIndex.length === 0) return null

    if (isOutfit && frameGroup.layers >= 2 && outfitData) {
      return buildColoredSpriteSheet(frameGroup, getPixels, outfitData)
    }

    return buildSpriteSheet(frameGroup, getPixels, 0)
  }, [frameGroup, getPixels, isOutfit, outfitData])

  // Build a "flattened" frame group for colorized outfits (layers=1, patternY=1)
  const displayFrameGroup = useMemo(() => {
    if (!frameGroup) return null
    if (isOutfit && frameGroup.layers >= 2 && outfitData) {
      return { ...frameGroup, layers: 1, patternY: 1 }
    }
    return frameGroup
  }, [frameGroup, isOutfit, outfitData])

  // Extract current frame
  const renderedFrame = useMemo(() => {
    if (!spriteSheet || !displayFrameGroup) return null
    return extractFrame(spriteSheet, displayFrameGroup, {
      patternX,
      patternY: 0,
      patternZ,
      frame,
      drawBlendLayer
    })
  }, [spriteSheet, displayFrameGroup, patternX, patternZ, frame, drawBlendLayer])

  // Compute display dimensions
  const displaySize = useMemo(() => {
    if (!renderedFrame || renderedFrame.width === 0) return { width: 0, height: 0, scale: 1 }
    const maxDim = Math.max(renderedFrame.width, renderedFrame.height)
    let scale = zoom
    if (minSize > 0 && maxDim * scale < minSize) {
      scale = minSize / maxDim
    }
    return {
      width: Math.ceil(renderedFrame.width * scale),
      height: Math.ceil(renderedFrame.height * scale),
      scale
    }
  }, [renderedFrame, zoom, minSize])

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height, scale } = displaySize
    if (width === 0 || height === 0) {
      canvas.width = 1
      canvas.height = 1
      ctx.clearRect(0, 0, 1, 1)
      return
    }

    canvas.width = width
    canvas.height = height

    // Draw checkerboard background
    if (showCheckerboard) {
      const tileSize = scale >= 2 ? 8 : 4
      drawCheckerboard(ctx, width, height, tileSize)
    } else {
      ctx.clearRect(0, 0, width, height)
    }

    // Draw rendered frame
    if (renderedFrame && renderedFrame.width > 0) {
      const imageData = frameToImageData(renderedFrame)
      if (imageData) {
        if (scale !== 1) {
          const offscreen = document.createElement('canvas')
          offscreen.width = renderedFrame.width
          offscreen.height = renderedFrame.height
          const offCtx = offscreen.getContext('2d')
          if (offCtx) {
            offCtx.putImageData(imageData, 0, 0)
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(offscreen, panOffset.x, panOffset.y, width, height)
            // Release offscreen canvas pixel buffer
            offscreen.width = 0
            offscreen.height = 0
          }
        } else {
          ctx.putImageData(imageData, panOffset.x, panOffset.y)
        }
      }
    }
  }, [renderedFrame, displaySize, showCheckerboard, panOffset])

  // Cleanup canvas on unmount to release pixel buffer
  useEffect(() => {
    const canvas = canvasRef.current
    return () => {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [])

  // Zoom handler (mouse wheel)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta))
      if (controlledZoom !== undefined) {
        onZoomChange?.(newZoom)
      } else {
        setInternalZoom(newZoom)
        onZoomChange?.(newZoom)
      }
    },
    [zoom, controlledZoom, onZoomChange]
  )

  // Pan handlers (mouse drag)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return
      setIsDragging(true)
      dragStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }
    },
    [zoom, panOffset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      setPanOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      })
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Double-click to reset zoom/pan
  const handleDoubleClick = useCallback(() => {
    if (controlledZoom !== undefined) {
      onZoomChange?.(1)
    } else {
      setInternalZoom(1)
      onZoomChange?.(1)
    }
    setPanOffset({ x: 0, y: 0 })
  }, [controlledZoom, onZoomChange])

  // Reset pan when thing or zoom changes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 })
  }, [thingData, zoom])

  return (
    <div
      className={`inline-flex items-center justify-center ${className ?? ''}`}
      data-testid="sprite-renderer"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
        userSelect: 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        width={displaySize.width || 1}
        height={displaySize.height || 1}
        style={{ imageRendering: 'pixelated' }}
        data-testid="sprite-renderer-canvas"
      />
    </div>
  )
}
