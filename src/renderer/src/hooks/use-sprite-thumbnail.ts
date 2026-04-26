/**
 * Hook for rendering thing thumbnails with caching.
 * Composites all tiles of a thing (multi-tile, multi-layer) into a single
 * thumbnail image, matching the legacy AS3 ObjectBuilderWorker.getBitmapPixels().
 *
 * Rendering rules (ported from legacy):
 * - Always uses frame 0 (first animation frame)
 * - Outfits: render only layer 0, direction 2 (south) if patternX > 1
 * - Items/Effects/Missiles: render ALL layers composited, direction 0
 * - Multi-tile objects: composites all tiles with coordinate flip
 * - Background: 0xFF636363 (dark gray)
 */

import { useMemo } from 'react'
import { useSpriteStore } from '../stores'
import { useAppStore } from '../stores'
import { ThingCategory, type ThingType, getFrameGroupSpriteIndex } from '../types'
import { uncompressPixels, argbToRgba } from '../services/spr'
import { LruCache } from '../utils/lru-cache'
import { getEffectPreviewFrameIndex, type EffectPreviewFrameMode } from './effect-preview-frame'
import { clearEffectColorAnalysisCache } from './effect-dominant-color'

// ---------------------------------------------------------------------------
// Module-level thumbnail cache (thing signature -> data URL, LRU eviction)
// ---------------------------------------------------------------------------

const DEFAULT_THUMBNAIL_CACHE_SIZE = 5000

const thumbnailCache = new LruCache<string, string>(DEFAULT_THUMBNAIL_CACHE_SIZE)

/** Clear the thumbnail cache (called when project loads/unloads). */
export function clearThumbnailCache(): void {
  thumbnailCache.clear()
  clearEffectColorAnalysisCache()
}

/**
 * Dispose the offscreen canvas and thumbnail cache.
 * Called on project unload to release canvas pixel buffers for GC.
 */
export function disposeThumbnailResources(): void {
  thumbnailCache.clear()
  clearEffectColorAnalysisCache()
  if (_offscreenCanvas) {
    // Reset canvas dimensions to release backing pixel buffer
    _offscreenCanvas.width = 0
    _offscreenCanvas.height = 0
    _offscreenCanvas = null
  }
}

// ---------------------------------------------------------------------------
// ARGB pixel compositing
// ---------------------------------------------------------------------------

const SPRITE_SIZE = 32

// Reusable offscreen canvas for thumbnail rendering (avoids DOM allocation per thumbnail)
let _offscreenCanvas: HTMLCanvasElement | null = null

function getThingThumbnailSignature(thing: ThingType): string {
  if (!thing.frameGroups || thing.frameGroups.length === 0) {
    return 'no-frame-groups'
  }

  return thing.frameGroups
    .map((frameGroup, index) => {
      if (!frameGroup) {
        return `${index}:missing`
      }

      return [
        index,
        frameGroup.width,
        frameGroup.height,
        frameGroup.exactSize,
        frameGroup.layers,
        frameGroup.patternX,
        frameGroup.patternY,
        frameGroup.patternZ,
        frameGroup.frames,
        frameGroup.spriteIndex.join(',')
      ].join(':')
    })
    .join('|')
}

function getThingThumbnailCacheKey(
  thing: ThingType,
  category: ThingCategory,
  transparent: boolean,
  effectPreviewFrameMode: EffectPreviewFrameMode
): string {
  return `${category}:${thing.id}:${transparent ? 1 : 0}:${effectPreviewFrameMode}:${getThingThumbnailSignature(thing)}`
}

function getOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  if (!_offscreenCanvas) {
    _offscreenCanvas = document.createElement('canvas')
  }
  _offscreenCanvas.width = width
  _offscreenCanvas.height = height
  return _offscreenCanvas
}

/**
 * Alpha-composite a 32x32 ARGB sprite onto a destination ARGB buffer.
 * Uses standard "over" compositing: dst = src + dst * (1 - srcAlpha).
 */
