import { describe, it, expect } from 'vitest'
import {
  compressPixels,
  uncompressPixels,
  getRGBData,
  argbToRgba,
  rgbaToArgb
} from '../sprite-pixels'
import { readSpr, isSpriteEmpty } from '../spr-reader'
import { writeSpr } from '../spr-writer'
import { SPRITE_DEFAULT_DATA_SIZE, SPRITE_DEFAULT_SIZE } from '../../../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create ARGB pixel data with a single colored pixel at (x, y). */
function makePixelsWithDot(
  x: number,
  y: number,
  a: number,
  r: number,
  g: number,
  b: number
): Uint8Array {
  const pixels = new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
  const off = (y * SPRITE_DEFAULT_SIZE + x) * 4
  pixels[off] = a
  pixels[off + 1] = r
  pixels[off + 2] = g
  pixels[off + 3] = b
  return pixels
}

/** Create fully transparent pixels (all zeros). */
function makeTransparentPixels(): Uint8Array {
  return new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
}

/** Create solid colored block of pixels. */
function makeSolidPixels(a: number, r: number, g: number, b: number): Uint8Array {
  const pixels = new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
  for (let i = 0; i < SPRITE_DEFAULT_DATA_SIZE; i += 4) {
    pixels[i] = a
    pixels[i + 1] = r
    pixels[i + 2] = g
    pixels[i + 3] = b
  }
  return pixels
}

// ===========================================================================
// sprite-pixels: compressPixels / uncompressPixels
// ===========================================================================

