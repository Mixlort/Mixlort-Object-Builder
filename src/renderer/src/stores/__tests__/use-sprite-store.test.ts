import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useSpriteStore,
  resetSpriteStore,
  selectSprites,
  selectSpriteAccessor,
  selectRenderedCache,
  selectSelectedSpriteId,
  selectSelectedSpriteIds,
  selectChangedSpriteIds,
  selectPendingOperation,
  selectHasPendingOperation,
  selectSpriteStoreCount,
  selectHasChangedSprites
} from '../use-sprite-store'
import { writeSpr } from '../../services/spr/spr-writer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePixels(fill: number): Uint8Array {
  const data = new Uint8Array(16)
  data.fill(fill)
  return data
}

function makeSpritesMap(entries: Array<[number, number]>): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>()
  for (const [id, fill] of entries) {
    map.set(id, makePixels(fill))
  }
  return map
}

function makeSprBuffer(
  entries: Array<[number, number]>,
  extended = false,
  spriteCount?: number
): ArrayBuffer {
  const sprites = makeSpritesMap(entries)
  const count = spriteCount ?? Math.max(0, ...sprites.keys())
  return writeSpr({ signature: 0x12345678, spriteCount: count, sprites }, extended)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetSpriteStore()
})

describe('use-sprite-store', () => {
  // =========================================================================
  // Initial state
  // =========================================================================

  describe('initial state', () => {
    it('has empty sprites map', () => {
      expect(useSpriteStore.getState().sprites.size).toBe(0)
    })

    it('has empty rendered cache', () => {
      expect(useSpriteStore.getState().renderedCache.size).toBe(0)
    })

    it('has default cache max size of 2000', () => {
      expect(useSpriteStore.getState().renderedCache.maxSize).toBe(2000)
    })

    it('has null selected sprite id', () => {
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
    })

    it('has empty selected sprite ids', () => {
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([])
    })

    it('has empty changed sprite ids', () => {
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
    })

    it('has null pending operation', () => {
      expect(useSpriteStore.getState().pendingOperation).toBeNull()
    })
  })

  // =========================================================================
  // Bulk loading
  // =========================================================================

  describe('loadSprites', () => {
    it('loads sprites map', () => {
      const sprites = makeSpritesMap([
        [1, 0xaa],
        [2, 0xbb]
      ])
      useSpriteStore.getState().loadSprites(sprites)

      expect(useSpriteStore.getState().sprites.size).toBe(2)
      expect(useSpriteStore.getState().sprites.get(1)).toEqual(makePixels(0xaa))
      expect(useSpriteStore.getState().sprites.get(2)).toEqual(makePixels(0xbb))
    })

    it('creates a copy of the input map', () => {
      const sprites = makeSpritesMap([[1, 0xaa]])
      useSpriteStore.getState().loadSprites(sprites)
      sprites.set(99, makePixels(0xff))

      expect(useSpriteStore.getState().sprites.has(99)).toBe(false)
    })

    it('clears rendered cache on load', () => {
      useSpriteStore.getState().setCachedRender(1, 'data:old')
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))

      expect(useSpriteStore.getState().renderedCache.size).toBe(0)
    })

    it('clears changed sprite ids on load', () => {
      useSpriteStore.getState().markSpriteChanged(5)
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))

      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
    })

    it('clears selection on load', () => {
      useSpriteStore.getState().selectSprite(3)
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))

      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([])
    })
  })

  describe('file-backed PXG sprites', () => {
    it('loads a file-backed source and fetches missing sprites on demand', async () => {
      const readSprites = vi.fn().mockResolvedValue({
        entries: [[5, makePixels(0xee)]]
      })
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: {
          project: { readSprites }
        }
      })

      useSpriteStore.getState().loadFileBacked({
        kind: 'file-backed-pxg',
        signature: 0x59e48e02,
        spriteCount: 8,
        extended: true,
        sprFilePath: '/tmp/Tibia.spr',
        sprxFilePath: '/tmp/Tibia.sprx',
        baseSpriteCount: 4,
        extraSpriteCount: 4,
        baseAddressTableOffset: 8,
        extraAddressTableOffset: 16
      })

      expect(useSpriteStore.getState().getSprite(5)).toBeUndefined()
      await useSpriteStore.getState().ensureSpritesCached([5, 5])

      expect(readSprites).toHaveBeenCalledWith([5])
      expect(useSpriteStore.getState().getSprite(5)).toEqual(makePixels(0xee))
      expect(useSpriteStore.getState().getSpriteCount()).toBe(8)
    })

    it('coalesces file-backed sprite requests into a single IPC batch', async () => {
      const readSprites = vi.fn().mockResolvedValue({
        entries: [
          [5, makePixels(0xe5)],
          [6, makePixels(0xe6)],
          [7, makePixels(0xe7)]
        ]
      })
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: {
          project: { readSprites }
        }
      })

      useSpriteStore.getState().loadFileBacked({
        kind: 'file-backed-pxg',
        signature: 0x59e48e02,
        spriteCount: 8,
        extended: true,
        sprFilePath: '/tmp/Tibia.spr',
        sprxFilePath: '/tmp/Tibia.sprx',
        baseSpriteCount: 4,
        extraSpriteCount: 4,
        baseAddressTableOffset: 8,
        extraAddressTableOffset: 16
      })

      await Promise.all([
        useSpriteStore.getState().ensureSpritesCached([5]),
        useSpriteStore.getState().ensureSpritesCached([6, 7])
      ])

      expect(readSprites).toHaveBeenCalledTimes(1)
      expect(readSprites).toHaveBeenCalledWith([5, 6, 7])
      expect(useSpriteStore.getState().getSprite(7)).toEqual(makePixels(0xe7))
      expect(useSpriteStore.getState().spriteCacheLoading).toBe(false)
      expect(useSpriteStore.getState().spriteCachePendingCount).toBe(0)
    })

    it('reports when requested file-backed sprites are already cached', async () => {
      const readSprites = vi.fn().mockResolvedValue({
        entries: [[5, makePixels(0xee)]]
      })
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: {
          project: { readSprites }
        }
      })

      useSpriteStore.getState().loadFileBacked({
        kind: 'file-backed-pxg',
        signature: 0x59e48e02,
        spriteCount: 8,
        extended: true,
        sprFilePath: '/tmp/Tibia.spr',
        sprxFilePath: '/tmp/Tibia.sprx',
        baseSpriteCount: 4,
        extraSpriteCount: 4,
        baseAddressTableOffset: 8,
        extraAddressTableOffset: 16
      })

      expect(useSpriteStore.getState().areSpritesCached([5])).toBe(false)

      await useSpriteStore.getState().ensureSpritesCached([5])

      expect(useSpriteStore.getState().areSpritesCached([5])).toBe(true)
      expect(useSpriteStore.getState().areSpritesCached([5, 5, 99])).toBe(true)
    })
  })

  describe('clearSprites', () => {
    it('clears all sprite data and state', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))
      useSpriteStore.getState().setCachedRender(1, 'data:url')
      useSpriteStore.getState().selectSprite(1)
      useSpriteStore.getState().markSpriteChanged(1)
      useSpriteStore.getState().startOperation('import', [1])

      useSpriteStore.getState().clearSprites()

      const state = useSpriteStore.getState()
      expect(state.sprites.size).toBe(0)
      expect(state.renderedCache.size).toBe(0)
      expect(state.changedSpriteIds).toEqual([])
      expect(state.selectedSpriteId).toBeNull()
      expect(state.selectedSpriteIds).toEqual([])
      expect(state.pendingOperation).toBeNull()
    })
  })

  // =========================================================================
  // Individual sprite CRUD
  // =========================================================================

  describe('getSprite', () => {
    it('returns compressed pixels for existing sprite', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[5, 0xcc]]))
      expect(useSpriteStore.getState().getSprite(5)).toEqual(makePixels(0xcc))
    })

    it('returns undefined for non-existing sprite', () => {
      expect(useSpriteStore.getState().getSprite(999)).toBeUndefined()
    })
  })

  describe('setSprite', () => {
    it('sets sprite pixels', () => {
      useSpriteStore.getState().setSprite(10, makePixels(0xdd))
      expect(useSpriteStore.getState().sprites.get(10)).toEqual(makePixels(0xdd))
    })

    it('replaces existing sprite pixels', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[10, 0xaa]]))
      useSpriteStore.getState().setSprite(10, makePixels(0xdd))
      expect(useSpriteStore.getState().sprites.get(10)).toEqual(makePixels(0xdd))
    })

    it('marks sprite as changed', () => {
      useSpriteStore.getState().setSprite(10, makePixels(0xdd))
      expect(useSpriteStore.getState().changedSpriteIds).toContain(10)
    })

    it('does not duplicate changed id', () => {
      useSpriteStore.getState().setSprite(10, makePixels(0xdd))
      useSpriteStore.getState().setSprite(10, makePixels(0xee))
      expect(useSpriteStore.getState().changedSpriteIds.filter((id) => id === 10)).toHaveLength(1)
    })

    it('invalidates render cache for that sprite', () => {
      useSpriteStore.getState().setCachedRender(10, 'data:old')
      useSpriteStore.getState().setSprite(10, makePixels(0xdd))
      expect(useSpriteStore.getState().renderedCache.has(10)).toBe(false)
    })
  })

  describe('removeSprite', () => {
    it('removes sprite from map', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[5, 0xaa]]))
      useSpriteStore.getState().removeSprite(5)
      expect(useSpriteStore.getState().sprites.has(5)).toBe(false)
    })

    it('marks removed sprite as changed', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[5, 0xaa]]))
      useSpriteStore.getState().removeSprite(5)
      expect(useSpriteStore.getState().changedSpriteIds).toContain(5)
    })

    it('invalidates render cache for removed sprite', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[5, 0xaa]]))
      useSpriteStore.getState().setCachedRender(5, 'data:url')
      useSpriteStore.getState().removeSprite(5)
      expect(useSpriteStore.getState().renderedCache.has(5)).toBe(false)
    })
  })

  describe('addSprite', () => {
    it('returns next id after max existing id', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [5, 0xbb]
        ])
      )
      const newId = useSpriteStore.getState().addSprite(makePixels(0xcc))
      expect(newId).toBe(6)
    })

    it('returns 1 when sprites map is empty', () => {
      const newId = useSpriteStore.getState().addSprite(makePixels(0xcc))
      expect(newId).toBe(1)
    })

    it('stores compressed pixels when provided', () => {
      const newId = useSpriteStore.getState().addSprite(makePixels(0xcc))
      expect(useSpriteStore.getState().sprites.get(newId)).toEqual(makePixels(0xcc))
    })

    it('does not store pixels when null', () => {
      const newId = useSpriteStore.getState().addSprite(null)
      expect(useSpriteStore.getState().sprites.has(newId)).toBe(false)
    })

    it('marks new sprite as changed', () => {
      const newId = useSpriteStore.getState().addSprite(makePixels(0xcc))
      expect(useSpriteStore.getState().changedSpriteIds).toContain(newId)
    })
  })

  // =========================================================================
  // Batch operations
  // =========================================================================

  describe('replaceSprites', () => {
    it('replaces multiple sprites at once', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb]
        ])
      )
      useSpriteStore.getState().replaceSprites([
        [1, makePixels(0xdd)],
        [2, makePixels(0xee)]
      ])

      expect(useSpriteStore.getState().sprites.get(1)).toEqual(makePixels(0xdd))
      expect(useSpriteStore.getState().sprites.get(2)).toEqual(makePixels(0xee))
    })

    it('marks all replaced sprites as changed', () => {
      useSpriteStore.getState().replaceSprites([
        [10, makePixels(0xdd)],
        [20, makePixels(0xee)]
      ])

      expect(useSpriteStore.getState().changedSpriteIds).toContain(10)
      expect(useSpriteStore.getState().changedSpriteIds).toContain(20)
    })

    it('invalidates render cache for replaced sprites', () => {
      useSpriteStore.getState().setCachedRender(10, 'data:a')
      useSpriteStore.getState().setCachedRender(20, 'data:b')
      useSpriteStore.getState().setCachedRender(30, 'data:c')

      useSpriteStore.getState().replaceSprites([[10, makePixels(0xdd)]])

      expect(useSpriteStore.getState().renderedCache.has(10)).toBe(false)
      expect(useSpriteStore.getState().renderedCache.has(20)).toBe(true)
      expect(useSpriteStore.getState().renderedCache.has(30)).toBe(true)
    })

    it('does not duplicate changed ids', () => {
      useSpriteStore.getState().markSpriteChanged(10)
      useSpriteStore.getState().replaceSprites([[10, makePixels(0xdd)]])

      expect(useSpriteStore.getState().changedSpriteIds.filter((id) => id === 10)).toHaveLength(1)
    })
  })

  describe('removeSprites', () => {
    it('removes multiple sprites at once', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb],
          [3, 0xcc]
        ])
      )
      useSpriteStore.getState().removeSprites([1, 3])

      expect(useSpriteStore.getState().sprites.has(1)).toBe(false)
      expect(useSpriteStore.getState().sprites.has(2)).toBe(true)
      expect(useSpriteStore.getState().sprites.has(3)).toBe(false)
    })

    it('marks all removed sprites as changed', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb]
        ])
      )
      useSpriteStore.getState().removeSprites([1, 2])

      expect(useSpriteStore.getState().changedSpriteIds).toContain(1)
      expect(useSpriteStore.getState().changedSpriteIds).toContain(2)
    })
  })

  // =========================================================================
  // Rendered cache
  // =========================================================================

  describe('getCachedRender', () => {
    it('returns data URL for cached sprite', () => {
      useSpriteStore.getState().setCachedRender(5, 'data:image/png;base64,ABC')
      expect(useSpriteStore.getState().getCachedRender(5)).toBe('data:image/png;base64,ABC')
    })

    it('returns undefined for uncached sprite', () => {
      expect(useSpriteStore.getState().getCachedRender(999)).toBeUndefined()
    })
  })

  describe('setCachedRender', () => {
    it('stores data URL in cache', () => {
      useSpriteStore.getState().setCachedRender(10, 'data:url')
      expect(useSpriteStore.getState().renderedCache.get(10)).toBe('data:url')
    })

    it('trims cache when exceeding max size', () => {
      useSpriteStore.getState().setCacheMaxSize(3)

      useSpriteStore.getState().setCachedRender(1, 'data:1')
      useSpriteStore.getState().setCachedRender(2, 'data:2')
      useSpriteStore.getState().setCachedRender(3, 'data:3')
      useSpriteStore.getState().setCachedRender(4, 'data:4')

      const cache = useSpriteStore.getState().renderedCache
      expect(cache.size).toBe(3)
      expect(cache.has(1)).toBe(false) // oldest evicted
      expect(cache.has(4)).toBe(true)
    })
  })

  describe('invalidateRender', () => {
    it('removes cached render for specific sprite', () => {
      useSpriteStore.getState().setCachedRender(5, 'data:url')
      useSpriteStore.getState().invalidateRender(5)
      expect(useSpriteStore.getState().renderedCache.has(5)).toBe(false)
    })

    it('is a no-op for uncached sprite', () => {
      const cacheBefore = useSpriteStore.getState().renderedCache
      useSpriteStore.getState().invalidateRender(999)
      expect(useSpriteStore.getState().renderedCache).toBe(cacheBefore)
    })
  })

  describe('invalidateAllRenders', () => {
    it('clears all cached renders', () => {
      useSpriteStore.getState().setCachedRender(1, 'data:1')
      useSpriteStore.getState().setCachedRender(2, 'data:2')
      useSpriteStore.getState().invalidateAllRenders()
      expect(useSpriteStore.getState().renderedCache.size).toBe(0)
    })
  })

  describe('setCacheMaxSize', () => {
    it('updates max size', () => {
      useSpriteStore.getState().setCacheMaxSize(500)
      expect(useSpriteStore.getState().renderedCache.maxSize).toBe(500)
    })

    it('trims existing cache to new size', () => {
      useSpriteStore.getState().setCachedRender(1, 'data:1')
      useSpriteStore.getState().setCachedRender(2, 'data:2')
      useSpriteStore.getState().setCachedRender(3, 'data:3')

      useSpriteStore.getState().setCacheMaxSize(2)

      expect(useSpriteStore.getState().renderedCache.size).toBe(2)
      expect(useSpriteStore.getState().renderedCache.has(1)).toBe(false)
    })
  })

  // =========================================================================
  // Selection
  // =========================================================================

  describe('selectSprite', () => {
    it('sets single sprite selection', () => {
      useSpriteStore.getState().selectSprite(5)
      expect(useSpriteStore.getState().selectedSpriteId).toBe(5)
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([5])
    })

    it('clears selection when null', () => {
      useSpriteStore.getState().selectSprite(5)
      useSpriteStore.getState().selectSprite(null)
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([])
    })
  })

  describe('selectSprites', () => {
    it('sets multiple sprite selection', () => {
      useSpriteStore.getState().selectSprites([1, 3, 5])
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([1, 3, 5])
      expect(useSpriteStore.getState().selectedSpriteId).toBe(5) // last
    })

    it('clears selection when empty array', () => {
      useSpriteStore.getState().selectSprites([1, 2])
      useSpriteStore.getState().selectSprites([])
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([])
    })

    it('copies the input array', () => {
      const ids = [1, 2, 3]
      useSpriteStore.getState().selectSprites(ids)
      ids.push(99)
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([1, 2, 3])
    })
  })

  describe('clearSpriteSelection', () => {
    it('clears all selection', () => {
      useSpriteStore.getState().selectSprites([1, 2, 3])
      useSpriteStore.getState().clearSpriteSelection()
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().selectedSpriteIds).toEqual([])
    })
  })

  // =========================================================================
  // Change tracking
  // =========================================================================

  describe('markSpriteChanged', () => {
    it('adds sprite id to changed list', () => {
      useSpriteStore.getState().markSpriteChanged(10)
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([10])
    })

    it('does not duplicate already changed id', () => {
      useSpriteStore.getState().markSpriteChanged(10)
      useSpriteStore.getState().markSpriteChanged(10)
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([10])
    })
  })

  describe('markSpritesChanged', () => {
    it('adds multiple sprite ids to changed list', () => {
      useSpriteStore.getState().markSpritesChanged([1, 2, 3])
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([1, 2, 3])
    })

    it('merges with existing changed ids without duplicates', () => {
      useSpriteStore.getState().markSpriteChanged(1)
      useSpriteStore.getState().markSpritesChanged([1, 2, 3])
      const changed = useSpriteStore.getState().changedSpriteIds
      expect(changed).toContain(1)
      expect(changed).toContain(2)
      expect(changed).toContain(3)
      expect(changed.filter((id) => id === 1)).toHaveLength(1)
    })

    it('is a no-op when all ids already changed', () => {
      useSpriteStore.getState().markSpritesChanged([1, 2])
      const before = useSpriteStore.getState().changedSpriteIds
      useSpriteStore.getState().markSpritesChanged([1, 2])
      expect(useSpriteStore.getState().changedSpriteIds).toBe(before)
    })
  })

  describe('clearChangedSprites', () => {
    it('clears all changed sprite ids', () => {
      useSpriteStore.getState().markSpritesChanged([1, 2, 3])
      useSpriteStore.getState().clearChangedSprites()
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
    })
  })

  // =========================================================================
  // Operations
  // =========================================================================

  describe('startOperation', () => {
    it('starts an operation with sprite ids', () => {
      useSpriteStore.getState().startOperation('import', [10, 20, 30])
      const op = useSpriteStore.getState().pendingOperation
      expect(op).not.toBeNull()
      expect(op!.type).toBe('import')
      expect(op!.spriteIds).toEqual([10, 20, 30])
      expect(op!.total).toBe(3)
      expect(op!.completed).toBe(0)
    })

    it('copies the sprite ids array', () => {
      const ids = [1, 2]
      useSpriteStore.getState().startOperation('export', ids)
      ids.push(99)
      expect(useSpriteStore.getState().pendingOperation!.spriteIds).toEqual([1, 2])
    })
  })

  describe('updateOperationProgress', () => {
    it('updates completed count', () => {
      useSpriteStore.getState().startOperation('replace', [1, 2, 3])
      useSpriteStore.getState().updateOperationProgress(2)
      expect(useSpriteStore.getState().pendingOperation!.completed).toBe(2)
    })

    it('is a no-op when no operation is pending', () => {
      useSpriteStore.getState().updateOperationProgress(5)
      expect(useSpriteStore.getState().pendingOperation).toBeNull()
    })
  })

  describe('completeOperation', () => {
    it('clears pending operation', () => {
      useSpriteStore.getState().startOperation('remove', [1])
      useSpriteStore.getState().completeOperation()
      expect(useSpriteStore.getState().pendingOperation).toBeNull()
    })
  })

  describe('cancelOperation', () => {
    it('clears pending operation', () => {
      useSpriteStore.getState().startOperation('import', [1])
      useSpriteStore.getState().cancelOperation()
      expect(useSpriteStore.getState().pendingOperation).toBeNull()
    })
  })

  // =========================================================================
  // Getters
  // =========================================================================

  describe('hasPendingOperation', () => {
    it('returns false when no operation', () => {
      expect(useSpriteStore.getState().hasPendingOperation()).toBe(false)
    })

    it('returns true when operation is pending', () => {
      useSpriteStore.getState().startOperation('import', [1])
      expect(useSpriteStore.getState().hasPendingOperation()).toBe(true)
    })
  })

  describe('getSpriteCount', () => {
    it('returns 0 when empty', () => {
      expect(useSpriteStore.getState().getSpriteCount()).toBe(0)
    })

    it('returns count of loaded sprites', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb],
          [3, 0xcc]
        ])
      )
      expect(useSpriteStore.getState().getSpriteCount()).toBe(3)
    })
  })

  describe('hasSprite', () => {
    it('returns false for non-existing sprite', () => {
      expect(useSpriteStore.getState().hasSprite(999)).toBe(false)
    })

    it('returns true for existing sprite', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[5, 0xaa]]))
      expect(useSpriteStore.getState().hasSprite(5)).toBe(true)
    })
  })

  describe('isSpriteChanged', () => {
    it('returns false for unchanged sprite', () => {
      expect(useSpriteStore.getState().isSpriteChanged(1)).toBe(false)
    })

    it('returns true for changed sprite', () => {
      useSpriteStore.getState().markSpriteChanged(1)
      expect(useSpriteStore.getState().isSpriteChanged(1)).toBe(true)
    })
  })

  // =========================================================================
  // Reset
  // =========================================================================

  describe('resetSpriteStore', () => {
    it('restores all defaults', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))
      useSpriteStore.getState().setCachedRender(1, 'data:url')
      useSpriteStore.getState().selectSprite(1)
      useSpriteStore.getState().markSpriteChanged(1)
      useSpriteStore.getState().startOperation('import', [1])
      useSpriteStore.getState().setCacheMaxSize(100)

      resetSpriteStore()

      const state = useSpriteStore.getState()
      expect(state.sprites.size).toBe(0)
      expect(state.renderedCache.size).toBe(0)
      expect(state.renderedCache.maxSize).toBe(2000)
      expect(state.selectedSpriteId).toBeNull()
      expect(state.selectedSpriteIds).toEqual([])
      expect(state.changedSpriteIds).toEqual([])
      expect(state.pendingOperation).toBeNull()
    })
  })

  // =========================================================================
  // Selectors
  // =========================================================================

  describe('selectors', () => {
    it('selectSprites returns sprites map', () => {
      const sprites = makeSpritesMap([[1, 0xaa]])
      useSpriteStore.getState().loadSprites(sprites)
      expect(selectSprites(useSpriteStore.getState()).size).toBe(1)
    })

    it('selectRenderedCache returns render cache', () => {
      useSpriteStore.getState().setCachedRender(1, 'data:url')
      expect(selectRenderedCache(useSpriteStore.getState()).get(1)).toBe('data:url')
    })

    it('selectSelectedSpriteId returns selected id', () => {
      useSpriteStore.getState().selectSprite(5)
      expect(selectSelectedSpriteId(useSpriteStore.getState())).toBe(5)
    })

    it('selectSelectedSpriteIds returns selected ids', () => {
      useSpriteStore.getState().selectSprites([1, 2])
      expect(selectSelectedSpriteIds(useSpriteStore.getState())).toEqual([1, 2])
    })

    it('selectChangedSpriteIds returns changed ids', () => {
      useSpriteStore.getState().markSpriteChanged(3)
      expect(selectChangedSpriteIds(useSpriteStore.getState())).toEqual([3])
    })

    it('selectPendingOperation returns operation', () => {
      useSpriteStore.getState().startOperation('export', [1])
      expect(selectPendingOperation(useSpriteStore.getState())!.type).toBe('export')
    })

    it('selectHasPendingOperation returns boolean', () => {
      expect(selectHasPendingOperation(useSpriteStore.getState())).toBe(false)
      useSpriteStore.getState().startOperation('import', [1])
      expect(selectHasPendingOperation(useSpriteStore.getState())).toBe(true)
    })

    it('selectSpriteStoreCount returns sprite count', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb]
        ])
      )
      expect(selectSpriteStoreCount(useSpriteStore.getState())).toBe(2)
    })

    it('selectHasChangedSprites returns boolean', () => {
      expect(selectHasChangedSprites(useSpriteStore.getState())).toBe(false)
      useSpriteStore.getState().markSpriteChanged(1)
      expect(selectHasChangedSprites(useSpriteStore.getState())).toBe(true)
    })
  })

  // =========================================================================
  // Integration scenarios
  // =========================================================================

  describe('integration', () => {
    it('full sprite workflow: load -> select -> modify -> save', () => {
      // Load sprites from project
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb],
          [3, 0xcc]
        ])
      )
      expect(useSpriteStore.getState().getSpriteCount()).toBe(3)

      // User selects a sprite
      useSpriteStore.getState().selectSprite(2)
      expect(useSpriteStore.getState().selectedSpriteId).toBe(2)

      // User replaces the sprite with new data
      useSpriteStore.getState().setSprite(2, makePixels(0xff))
      expect(useSpriteStore.getState().isSpriteChanged(2)).toBe(true)
      expect(useSpriteStore.getState().sprites.get(2)).toEqual(makePixels(0xff))

      // After save, clear changes
      useSpriteStore.getState().clearChangedSprites()
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
    })

    it('import operation workflow', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))

      // Start import operation
      useSpriteStore.getState().startOperation('import', [2, 3, 4])
      expect(useSpriteStore.getState().hasPendingOperation()).toBe(true)

      // Process each sprite
      useSpriteStore.getState().addSprite(makePixels(0xbb))
      useSpriteStore.getState().updateOperationProgress(1)
      useSpriteStore.getState().addSprite(makePixels(0xcc))
      useSpriteStore.getState().updateOperationProgress(2)
      useSpriteStore.getState().addSprite(makePixels(0xdd))
      useSpriteStore.getState().updateOperationProgress(3)

      // Complete
      useSpriteStore.getState().completeOperation()
      expect(useSpriteStore.getState().hasPendingOperation()).toBe(false)
      expect(useSpriteStore.getState().getSpriteCount()).toBe(4)
    })

    it('render cache and sprite modification interaction', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb]
        ])
      )

      // Cache renders
      useSpriteStore.getState().setCachedRender(1, 'data:sprite1')
      useSpriteStore.getState().setCachedRender(2, 'data:sprite2')
      expect(useSpriteStore.getState().renderedCache.size).toBe(2)

      // Modify sprite 1 - its cache should be invalidated
      useSpriteStore.getState().setSprite(1, makePixels(0xff))
      expect(useSpriteStore.getState().getCachedRender(1)).toBeUndefined()
      expect(useSpriteStore.getState().getCachedRender(2)).toBe('data:sprite2')

      // Re-cache sprite 1 with new render
      useSpriteStore.getState().setCachedRender(1, 'data:sprite1_v2')
      expect(useSpriteStore.getState().getCachedRender(1)).toBe('data:sprite1_v2')
    })

    it('batch replace preserves unrelated state', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb],
          [3, 0xcc]
        ])
      )
      useSpriteStore.getState().selectSprite(3)
      useSpriteStore.getState().setCachedRender(3, 'data:3')

      // Replace sprites 1 and 2
      useSpriteStore.getState().replaceSprites([
        [1, makePixels(0xdd)],
        [2, makePixels(0xee)]
      ])

      // Sprite 3 and its cache should be untouched
      expect(useSpriteStore.getState().sprites.get(3)).toEqual(makePixels(0xcc))
      expect(useSpriteStore.getState().getCachedRender(3)).toBe('data:3')
      // Selection should be preserved
      expect(useSpriteStore.getState().selectedSpriteId).toBe(3)
    })

    it('clearSprites resets everything including operation', () => {
      useSpriteStore.getState().loadSprites(makeSpritesMap([[1, 0xaa]]))
      useSpriteStore.getState().selectSprite(1)
      useSpriteStore.getState().setCachedRender(1, 'data:url')
      useSpriteStore.getState().markSpriteChanged(1)
      useSpriteStore.getState().startOperation('export', [1])

      useSpriteStore.getState().clearSprites()

      expect(useSpriteStore.getState().sprites.size).toBe(0)
      expect(useSpriteStore.getState().renderedCache.size).toBe(0)
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
      expect(useSpriteStore.getState().pendingOperation).toBeNull()
    })
  })

  // =========================================================================
  // Lazy loading via SpriteAccessor
  // =========================================================================

  describe('loadFromBuffer', () => {
    it('creates a SpriteAccessor from SPR buffer', () => {
      const buffer = makeSprBuffer([
        [1, 0xaa],
        [2, 0xbb]
      ])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().spriteAccessor).not.toBeNull()
    })

    it('sets totalSpriteCount from accessor', () => {
      const buffer = makeSprBuffer(
        [
          [1, 0xaa],
          [2, 0xbb]
        ],
        false,
        5
      )
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().totalSpriteCount).toBe(5)
    })

    it('clears overrides map', () => {
      useSpriteStore.getState().setSprite(99, makePixels(0xff))
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().sprites.size).toBe(0)
    })

    it('clears selection and changes', () => {
      useSpriteStore.getState().selectSprite(3)
      useSpriteStore.getState().markSpriteChanged(5)
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().selectedSpriteId).toBeNull()
      expect(useSpriteStore.getState().changedSpriteIds).toEqual([])
    })

    it('disposes previous accessor', () => {
      const buffer1 = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer1, false)
      const accessor1 = useSpriteStore.getState().spriteAccessor!
      const buffer2 = makeSprBuffer([[1, 0xbb]])
      useSpriteStore.getState().loadFromBuffer(buffer2, false)
      // Previous accessor disposed (get returns undefined)
      expect(accessor1.get(1)).toBeUndefined()
    })
  })

  describe('getSprite with accessor', () => {
    it('returns sprite from accessor when no override', () => {
      const buffer = makeSprBuffer([
        [1, 0xaa],
        [2, 0xbb]
      ])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      const result = useSpriteStore.getState().getSprite(1)
      expect(result).toEqual(makePixels(0xaa))
    })

    it('returns override sprite when present', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().setSprite(1, makePixels(0xff))
      expect(useSpriteStore.getState().getSprite(1)).toEqual(makePixels(0xff))
    })

    it('returns undefined for deleted sprite', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      expect(useSpriteStore.getState().getSprite(1)).toBeUndefined()
    })
  })

  describe('hasSprite with accessor', () => {
    it('returns true for accessor sprite', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().hasSprite(1)).toBe(true)
    })

    it('returns false for deleted accessor sprite', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      expect(useSpriteStore.getState().hasSprite(1)).toBe(false)
    })

    it('returns true for override sprite', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().setSprite(99, makePixels(0xff))
      expect(useSpriteStore.getState().hasSprite(99)).toBe(true)
    })
  })

  describe('getAllSprites', () => {
    it('materializes all sprites from accessor', () => {
      const buffer = makeSprBuffer(
        [
          [1, 0xaa],
          [3, 0xcc]
        ],
        false,
        4
      )
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      const all = useSpriteStore.getState().getAllSprites()
      expect(all.size).toBe(2)
      expect(all.get(1)).toEqual(makePixels(0xaa))
      expect(all.get(3)).toEqual(makePixels(0xcc))
    })

    it('includes overrides on top of accessor data', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().setSprite(1, makePixels(0xff))
      useSpriteStore.getState().setSprite(99, makePixels(0xee))
      const all = useSpriteStore.getState().getAllSprites()
      expect(all.get(1)).toEqual(makePixels(0xff)) // override
      expect(all.get(99)).toEqual(makePixels(0xee)) // new
    })

    it('excludes deleted sprites', () => {
      const buffer = makeSprBuffer([
        [1, 0xaa],
        [2, 0xbb]
      ])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      const all = useSpriteStore.getState().getAllSprites()
      expect(all.has(1)).toBe(false)
      expect(all.has(2)).toBe(true)
    })

    it('works with loadSprites (no accessor)', () => {
      useSpriteStore.getState().loadSprites(
        makeSpritesMap([
          [1, 0xaa],
          [2, 0xbb]
        ])
      )
      const all = useSpriteStore.getState().getAllSprites()
      expect(all.size).toBe(2)
    })
  })

  describe('getSpriteCount with accessor', () => {
    it('returns accessor count when no overrides', () => {
      const buffer = makeSprBuffer([[1, 0xaa]], false, 5)
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(useSpriteStore.getState().getSpriteCount()).toBe(5)
    })

    it('includes new overrides beyond accessor range', () => {
      const buffer = makeSprBuffer([[1, 0xaa]], false, 3)
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().setSprite(10, makePixels(0xff)) // beyond accessor range
      expect(useSpriteStore.getState().getSpriteCount()).toBe(4)
    })

    it('excludes deleted sprites', () => {
      const buffer = makeSprBuffer(
        [
          [1, 0xaa],
          [2, 0xbb]
        ],
        false,
        3
      )
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      expect(useSpriteStore.getState().getSpriteCount()).toBe(2)
    })
  })

  describe('addSprite with accessor', () => {
    it('returns next id after accessor spriteCount', () => {
      const buffer = makeSprBuffer([[1, 0xaa]], false, 5)
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      const newId = useSpriteStore.getState().addSprite(makePixels(0xcc))
      expect(newId).toBe(6)
    })
  })

  describe('removeSprite with accessor', () => {
    it('tracks deleted sprite in deletedSpriteIds', () => {
      const buffer = makeSprBuffer([
        [1, 0xaa],
        [2, 0xbb]
      ])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      expect(useSpriteStore.getState().deletedSpriteIds.has(1)).toBe(true)
    })

    it('un-deletes sprite when set again', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      useSpriteStore.getState().setSprite(1, makePixels(0xff))
      expect(useSpriteStore.getState().deletedSpriteIds.has(1)).toBe(false)
      expect(useSpriteStore.getState().getSprite(1)).toEqual(makePixels(0xff))
    })
  })

  describe('selectSpriteAccessor', () => {
    it('returns null when no accessor', () => {
      expect(selectSpriteAccessor(useSpriteStore.getState())).toBeNull()
    })

    it('returns accessor when loaded from buffer', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      expect(selectSpriteAccessor(useSpriteStore.getState())).not.toBeNull()
    })
  })

  describe('clearSprites disposes accessor', () => {
    it('sets spriteAccessor to null', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().clearSprites()
      expect(useSpriteStore.getState().spriteAccessor).toBeNull()
    })

    it('clears deletedSpriteIds', () => {
      const buffer = makeSprBuffer([[1, 0xaa]])
      useSpriteStore.getState().loadFromBuffer(buffer, false)
      useSpriteStore.getState().removeSprite(1)
      useSpriteStore.getState().clearSprites()
      expect(useSpriteStore.getState().deletedSpriteIds.size).toBe(0)
    })
  })
})
