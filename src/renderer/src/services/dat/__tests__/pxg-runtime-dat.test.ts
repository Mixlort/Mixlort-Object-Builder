import { describe, expect, it } from 'vitest'
import { BinaryWriter, readDat } from '../index'
import { LAST_FLAG, ThingCategory, type ThingCategory as ThingCategoryType } from '../../../types'
import {
  PXG_RUNTIME_FLAGS,
  type PxgRuntimeFlags,
  type PxgRuntimeMetadata
} from '../../pxg-runtime'

function defaultDuration(_category: ThingCategoryType): number {
  return 250
}

function makeFeatures() {
  return {
    extended: true,
    transparency: true,
    improvedAnimations: true,
    frameGroups: true,
    metadataController: 'default',
    attributeServer: null
  }
}

function makeRuntimeMetadata(texture: PxgRuntimeMetadata['textures'][number]): PxgRuntimeMetadata {
  return {
    maxItemId: 100,
    maxOutfitId: 0,
    maxEffectId: 0,
    maxMissileId: 0,
    textures: [texture]
  }
}

function makeRuntimeFlags(): PxgRuntimeFlags {
  return {
    maxItemId: 100,
    records: [
      {
        flagsLo: (1 << PXG_RUNTIME_FLAGS.GROUND) | (1 << PXG_RUNTIME_FLAGS.CONTAINER),
        flagsHi: 1 << (PXG_RUNTIME_FLAGS.MINI_MAP - 32),
        groundSpeed: 140,
        miniMapColor: 88
      }
    ]
  }
}

function writeHeader(writer: BinaryWriter): void {
  writer.writeUint32(0x4a10)
  writer.writeUint16(99)
  writer.writeUint16(0)
  writer.writeUint16(0)
  writer.writeUint16(0)
}

describe('readDat with PXG runtime metadata', () => {
  it('uses runtime counts, maps PXG item axes, and applies runtime item flags', () => {
    const writer = new BinaryWriter()
    writeHeader(writer)
    writer.writeUint8(LAST_FLAG)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(4)
    writer.writeUint8(2)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(1)
    for (let id = 1; id <= 8; id++) writer.writeUint32(id)

    const result = readDat(writer.toArrayBuffer(), 1310, makeFeatures(), defaultDuration, {
      metadata: makeRuntimeMetadata({
        width: 0,
        height: 0,
        exactSize: 0,
        layers: 0,
        patternX: 0,
        patternY: 0,
        patternZ: 0,
        frames: 0
      }),
      flags: makeRuntimeFlags()
    })

    expect(result.maxItemId).toBe(100)
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    const frameGroup = item.frameGroups[0]!
    expect(item.category).toBe(ThingCategory.ITEM)
    expect(frameGroup.layers).toBe(1)
    expect(frameGroup.patternX).toBe(2)
    expect(frameGroup.patternY).toBe(4)
    expect(frameGroup.spriteIndex).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(item.isGround).toBe(true)
    expect(item.groundSpeed).toBe(140)
    expect(item.isContainer).toBe(true)
    expect(item.miniMap).toBe(true)
    expect(item.miniMapColor).toBe(88)
  })

  it('promotes runtime patternZ to animation frames and fills missing durations', () => {
    const writer = new BinaryWriter()
    writeHeader(writer)
    writer.writeUint8(LAST_FLAG)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(1)
    writer.writeUint8(3)
    writer.writeUint8(1)
    writer.writeUint32(11)
    writer.writeUint32(12)
    writer.writeUint32(13)

    const result = readDat(writer.toArrayBuffer(), 1310, makeFeatures(), defaultDuration, {
      metadata: makeRuntimeMetadata({
        width: 0,
        height: 0,
        exactSize: 0,
        layers: 0,
        patternX: 0,
        patternY: 0,
        patternZ: 3,
        frames: 0
      })
    })

    const frameGroup = result.items[0].frameGroups[0]!
    expect(frameGroup.patternZ).toBe(1)
    expect(frameGroup.frames).toBe(3)
    expect(frameGroup.spriteIndex).toEqual([11, 12, 13])
    expect(frameGroup.frameDurations).toEqual([
      { minimum: 250, maximum: 250 },
      { minimum: 250, maximum: 250 },
      { minimum: 250, maximum: 250 }
    ])
  })
})
