import { describe, expect, it, vi } from 'vitest'
import { compressPixels } from '../../services/spr'
import { createFrameGroup, type FrameGroup } from '../../types'
import { getEffectPreviewFrameIndex } from '../effect-preview-frame'

function pixelsWithVisiblePixels(entries: Array<{ index: number; alpha?: number }>): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  for (const entry of entries) {
    const offset = entry.index * 4
    pixels[offset] = entry.alpha ?? 0xff
    pixels[offset + 1] = 0xaa
    pixels[offset + 2] = 0xbb
    pixels[offset + 3] = 0xcc
  }
  return pixels
}

function makeFrameGroup(spriteIds: number[], opts: Partial<FrameGroup> = {}): FrameGroup {
  const fg = createFrameGroup()
  fg.frames = spriteIds.length
  fg.spriteIndex = spriteIds
  return { ...fg, ...opts }
}

describe('getEffectPreviewFrameIndex', () => {
  it('returns frame 0 in first-frame mode without reading sprites', () => {
    const getSprite = vi.fn()

    const frame = getEffectPreviewFrameIndex(makeFrameGroup([1, 2, 3]), 'first', getSprite, false)

    expect(frame).toBe(0)
    expect(getSprite).not.toHaveBeenCalled()
  })

  it('chooses the frame with the most visible compressed pixels', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithVisiblePixels([{ index: 0 }]), false)],
      [
        2,
        compressPixels(
          pixelsWithVisiblePixels([{ index: 0 }, { index: 1 }, { index: 2 }]),
          false
        )
      ],
      [3, compressPixels(pixelsWithVisiblePixels([{ index: 0 }, { index: 1 }]), false)]
    ])

    const frame = getEffectPreviewFrameIndex(
      makeFrameGroup([1, 2, 3]),
      'largest',
      (id) => sprites.get(id),
      false
    )

    expect(frame).toBe(1)
  })

  it('keeps the earliest frame when scores tie', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithVisiblePixels([{ index: 0 }, { index: 1 }]), false)],
      [2, compressPixels(pixelsWithVisiblePixels([{ index: 0 }, { index: 1 }]), false)]
    ])

    const frame = getEffectPreviewFrameIndex(
      makeFrameGroup([1, 2]),
      'largest',
      (id) => sprites.get(id),
      false
    )

    expect(frame).toBe(0)
  })

  it('falls back to frame 0 when all sprites are missing or empty', () => {
    const sprites = new Map([[2, new Uint8Array()]])

    const frame = getEffectPreviewFrameIndex(
      makeFrameGroup([1, 2, 3]),
      'largest',
      (id) => sprites.get(id),
      false
    )

    expect(frame).toBe(0)
  })

  it('scores transparent sprites by alpha instead of colored-pixel count', () => {
    const sprites = new Map([
      [
        1,
        compressPixels(
          pixelsWithVisiblePixels([
            { index: 0, alpha: 0x10 },
            { index: 1, alpha: 0x10 }
          ]),
          true
        )
      ],
      [2, compressPixels(pixelsWithVisiblePixels([{ index: 0, alpha: 0xff }]), true)]
    ])

    const frame = getEffectPreviewFrameIndex(
      makeFrameGroup([1, 2]),
      'largest',
      (id) => sprites.get(id),
      true
    )

    expect(frame).toBe(1)
  })
})