describe('compressPixels / uncompressPixels', () => {
  it('round-trips fully transparent pixels (RGB mode)', () => {
    const pixels = makeTransparentPixels()
    const compressed = compressPixels(pixels, false)
    expect(compressed.length).toBe(0)

    const decompressed = uncompressPixels(compressed, false)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips fully transparent pixels (RGBA mode)', () => {
    const pixels = makeTransparentPixels()
    const compressed = compressPixels(pixels, true)
    expect(compressed.length).toBe(0)

    const decompressed = uncompressPixels(compressed, true)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips solid colored pixels (RGB mode)', () => {
    const pixels = makeSolidPixels(0xff, 0x80, 0x40, 0x20)
    const compressed = compressPixels(pixels, false)
    expect(compressed.length).toBeGreaterThan(0)

    const decompressed = uncompressPixels(compressed, false)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips solid colored pixels (RGBA mode)', () => {
    const pixels = makeSolidPixels(0xcc, 0x80, 0x40, 0x20)
    const compressed = compressPixels(pixels, true)
    expect(compressed.length).toBeGreaterThan(0)

    const decompressed = uncompressPixels(compressed, true)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips single pixel at (0,0)', () => {
    const pixels = makePixelsWithDot(0, 0, 0xff, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(pixels, false)
    const decompressed = uncompressPixels(compressed, false)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips single pixel at center (15,15)', () => {
    const pixels = makePixelsWithDot(15, 15, 0xff, 0x11, 0x22, 0x33)
    const compressed = compressPixels(pixels, false)
    const decompressed = uncompressPixels(compressed, false)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips single pixel at last position (31,31)', () => {
    const pixels = makePixelsWithDot(31, 31, 0xff, 0xde, 0xad, 0xbe)
    const compressed = compressPixels(pixels, true)
    const decompressed = uncompressPixels(compressed, true)
    expect(decompressed).toEqual(pixels)
  })

  it('round-trips alternating transparent and colored rows', () => {
    const pixels = new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
    for (let y = 0; y < SPRITE_DEFAULT_SIZE; y++) {
      if (y % 2 === 0) {
        for (let x = 0; x < SPRITE_DEFAULT_SIZE; x++) {
          const off = (y * SPRITE_DEFAULT_SIZE + x) * 4
          pixels[off] = 0xff
          pixels[off + 1] = 0x10
          pixels[off + 2] = 0x20
          pixels[off + 3] = 0x30
        }
      }
    }
    const compressed = compressPixels(pixels, false)
    const decompressed = uncompressPixels(compressed, false)
    expect(decompressed).toEqual(pixels)
  })

  it('handles transparency mode preserving alpha values', () => {
    const pixels = makePixelsWithDot(5, 5, 0x80, 0xff, 0x00, 0xff)
    const compressed = compressPixels(pixels, true)
    const decompressed = uncompressPixels(compressed, true)
    expect(decompressed).toEqual(pixels)

    // Verify alpha is preserved
    const off = (5 * SPRITE_DEFAULT_SIZE + 5) * 4
    expect(decompressed[off]).toBe(0x80)
  })

  it('RGB mode forces alpha to 0xFF on decompression', () => {
    // Original pixel has alpha=0x80 which is non-zero, so color != 0
    const pixels = makePixelsWithDot(0, 0, 0x80, 0xff, 0x00, 0x00)
    const compressed = compressPixels(pixels, false) // alpha discarded
    const decompressed = uncompressPixels(compressed, false) // alpha = 0xFF

    expect(decompressed[0]).toBe(0xff) // A forced to 0xFF
    expect(decompressed[1]).toBe(0xff) // R preserved
    expect(decompressed[2]).toBe(0x00) // G preserved
    expect(decompressed[3]).toBe(0x00) // B preserved
  })

  it('RGBA mode produces larger compressed data than RGB', () => {
    const pixels = makeSolidPixels(0x80, 0xaa, 0xbb, 0xcc)
    const compRgb = compressPixels(pixels, false)
    const compRgba = compressPixels(pixels, true)
    // RGBA stores 4 bytes per pixel instead of 3
    expect(compRgba.length).toBeGreaterThan(compRgb.length)
  })

  it('throws on invalid pixel length', () => {
    expect(() => compressPixels(new Uint8Array(100), false)).toThrow()
  })

  it('handles complex alternating pattern', () => {
    const pixels = new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
    for (let i = 0; i < SPRITE_DEFAULT_DATA_SIZE; i += 4) {
      const idx = i / 4
      if (idx % 3 !== 0) {
        pixels[i] = 0xff
        pixels[i + 1] = (idx * 7) & 0xff
        pixels[i + 2] = (idx * 13) & 0xff
        pixels[i + 3] = (idx * 19) & 0xff
      }
    }
    const compressed = compressPixels(pixels, true)
    const decompressed = uncompressPixels(compressed, true)
    expect(decompressed).toEqual(pixels)
  })
})

// ===========================================================================
// sprite-pixels: getRGBData
// ===========================================================================

describe('getRGBData', () => {
  it('returns all 0x11 for empty compressed data', () => {
    const rgb = getRGBData(new Uint8Array(0), false)
    expect(rgb.length).toBe(SPRITE_DEFAULT_SIZE * SPRITE_DEFAULT_SIZE * 3)
    expect(rgb.every((b) => b === 0x11)).toBe(true)
  })

  it('returns RGB values for solid colored sprite', () => {
    const pixels = makeSolidPixels(0xff, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(pixels, false)
    const rgb = getRGBData(compressed, false)

    expect(rgb[0]).toBe(0xaa) // R
    expect(rgb[1]).toBe(0xbb) // G
    expect(rgb[2]).toBe(0xcc) // B
  })

  it('uses 0x11 for transparent pixel regions', () => {
    const pixels = makePixelsWithDot(1, 0, 0xff, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(pixels, false)
    const rgb = getRGBData(compressed, false)

    // Pixel (0,0) is transparent
    expect(rgb[0]).toBe(0x11)
    expect(rgb[1]).toBe(0x11)
    expect(rgb[2]).toBe(0x11)

    // Pixel (1,0) is colored
    expect(rgb[3]).toBe(0xaa)
    expect(rgb[4]).toBe(0xbb)
    expect(rgb[5]).toBe(0xcc)
  })

  it('handles transparent mode (skips alpha in compressed)', () => {
    const pixels = makeSolidPixels(0x80, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(pixels, true)
    const rgb = getRGBData(compressed, true)

    expect(rgb[0]).toBe(0xaa)
    expect(rgb[1]).toBe(0xbb)
    expect(rgb[2]).toBe(0xcc)
  })
})

// ===========================================================================
// sprite-pixels: ARGB <-> RGBA conversion
// ===========================================================================

describe('argbToRgba / rgbaToArgb', () => {
  it('converts ARGB to RGBA', () => {
    const argb = new Uint8Array([0xff, 0xaa, 0xbb, 0xcc])
    const rgba = argbToRgba(argb)
    expect(rgba[0]).toBe(0xaa) // R
    expect(rgba[1]).toBe(0xbb) // G
    expect(rgba[2]).toBe(0xcc) // B
    expect(rgba[3]).toBe(0xff) // A
  })

  it('converts RGBA to ARGB', () => {
    const rgba = new Uint8ClampedArray([0xaa, 0xbb, 0xcc, 0xff])
    const argb = rgbaToArgb(rgba)
    expect(argb[0]).toBe(0xff) // A
    expect(argb[1]).toBe(0xaa) // R
    expect(argb[2]).toBe(0xbb) // G
    expect(argb[3]).toBe(0xcc) // B
  })

  it('round-trips ARGB -> RGBA -> ARGB', () => {
    const original = makeSolidPixels(0x80, 0xaa, 0xbb, 0xcc)
    const rgba = argbToRgba(original)
    const roundTripped = rgbaToArgb(rgba)
    expect(roundTripped).toEqual(original)
  })

  it('returns Uint8ClampedArray from argbToRgba', () => {
    const argb = new Uint8Array(4)
    const result = argbToRgba(argb)
    expect(result).toBeInstanceOf(Uint8ClampedArray)
  })

  it('handles multiple pixels', () => {
    const argb = new Uint8Array([
      0xff,
      0x10,
      0x20,
      0x30, // pixel 1: A=0xFF, R=0x10, G=0x20, B=0x30
      0x80,
      0x40,
      0x50,
      0x60 // pixel 2: A=0x80, R=0x40, G=0x50, B=0x60
    ])
    const rgba = argbToRgba(argb)
    // pixel 1
    expect(rgba[0]).toBe(0x10)
    expect(rgba[1]).toBe(0x20)
    expect(rgba[2]).toBe(0x30)
    expect(rgba[3]).toBe(0xff)
    // pixel 2
    expect(rgba[4]).toBe(0x40)
    expect(rgba[5]).toBe(0x50)
    expect(rgba[6]).toBe(0x60)
    expect(rgba[7]).toBe(0x80)
  })
})

// ===========================================================================
// SPR reader / writer round-trip
// ===========================================================================

describe('readSpr / writeSpr round-trip', () => {
  it('round-trips empty SPR file (non-extended)', () => {
    const sprites = new Map<number, Uint8Array>()
    const written = writeSpr({ signature: 0x12345678, spriteCount: 0, sprites }, false)
    const result = readSpr(written, false)

    expect(result.signature).toBe(0x12345678)
    expect(result.spriteCount).toBe(0)
    expect(result.sprites.size).toBe(0)
  })

  it('round-trips empty SPR file (extended)', () => {
    const sprites = new Map<number, Uint8Array>()
    const written = writeSpr({ signature: 0xaabbccdd, spriteCount: 0, sprites }, true)
    const result = readSpr(written, true)

    expect(result.signature).toBe(0xaabbccdd)
    expect(result.spriteCount).toBe(0)
    expect(result.sprites.size).toBe(0)
  })

  it('round-trips single colored sprite (non-extended)', () => {
    const pixels = makeSolidPixels(0xff, 0xaa, 0x55, 0x33)
    const compressed = compressPixels(pixels, false)

    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressed)

    const written = writeSpr({ signature: 0x11223344, spriteCount: 1, sprites }, false)
    const result = readSpr(written, false)

    expect(result.signature).toBe(0x11223344)
    expect(result.spriteCount).toBe(1)
    expect(result.sprites.size).toBe(1)
    expect(result.sprites.get(1)).toEqual(compressed)
  })

  it('round-trips multiple sprites with gaps (empty sprites)', () => {
    const comp1 = compressPixels(makeSolidPixels(0xff, 0x10, 0x20, 0x30), false)
    const comp3 = compressPixels(makePixelsWithDot(0, 0, 0xff, 0xaa, 0xbb, 0xcc), false)

    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, comp1)
    // sprite 2 is empty
    sprites.set(3, comp3)

    const written = writeSpr({ signature: 0x55667788, spriteCount: 3, sprites }, false)
    const result = readSpr(written, false)

    expect(result.spriteCount).toBe(3)
    expect(result.sprites.size).toBe(2)
    expect(result.sprites.get(1)).toEqual(comp1)
    expect(result.sprites.has(2)).toBe(false)
    expect(result.sprites.get(3)).toEqual(comp3)
  })

  it('round-trips extended format with many sprites', () => {
    const sprites = new Map<number, Uint8Array>()
    for (let id = 1; id <= 10; id++) {
      const pixels = makePixelsWithDot(id % 32, id % 32, 0xff, id * 10, id * 20, id * 5)
      sprites.set(id, compressPixels(pixels, false))
    }

    const written = writeSpr({ signature: 0xdeadbeef, spriteCount: 10, sprites }, true)
    const result = readSpr(written, true)

    expect(result.signature).toBe(0xdeadbeef)
    expect(result.spriteCount).toBe(10)
    expect(result.sprites.size).toBe(10)

    for (let id = 1; id <= 10; id++) {
      expect(result.sprites.get(id)).toEqual(sprites.get(id))
    }
  })

  it('rejects non-extended sprite count above 0xFFFE', () => {
    const sprites = new Map<number, Uint8Array>()
    expect(() => writeSpr({ signature: 0x1, spriteCount: 0xffff, sprites }, false)).toThrow(
      /extended/i
    )
  })

  it('preserves complex compressed pixel data through file round-trip', () => {
    const pixels = new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
    for (let i = 0; i < SPRITE_DEFAULT_DATA_SIZE; i += 4) {
      const idx = i / 4
      if (idx % 3 !== 0) {
        pixels[i] = 0xff
        pixels[i + 1] = (idx * 7) & 0xff
        pixels[i + 2] = (idx * 13) & 0xff
        pixels[i + 3] = (idx * 19) & 0xff
      }
    }

    const compressed = compressPixels(pixels, true)
    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressed)

    const written = writeSpr({ signature: 0x42, spriteCount: 1, sprites }, false)
    const result = readSpr(written, false)

    expect(result.sprites.get(1)).toEqual(compressed)

    // Verify full decompress round-trip
    const decompressed = uncompressPixels(result.sprites.get(1)!, true)
    expect(decompressed).toEqual(pixels)
  })

  it('rejects compressed sprite payloads that cannot fit in the SPR length field', () => {
    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, new Uint8Array(0x1_0000))

    expect(() => writeSpr({ signature: 0x42, spriteCount: 1, sprites }, true)).toThrow(
      /too large/i
    )
  })

  it('rejects files whose sprite offsets would exceed uint32', () => {
    const compressed = new Uint8Array(0xffff)
    const sprites = { get: () => compressed } as unknown as Map<number, Uint8Array>

    expect(() => writeSpr({ signature: 0x42, spriteCount: 66_000, sprites }, true)).toThrow(
      /too large/i
    )
  })
})