function blitSpriteARGB(
  dst: Uint8Array,
  dstWidth: number,
  src: Uint8Array,
  destX: number,
  destY: number
): void {
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const srcRow = y * SPRITE_SIZE * 4
    const dstRow = ((destY + y) * dstWidth + destX) * 4
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const si = srcRow + x * 4
      const di = dstRow + x * 4
      const srcA = src[si] // ARGB: [A, R, G, B]
      if (srcA === 0) continue
      if (srcA === 0xff) {
        dst[di] = src[si]
        dst[di + 1] = src[si + 1]
        dst[di + 2] = src[si + 2]
        dst[di + 3] = src[si + 3]
      } else {
        const invA = 255 - srcA
        dst[di] = Math.min(255, srcA + ((dst[di] * invA) >> 8))
        dst[di + 1] = ((src[si + 1] * srcA + dst[di + 1] * invA) >> 8) & 0xff
        dst[di + 2] = ((src[si + 2] * srcA + dst[di + 2] * invA) >> 8) & 0xff
        dst[di + 3] = ((src[si + 3] * srcA + dst[di + 3] * invA) >> 8) & 0xff
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Thumbnail rendering (matches legacy getBitmapPixels)
// ---------------------------------------------------------------------------

function renderThingThumbnail(
  thing: ThingType,
  category: ThingCategory,
  transparent: boolean,
  effectPreviewFrameMode: EffectPreviewFrameMode
): string | null {
  const fg = thing.frameGroups?.[0]
  if (!fg) return null

  const width = fg.width || 1
  const height = fg.height || 1
  const bitmapWidth = width * SPRITE_SIZE
  const bitmapHeight = height * SPRITE_SIZE

  // Determine layers and direction based on category (legacy behavior)
  const isOutfit = category === ThingCategory.OUTFIT
  const isEffect = category === ThingCategory.EFFECT
  const layers = isOutfit ? 1 : fg.layers
  const patternX = isOutfit && fg.patternX > 1 ? 2 : 0

  // Create output buffer filled with gray background (0xFF636363 in ARGB)
  const pixels = new Uint8Array(bitmapWidth * bitmapHeight * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0xff
    pixels[i + 1] = 0x63
    pixels[i + 2] = 0x63
    pixels[i + 3] = 0x63
  }

  const spriteStore = useSpriteStore.getState()
  let hasAnySprite = false
  const frame = isEffect
    ? getEffectPreviewFrameIndex(
        fg,
        effectPreviewFrameMode,
        (spriteId) => spriteStore.getSprite(spriteId),
        transparent
      )
    : 0

  // Composite sprites: loop layers, width tiles, height tiles
  for (let l = 0; l < layers; l++) {
    for (let w = 0; w < width; w++) {
      for (let h = 0; h < height; h++) {
        // Get sprite array index for this tile
        const index = getFrameGroupSpriteIndex(fg, w, h, l, patternX, 0, 0, frame)
        const spriteId = fg.spriteIndex[index]
        if (!spriteId || spriteId <= 0) continue

        const compressed = spriteStore.getSprite(spriteId)
        if (!compressed) continue

        const spritePixels = uncompressPixels(compressed, transparent)

        // Position with coordinate flip (legacy behavior: OT coordinate system)
        const px = (width - w - 1) * SPRITE_SIZE
        const py = (height - h - 1) * SPRITE_SIZE

        blitSpriteARGB(pixels, bitmapWidth, spritePixels, px, py)
        hasAnySprite = true
      }
    }
  }

  if (!hasAnySprite) return null

  // Convert ARGB -> RGBA for Canvas2D
  const rgba = argbToRgba(pixels)

  const canvas = getOffscreenCanvas(bitmapWidth, bitmapHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const imageData = new ImageData(new Uint8ClampedArray(rgba), bitmapWidth, bitmapHeight)
  ctx.putImageData(imageData, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')

  // Clear canvas pixel buffer after extraction to help GC
  ctx.clearRect(0, 0, bitmapWidth, bitmapHeight)

  return dataUrl
}

export function warmThingThumbnailCache(
  thing: ThingType,
  category: ThingCategory,
  transparent: boolean,
  effectPreviewFrameMode: EffectPreviewFrameMode = 'first'
): string | null {
  if (!thing.frameGroups?.length) return null

  const cacheKey = getThingThumbnailCacheKey(thing, category, transparent, effectPreviewFrameMode)
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached

  const url = renderThingThumbnail(thing, category, transparent, effectPreviewFrameMode)
  if (url) {
    thumbnailCache.set(cacheKey, url)
  }
  return url
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns a data URL (PNG) for the given thing's thumbnail, or null if unavailable.
 * Composites all tiles/layers matching the legacy rendering behavior.
 */
export function useSpriteThumbnail(
  thing: ThingType,
  category: ThingCategory,
  effectPreviewFrameMode: EffectPreviewFrameMode = 'first'
): string | null {
  const transparent = useAppStore((s) => s.clientInfo?.features?.transparency ?? false)
  const spriteCacheRevision = useSpriteStore((s) => s.spriteCacheRevision)
  const thingSignature = useMemo(() => getThingThumbnailSignature(thing), [thing])

  const dataUrl = useMemo(() => {
    // Keep cache hits stable, but retry rendering when a file-backed sprite batch arrives.
    void spriteCacheRevision

    if (!thing || !thing.frameGroups?.length) {
      return null
    }

    const cacheKey = `${category}:${thing.id}:${transparent ? 1 : 0}:${effectPreviewFrameMode}:${thingSignature}`

    // Check module-level cache
    const cached = thumbnailCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const url = renderThingThumbnail(thing, category, transparent, effectPreviewFrameMode)
      if (url) {
        thumbnailCache.set(cacheKey, url)
      }
      return url
    } catch {
      return null
    }
  }, [thing, category, transparent, effectPreviewFrameMode, thingSignature, spriteCacheRevision])

  return dataUrl
}
