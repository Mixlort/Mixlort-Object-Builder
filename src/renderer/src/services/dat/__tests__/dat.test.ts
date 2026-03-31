import { describe, it, expect } from 'vitest'
import { BinaryReader, BinaryWriter, readDat, writeDat } from '../index'
import {
  type ThingCategory,
  createThingType,
  setThingFrameGroup,
  createFrameGroup,
  createFrameDuration,
  createClientFeatures,
  SPRITE_DEFAULT_SIZE,
  ThingCategory as TC
} from '../../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDuration(_category: ThingCategory): number {
  return 500
}

/** Creates a minimal DAT buffer with header + 1 item + 1 outfit + 0 effects + 0 missiles */
function createMinimalDatBuffer(version: number): ArrayBuffer {
  const features = createClientFeatures()

  // Build a single item
  const item = createThingType()
  item.id = 100
  item.category = TC.ITEM
  item.isGround = true
  item.groundSpeed = 150
  const itemFg = createFrameGroup()
  itemFg.spriteIndex = [1]
  setThingFrameGroup(item, 0, itemFg)

  // Build a single outfit
  const outfit = createThingType()
  outfit.id = 1
  outfit.category = TC.OUTFIT
  outfit.hasLight = true
  outfit.lightLevel = 5
  outfit.lightColor = 200
  const outfitFg = createFrameGroup()
  outfitFg.patternX = 4
  outfitFg.spriteIndex = [10, 11, 12, 13]
  setThingFrameGroup(outfit, 0, outfitFg)

  const data = {
    signature: 0x12345678,
    maxItemId: 100,
    maxOutfitId: 1,
    maxEffectId: 0,
    maxMissileId: 0,
    items: [item],
    outfits: [outfit],
    effects: [],
    missiles: []
  }

  return writeDat(data, version, features)
}

// ---------------------------------------------------------------------------
// BinaryStream tests
// ---------------------------------------------------------------------------

describe('BinaryReader', () => {
  it('reads unsigned integers (LE)', () => {
    const buf = new ArrayBuffer(7)
    const view = new DataView(buf)
    view.setUint8(0, 0xab)
    view.setUint16(1, 0x1234, true)
    view.setUint32(3, 0xdeadbeef, true)

    const reader = new BinaryReader(buf)
    expect(reader.readUint8()).toBe(0xab)
    expect(reader.readUint16()).toBe(0x1234)
    expect(reader.readUint32()).toBe(0xdeadbeef)
    expect(reader.position).toBe(7)
  })

  it('reads signed integers (LE)', () => {
    const buf = new ArrayBuffer(7)
    const view = new DataView(buf)
    view.setInt8(0, -42)
    view.setInt16(1, -1000, true)
    view.setInt32(3, -100000, true)

    const reader = new BinaryReader(buf)
    expect(reader.readInt8()).toBe(-42)
    expect(reader.readInt16()).toBe(-1000)
    expect(reader.readInt32()).toBe(-100000)
  })

  it('tracks position and bytesAvailable', () => {
    const buf = new ArrayBuffer(10)
    const reader = new BinaryReader(buf)
    expect(reader.bytesAvailable).toBe(10)
    expect(reader.length).toBe(10)
    reader.readUint32()
    expect(reader.position).toBe(4)
    expect(reader.bytesAvailable).toBe(6)
  })

  it('reads multibyte latin1 strings', () => {
    const str = 'Hello'
    const buf = new ArrayBuffer(str.length)
    const view = new Uint8Array(buf)
    for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)

    const reader = new BinaryReader(buf)
    expect(reader.readMultiByte(5, 'iso-8859-1')).toBe('Hello')
  })
})

describe('BinaryWriter', () => {
  it('writes and reads back unsigned integers', () => {
    const writer = new BinaryWriter()
    writer.writeUint8(0xab)
    writer.writeUint16(0x1234)
    writer.writeUint32(0xdeadbeef)

    const reader = new BinaryReader(writer.toArrayBuffer())
    expect(reader.readUint8()).toBe(0xab)
    expect(reader.readUint16()).toBe(0x1234)
    expect(reader.readUint32()).toBe(0xdeadbeef)
  })

  it('writes and reads back signed integers', () => {
    const writer = new BinaryWriter()
    writer.writeInt8(-42)
    writer.writeInt16(-1000)
    writer.writeInt32(-100000)

    const reader = new BinaryReader(writer.toArrayBuffer())
    expect(reader.readInt8()).toBe(-42)
    expect(reader.readInt16()).toBe(-1000)
    expect(reader.readInt32()).toBe(-100000)
  })

  it('grows buffer automatically', () => {
    const writer = new BinaryWriter(4) // start very small
    for (let i = 0; i < 100; i++) writer.writeUint32(i)

    const reader = new BinaryReader(writer.toArrayBuffer())
    for (let i = 0; i < 100; i++) expect(reader.readUint32()).toBe(i)
  })

  it('writes and reads multibyte latin1 strings', () => {
    const writer = new BinaryWriter()
    const str = 'Test\u00e9' // 'Testé' with latin1 char
    writer.writeMultiByte(str, 'iso-8859-1')

    const reader = new BinaryReader(writer.toArrayBuffer())
    expect(reader.readMultiByte(5, 'iso-8859-1')).toBe(str)
  })
})

