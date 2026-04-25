import { describe, expect, it } from 'vitest'
import {
  PXG_RUNTIME_FLAGS,
  hasPxgRuntimeFlag,
  parsePxgRuntimeFlags,
  parsePxgRuntimeMetadata
} from '../pxg-runtime'

function makeMetadataBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(16 + 32)
  const view = new DataView(buffer)
  view.setUint32(0, 67575, true)
  view.setUint32(4, 10740, true)
  view.setUint32(8, 5930, true)
  view.setUint32(12, 723, true)
  view.setUint32(16, 2, true)
  view.setUint32(20, 3, true)
  view.setUint32(24, 28, true)
  view.setUint32(28, 4, true)
  view.setUint32(32, 5, true)
  view.setUint32(36, 6, true)
  view.setUint32(40, 7, true)
  view.setUint32(44, 8, true)
  return buffer
}

function makeFlagsBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(16 + 16)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46475850, true)
  view.setUint32(4, 1, true)
  view.setUint32(8, 100, true)
  view.setUint32(12, 1, true)
  view.setUint32(16, 1 << PXG_RUNTIME_FLAGS.GROUND, true)
  view.setUint32(20, 1 << (PXG_RUNTIME_FLAGS.MINI_MAP - 32), true)
  view.setUint16(24, 180, true)
  view.setUint16(26, 321, true)
  return buffer
}

describe('PXG runtime parsers', () => {
  it('parses runtime metadata header and texture records', () => {
    const metadata = parsePxgRuntimeMetadata(makeMetadataBuffer())

    expect(metadata.maxItemId).toBe(67575)
    expect(metadata.maxOutfitId).toBe(10740)
    expect(metadata.maxEffectId).toBe(5930)
    expect(metadata.maxMissileId).toBe(723)
    expect(metadata.textures).toEqual([
      {
        width: 2,
        height: 3,
        exactSize: 28,
        layers: 4,
        patternX: 5,
        patternY: 6,
        patternZ: 7,
        frames: 8
      }
    ])
  })

  it('parses runtime item flags and checks low/high flag words', () => {
    const flags = parsePxgRuntimeFlags(makeFlagsBuffer())
    const record = flags.records[0]

    expect(flags.maxItemId).toBe(100)
    expect(record.groundSpeed).toBe(180)
    expect(record.miniMapColor).toBe(321)
    expect(hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.GROUND)).toBe(true)
    expect(hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.MINI_MAP)).toBe(true)
    expect(hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.CONTAINER)).toBe(false)
  })

  it('rejects runtime flags with an invalid magic', () => {
    const buffer = makeFlagsBuffer()
    new DataView(buffer).setUint32(0, 0x12345678, true)

    expect(() => parsePxgRuntimeFlags(buffer)).toThrow(/PXGF/)
  })
})
