import { beforeEach, describe, expect, it } from 'vitest'
import { compressPixels } from '../../services/spr'
import { createFrameGroup, createThingType, ThingCategory, type FrameGroup } from '../../types'
import { clearEffectColorAnalysisCache, getEffectDominantColorBucket } from '../effect-dominant-color'

function pixelsWithColor(
  red: number,
  green: number,
  blue: number,
  count: number,
  alpha = 0xff
): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  for (let index = 0; index < count; index++) {
    const offset = index * 4
    pixels[offset] = alpha
    pixels[offset + 1] = red
    pixels[offset + 2] = green
    pixels[offset + 3] = blue
  }
  return pixels
}

function pixelsWithRuns(
  runs: Array<{ red: number; green: number; blue: number; count: number; alpha?: number }>
): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  let index = 0
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) {
      const offset = index * 4
      pixels[offset] = run.alpha ?? 0xff
      pixels[offset + 1] = run.red
      pixels[offset + 2] = run.green
      pixels[offset + 3] = run.blue
      index++
    }
  }
  return pixels
}

function makeEffect(spriteIds: number[], opts: Partial<FrameGroup> = {}, id = 1) {
  const thing = createThingType()
  thing.id = id
  thing.category = ThingCategory.EFFECT
  const fg = createFrameGroup()
  fg.frames = spriteIds.length
  fg.spriteIndex = spriteIds
  thing.frameGroups[0] = { ...fg, ...opts }
  return thing
}

describe('getEffectDominantColorBucket', () => {
  beforeEach(() => {
    clearEffectColorAnalysisCache()
  })

  it('classifies common palette colors from compressed sprite pixels', () => {
    const cases = [
      { rgb: [255, 0, 0], bucket: 'red' },
      { rgb: [255, 128, 0], bucket: 'orange' },
      { rgb: [255, 230, 0], bucket: 'yellow' },
      { rgb: [0, 220, 0], bucket: 'green' },
      { rgb: [0, 220, 220], bucket: 'cyan' },
      { rgb: [0, 64, 255], bucket: 'blue' },
      { rgb: [128, 0, 255], bucket: 'purple' },
      { rgb: [255, 0, 180], bucket: 'pink' }
    ] as const

    for (const [index, { rgb, bucket }] of cases.entries()) {
      const sprite = compressPixels(pixelsWithColor(rgb[0], rgb[1], rgb[2], 4), false)

      expect(
        getEffectDominantColorBucket(
          makeEffect([1], {}, index + 1),
          (id) => (id === 1 ? sprite : undefined),
          false
        )
      ).toBe(bucket)
    }
  })

  it('uses the largest frame instead of frame 0', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithColor(120, 120, 120, 1), false)],
      [2, compressPixels(pixelsWithColor(0, 64, 255, 4), false)]
    ])

    const bucket = getEffectDominantColorBucket(
      makeEffect([1, 2]),
      (id) => sprites.get(id),
      false
    )

    expect(bucket).toBe('blue')
  })

  it('classifies the largest frame by chromatic color when neutral glow dominates pixel count', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithColor(120, 120, 120, 1), false)],
      [
        2,
        compressPixels(
          pixelsWithRuns([
            { red: 240, green: 240, blue: 240, count: 80 },
            { red: 0, green: 96, blue: 255, count: 6 }
          ]),
          false
        )
      ]
    ])

    const bucket = getEffectDominantColorBucket(
      makeEffect([1, 2]),
      (id) => sprites.get(id),
      false
    )

    expect(bucket).toBe('blue')
  })

  it('classifies red and green chromatic pixels even with stronger neutral glow', () => {
    const cases = [
      { rgb: [255, 32, 32], bucket: 'red' },
      { rgb: [32, 220, 32], bucket: 'green' }
    ] as const

    for (const [index, { rgb, bucket }] of cases.entries()) {
      const sprite = compressPixels(
        pixelsWithRuns([
          { red: 235, green: 235, blue: 235, count: 80 },
          { red: rgb[0], green: rgb[1], blue: rgb[2], count: 6 }
        ]),
        false
      )

      expect(
        getEffectDominantColorBucket(
          makeEffect([1], {}, index + 10),
          (id) => (id === 1 ? sprite : undefined),
          false
        )
      ).toBe(bucket)
    }
  })

  it('keeps purely white gray and black sprites neutral', () => {
    const cases = [
      [245, 245, 245],
      [120, 120, 120],
      [12, 12, 12]
    ] as const

    for (const [index, rgb] of cases.entries()) {
      const sprite = compressPixels(pixelsWithColor(rgb[0], rgb[1], rgb[2], 12), false)

      expect(
        getEffectDominantColorBucket(
          makeEffect([1], {}, index + 20),
          (id) => (id === 1 ? sprite : undefined),
          false
        )
      ).toBe('neutral')
    }
  })

  it('ignores missing and empty sprites and falls back to neutral', () => {
    const sprites = new Map([[2, new Uint8Array()]])

    const bucket = getEffectDominantColorBucket(
      makeEffect([1, 2, 3]),
      (id) => sprites.get(id),
      false
    )

    expect(bucket).toBe('neutral')
  })

  it('weights transparent sprite colors by alpha', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithColor(255, 0, 0, 8, 0x10), true)],
      [2, compressPixels(pixelsWithColor(0, 64, 255, 2, 0xff), true)]
    ])

    const bucket = getEffectDominantColorBucket(
      makeEffect([1, 2], { frames: 1, width: 2, spriteIndex: [1, 2] }),
      (id) => sprites.get(id),
      true
    )

    expect(bucket).toBe('blue')
  })

  it('keeps deterministic color ordering when bucket weights tie', () => {
    const sprites = new Map([
      [1, compressPixels(pixelsWithColor(255, 0, 0, 1), false)],
      [2, compressPixels(pixelsWithColor(0, 64, 255, 1), false)]
    ])

    const bucket = getEffectDominantColorBucket(
      makeEffect([1, 2], { frames: 1, width: 2, spriteIndex: [1, 2] }),
      (id) => sprites.get(id),
      false
    )

    expect(bucket).toBe('red')
  })
})