// ---------------------------------------------------------------------------
// DAT read/write round-trip tests
// ---------------------------------------------------------------------------

describe('readDat / writeDat round-trip', () => {
  const versions = [
    { version: 710, name: 'v1 (7.10)' },
    { version: 740, name: 'v2 (7.40)' },
    { version: 760, name: 'v3 (7.60)' },
    { version: 800, name: 'v4 (8.00)' },
    { version: 860, name: 'v5 (8.60)' },
    { version: 1056, name: 'v6 (10.56)' }
  ]

  for (const { version, name } of versions) {
    it(`round-trips a minimal DAT file for ${name}`, () => {
      const features = createClientFeatures()
      const buffer = createMinimalDatBuffer(version)
      const result = readDat(buffer, version, features, defaultDuration)

      expect(result.signature).toBe(0x12345678)
      expect(result.maxItemId).toBe(100)
      expect(result.maxOutfitId).toBe(1)
      expect(result.maxEffectId).toBe(0)
      expect(result.maxMissileId).toBe(0)
      expect(result.items).toHaveLength(1)
      expect(result.outfits).toHaveLength(1)
      expect(result.effects).toHaveLength(0)
      expect(result.missiles).toHaveLength(0)

      // Verify item properties
      const item = result.items[0]
      expect(item.id).toBe(100)
      expect(item.isGround).toBe(true)
      expect(item.groundSpeed).toBe(150)

      // Verify outfit properties
      const outfit = result.outfits[0]
      expect(outfit.id).toBe(1)
      expect(outfit.hasLight).toBe(true)
      expect(outfit.lightLevel).toBe(5)
      expect(outfit.lightColor).toBe(200)

      // Write back and re-read
      const buffer2 = writeDat(result, version, features)
      const result2 = readDat(buffer2, version, features, defaultDuration)

      expect(result2.signature).toBe(result.signature)
      expect(result2.items).toHaveLength(result.items.length)
      expect(result2.outfits).toHaveLength(result.outfits.length)
      expect(result2.items[0].isGround).toBe(true)
      expect(result2.items[0].groundSpeed).toBe(150)
      expect(result2.outfits[0].hasLight).toBe(true)
    })
  }
})