// ===========================================================================
// isSpriteEmpty
// ===========================================================================

describe('isSpriteEmpty', () => {
  it('returns true for empty sprites (no address)', () => {
    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressPixels(makeSolidPixels(0xff, 0x10, 0x20, 0x30), false))

    const buffer = writeSpr({ signature: 0x1, spriteCount: 2, sprites }, false)
    expect(isSpriteEmpty(buffer, 2, false)).toBe(true)
  })

  it('returns false for non-empty sprites', () => {
    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressPixels(makeSolidPixels(0xff, 0x10, 0x20, 0x30), false))

    const buffer = writeSpr({ signature: 0x1, spriteCount: 1, sprites }, false)
    expect(isSpriteEmpty(buffer, 1, false)).toBe(false)
  })
})

// ===========================================================================
// Full pipeline: compress -> SPR write -> SPR read -> decompress -> canvas
// ===========================================================================

describe('full pipeline', () => {
  it('preserves pixel data through full SPR pipeline (RGB mode)', () => {
    const originalPixels = makeSolidPixels(0xff, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(originalPixels, false)

    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressed)

    const sprBuffer = writeSpr({ signature: 0x42, spriteCount: 1, sprites }, false)
    const result = readSpr(sprBuffer, false)
    const decompressed = uncompressPixels(result.sprites.get(1)!, false)

    expect(decompressed).toEqual(originalPixels)
  })

  it('preserves pixel data through full SPR pipeline (RGBA mode)', () => {
    const originalPixels = makeSolidPixels(0x80, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(originalPixels, true)

    const sprites = new Map<number, Uint8Array>()
    sprites.set(1, compressed)

    const sprBuffer = writeSpr({ signature: 0x42, spriteCount: 1, sprites }, true)
    const result = readSpr(sprBuffer, true)
    const decompressed = uncompressPixels(result.sprites.get(1)!, true)

    expect(decompressed).toEqual(originalPixels)
  })

  it('converts to RGBA for canvas rendering and back', () => {
    const originalArgb = makeSolidPixels(0x80, 0xaa, 0xbb, 0xcc)
    const compressed = compressPixels(originalArgb, true)
    const decompressed = uncompressPixels(compressed, true)

    const rgba = argbToRgba(decompressed)
    expect(rgba[0]).toBe(0xaa) // R
    expect(rgba[1]).toBe(0xbb) // G
    expect(rgba[2]).toBe(0xcc) // B
    expect(rgba[3]).toBe(0x80) // A

    const backToArgb = rgbaToArgb(rgba)
    expect(backToArgb).toEqual(originalArgb)
  })

  it('end-to-end: pixels -> compress -> SPR -> read -> decompress -> RGBA -> ARGB', () => {
    const originalPixels = makePixelsWithDot(10, 20, 0xcc, 0xdd, 0xee, 0xff)
    const compressed = compressPixels(originalPixels, true)

    const sprites = new Map<number, Uint8Array>()
    sprites.set(5, compressed)

    const sprBuffer = writeSpr({ signature: 0x99, spriteCount: 5, sprites }, true)
    const sprResult = readSpr(sprBuffer, true)

    const decompressed = uncompressPixels(sprResult.sprites.get(5)!, true)
    const rgba = argbToRgba(decompressed)
    const finalArgb = rgbaToArgb(rgba)

    expect(finalArgb).toEqual(originalPixels)
  })
})