describe('readDat properties', () => {
  it('reads all v6 item properties correctly', () => {
    const features = createClientFeatures()
    const version = 1056

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM
    item.isGround = true
    item.groundSpeed = 200
    item.isContainer = true
    item.stackable = true
    item.forceUse = true
    item.multiUse = true
    item.writable = true
    item.maxReadWriteChars = 255
    item.hasLight = true
    item.lightLevel = 7
    item.lightColor = 150
    item.hasOffset = true
    item.offsetX = -5
    item.offsetY = 10
    item.hasElevation = true
    item.elevation = 16
    item.miniMap = true
    item.miniMapColor = 1234
    item.rotatable = true
    item.isFullGround = true
    item.cloth = true
    item.clothSlot = 3
    item.isMarketItem = true
    item.marketCategory = 1
    item.marketTradeAs = 100
    item.marketShowAs = 101
    item.marketName = 'Magic Sword'
    item.marketRestrictProfession = 5
    item.marketRestrictLevel = 80
    item.hasDefaultAction = true
    item.defaultAction = 2
    item.wrappable = true
    item.usable = true
    item.noMoveAnimation = true

    const fg = createFrameGroup()
    fg.spriteIndex = [42]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0xaabbccdd,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    const readItem = result.items[0]
    expect(readItem.isGround).toBe(true)
    expect(readItem.groundSpeed).toBe(200)
    expect(readItem.isContainer).toBe(true)
    expect(readItem.stackable).toBe(true)
    expect(readItem.forceUse).toBe(true)
    expect(readItem.multiUse).toBe(true)
    expect(readItem.writable).toBe(true)
    expect(readItem.maxReadWriteChars).toBe(255)
    expect(readItem.hasLight).toBe(true)
    expect(readItem.lightLevel).toBe(7)
    expect(readItem.lightColor).toBe(150)
    expect(readItem.hasOffset).toBe(true)
    expect(readItem.offsetX).toBe(-5)
    expect(readItem.offsetY).toBe(10)
    expect(readItem.hasElevation).toBe(true)
    expect(readItem.elevation).toBe(16)
    expect(readItem.miniMap).toBe(true)
    expect(readItem.miniMapColor).toBe(1234)
    expect(readItem.rotatable).toBe(true)
    expect(readItem.isFullGround).toBe(true)
    expect(readItem.cloth).toBe(true)
    expect(readItem.clothSlot).toBe(3)
    expect(readItem.isMarketItem).toBe(true)
    expect(readItem.marketCategory).toBe(1)
    expect(readItem.marketTradeAs).toBe(100)
    expect(readItem.marketShowAs).toBe(101)
    expect(readItem.marketName).toBe('Magic Sword')
    expect(readItem.marketRestrictProfession).toBe(5)
    expect(readItem.marketRestrictLevel).toBe(80)
    expect(readItem.hasDefaultAction).toBe(true)
    expect(readItem.defaultAction).toBe(2)
    expect(readItem.wrappable).toBe(true)
    expect(readItem.usable).toBe(true)
    expect(readItem.noMoveAnimation).toBe(true)
  })

  it('reads bones offsets correctly (v4+)', () => {
    const features = createClientFeatures()
    const version = 800

    const outfit = createThingType()
    outfit.id = 1
    outfit.category = TC.OUTFIT
    outfit.hasBones = true
    outfit.bonesOffsetX[0] = 1 // NORTH
    outfit.bonesOffsetY[0] = -2
    outfit.bonesOffsetX[2] = 3 // SOUTH
    outfit.bonesOffsetY[2] = -4
    outfit.bonesOffsetX[1] = 5 // EAST
    outfit.bonesOffsetY[1] = -6
    outfit.bonesOffsetX[3] = 7 // WEST
    outfit.bonesOffsetY[3] = -8

    const fg = createFrameGroup()
    fg.patternX = 4
    fg.spriteIndex = [0, 0, 0, 0]
    setThingFrameGroup(outfit, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 99,
      maxOutfitId: 1,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [],
      outfits: [outfit],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    const readOutfit = result.outfits[0]
    expect(readOutfit.hasBones).toBe(true)
    expect(readOutfit.bonesOffsetX[0]).toBe(1)
    expect(readOutfit.bonesOffsetY[0]).toBe(-2)
    expect(readOutfit.bonesOffsetX[2]).toBe(3)
    expect(readOutfit.bonesOffsetY[2]).toBe(-4)
    expect(readOutfit.bonesOffsetX[1]).toBe(5)
    expect(readOutfit.bonesOffsetY[1]).toBe(-6)
    expect(readOutfit.bonesOffsetX[3]).toBe(7)
    expect(readOutfit.bonesOffsetY[3]).toBe(-8)
  })

  it('reads animated frame groups with improved animations', () => {
    const features = createClientFeatures(false, false, true, false)
    const version = 1056

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.frames = 3
    fg.isAnimation = true
    fg.animationMode = 1 // SYNCHRONOUS
    fg.loopCount = -1
    fg.startFrame = 0
    fg.frameDurations = [
      createFrameDuration(100, 200),
      createFrameDuration(150, 300),
      createFrameDuration(200, 400)
    ]
    fg.spriteIndex = [1, 2, 3]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    const readFg = result.items[0].frameGroups[0]!
    expect(readFg.frames).toBe(3)
    expect(readFg.isAnimation).toBe(true)
    expect(readFg.animationMode).toBe(1)
    expect(readFg.loopCount).toBe(-1)
    expect(readFg.startFrame).toBe(0)
    expect(readFg.frameDurations).toHaveLength(3)
    expect(readFg.frameDurations![0].minimum).toBe(100)
    expect(readFg.frameDurations![0].maximum).toBe(200)
    expect(readFg.frameDurations![1].minimum).toBe(150)
    expect(readFg.frameDurations![1].maximum).toBe(300)
    expect(readFg.frameDurations![2].minimum).toBe(200)
    expect(readFg.frameDurations![2].maximum).toBe(400)
    expect(readFg.spriteIndex).toEqual([1, 2, 3])
  })

  it('reads frame groups with extended sprite indices (uint32)', () => {
    const features = createClientFeatures(true) // extended = true
    const version = 1056

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.spriteIndex = [70000] // > uint16 range
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.items[0].frameGroups[0]!.spriteIndex[0]).toBe(70000)
  })

  it('reads outfit frame groups with frameGroups feature', () => {
    const features = createClientFeatures(false, false, false, true) // frameGroups = true
    const version = 1056

    const outfit = createThingType()
    outfit.id = 1
    outfit.category = TC.OUTFIT

    const idleFg = createFrameGroup()
    idleFg.patternX = 4
    idleFg.spriteIndex = [1, 2, 3, 4]
    setThingFrameGroup(outfit, 0, idleFg)

    const walkingFg = createFrameGroup()
    walkingFg.patternX = 4
    walkingFg.frames = 2
    walkingFg.isAnimation = false
    walkingFg.spriteIndex = [5, 6, 7, 8, 9, 10, 11, 12]
    setThingFrameGroup(outfit, 1, walkingFg)

    const data = {
      signature: 0,
      maxItemId: 99,
      maxOutfitId: 1,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [],
      outfits: [outfit],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    const readOutfit = result.outfits[0]
    expect(readOutfit.frameGroups[0]!.spriteIndex).toEqual([1, 2, 3, 4])
    expect(readOutfit.frameGroups[1]!.spriteIndex).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('handles v1/v2 patternZ=1 (no patternZ in binary)', () => {
    const features = createClientFeatures()
    const version = 710

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.patternZ = 3 // will NOT be written for v1/v2
    fg.spriteIndex = [1]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    // patternZ is always 1 for v1/v2
    expect(result.items[0].frameGroups[0]!.patternZ).toBe(1)
  })

  it('handles v3+ with patternZ from binary', () => {
    const features = createClientFeatures()
    const version = 760

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.patternZ = 2
    fg.spriteIndex = [1, 2]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.items[0].frameGroups[0]!.patternZ).toBe(2)
  })

  it('reads exactSize only when width or height > 1', () => {
    const features = createClientFeatures()
    const version = 1056

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.width = 2
    fg.height = 2
    fg.exactSize = 48
    fg.spriteIndex = [1, 2, 3, 4]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.items[0].frameGroups[0]!.exactSize).toBe(48)
    expect(result.items[0].frameGroups[0]!.width).toBe(2)
    expect(result.items[0].frameGroups[0]!.height).toBe(2)
  })

  it('defaults exactSize to 32 when width=1 and height=1', () => {
    const features = createClientFeatures()
    const version = 1056

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM

    const fg = createFrameGroup()
    fg.width = 1
    fg.height = 1
    fg.spriteIndex = [1]
    setThingFrameGroup(item, 0, fg)

    const data = {
      signature: 0,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.items[0].frameGroups[0]!.exactSize).toBe(SPRITE_DEFAULT_SIZE)
  })

  it('handles empty DAT file (no things)', () => {
    const features = createClientFeatures()
    const version = 1056

    const data = {
      signature: 0xaabb,
      maxItemId: 99, // no items (min is 100)
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.signature).toBe(0xaabb)
    expect(result.items).toHaveLength(0)
    expect(result.outfits).toHaveLength(0)
    expect(result.effects).toHaveLength(0)
    expect(result.missiles).toHaveLength(0)
  })

  it('pads missing sprite slots for malformed blank effects and missiles', () => {
    const features = createClientFeatures()
    const version = 1056

    const effect = createThingType()
    effect.id = 1
    effect.category = TC.EFFECT
    setThingFrameGroup(effect, 0, createFrameGroup())

    const missile = createThingType()
    missile.id = 1
    missile.category = TC.MISSILE
    const missileGroup = createFrameGroup()
    missileGroup.patternX = 3
    missileGroup.patternY = 3
    setThingFrameGroup(missile, 0, missileGroup)

    const data = {
      signature: 0x12345678,
      maxItemId: 99,
      maxOutfitId: 0,
      maxEffectId: 1,
      maxMissileId: 1,
      items: [],
      outfits: [],
      effects: [effect],
      missiles: [missile]
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.effects).toHaveLength(1)
    expect(result.effects[0].frameGroups[0]?.spriteIndex).toEqual([0])
    expect(result.missiles).toHaveLength(1)
    expect(result.missiles[0].frameGroups[0]?.spriteIndex).toEqual(new Array(9).fill(0))
  })

  it('does not write animation metadata for single-frame groups with stale animation flags', () => {
    const features = createClientFeatures(true, true, true, true)
    const version = 1098

    const item = createThingType()
    item.id = 100
    item.category = TC.ITEM
    item.isGround = true
    item.groundSpeed = 150

    const frameGroup = createFrameGroup()
    frameGroup.frames = 1
    frameGroup.isAnimation = true
    frameGroup.animationMode = 1
    frameGroup.loopCount = 5
    frameGroup.startFrame = 0
    frameGroup.frameDurations = [createFrameDuration(100, 200)]
    frameGroup.spriteIndex = [77]
    setThingFrameGroup(item, 0, frameGroup)

    const data = {
      signature: 0x12345678,
      maxItemId: 100,
      maxOutfitId: 0,
      maxEffectId: 0,
      maxMissileId: 0,
      items: [item],
      outfits: [],
      effects: [],
      missiles: []
    }

    const buffer = writeDat(data, version, features)
    const result = readDat(buffer, version, features, defaultDuration)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].frameGroups[0]?.frames).toBe(1)
    expect(result.items[0].frameGroups[0]?.spriteIndex).toEqual([77])
  })
})
