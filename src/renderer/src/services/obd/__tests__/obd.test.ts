import { describe, it, expect } from 'vitest'
import { BinaryReader, BinaryWriter } from '../../dat/binary-stream'
import { readObdProperties, writeObdProperties } from '../obd-properties'
import { encodeObd, decodeObd } from '../obd-encoder'
import { lzmaCompress, lzmaDecompress } from '../lzma'
import {
  type ThingType,
  type ThingData,
  type SpriteData,
  ThingCategory as TC,
  FrameGroupType as FGT,
  AnimationMode,
  OBDVersion,
  createThingType,
  createThingData,
  createFrameGroup,
  createFrameDuration,
  setThingFrameGroup,
  getThingFrameGroup,
  getFrameGroupTotalSprites,
  getThingCategoryValue,
  SPRITE_DEFAULT_DATA_SIZE
} from '../../../types'

// ---------------------------------------------------------------------------
// Helper to create test sprites
// ---------------------------------------------------------------------------

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function makePixels(size: number, fill: number): Uint8Array {
  const pixels = new Uint8Array(size)
  pixels.fill(fill)
  return pixels
}

function makeTestThingData(opts: {
  obdVersion: number
  clientVersion: number
  category?: string
  properties?: Partial<ThingType>
  frameGroup?: {
    width?: number
    height?: number
    layers?: number
    patternX?: number
    patternY?: number
    patternZ?: number
    frames?: number
    isAnimation?: boolean
    animationMode?: number
    loopCount?: number
    startFrame?: number
  }
  spriteCount?: number
  spritePixelSize?: number
  walkingGroup?: boolean
}): ThingData {
  const thing = createThingType()
  thing.category = (opts.category ?? TC.ITEM) as typeof thing.category
  if (opts.properties) {
    Object.assign(thing, opts.properties)
  }

  const fg = createFrameGroup()
  fg.width = opts.frameGroup?.width ?? 1
  fg.height = opts.frameGroup?.height ?? 1
  fg.layers = opts.frameGroup?.layers ?? 1
  fg.patternX = opts.frameGroup?.patternX ?? 1
  fg.patternY = opts.frameGroup?.patternY ?? 1
  fg.patternZ = opts.frameGroup?.patternZ ?? 1
  fg.frames = opts.frameGroup?.frames ?? 1

  if (opts.frameGroup?.isAnimation && fg.frames > 1) {
    fg.isAnimation = true
    fg.animationMode = (opts.frameGroup.animationMode ?? AnimationMode.ASYNCHRONOUS) as 0 | 1
    fg.loopCount = opts.frameGroup.loopCount ?? 0
    fg.startFrame = opts.frameGroup.startFrame ?? 0
    fg.frameDurations = []
    for (let i = 0; i < fg.frames; i++) {
      fg.frameDurations.push(createFrameDuration(100 + i * 50, 200 + i * 50))
    }
  }

  const totalSprites = opts.spriteCount ?? getFrameGroupTotalSprites(fg)
  fg.spriteIndex = []
  const sprites: SpriteData[] = []
  const pixelSize = opts.spritePixelSize ?? SPRITE_DEFAULT_DATA_SIZE

  for (let i = 0; i < totalSprites; i++) {
    const id = i + 1
    fg.spriteIndex.push(id)
    sprites.push({ id, pixels: makePixels(pixelSize, (i + 1) & 0xff) })
  }

  setThingFrameGroup(thing, FGT.DEFAULT, fg)

  const spriteMap = new Map()
  spriteMap.set(FGT.DEFAULT, sprites)

  // Optional walking group for outfits (V3)
  if (opts.walkingGroup && thing.category === TC.OUTFIT) {
    const wfg = createFrameGroup()
    wfg.width = 1
    wfg.height = 1
    wfg.layers = 1
    wfg.patternX = 1
    wfg.patternY = 1
    wfg.patternZ = 1
    wfg.frames = 2
    wfg.isAnimation = true
    wfg.animationMode = AnimationMode.SYNCHRONOUS
    wfg.loopCount = -1
    wfg.startFrame = 0
    wfg.frameDurations = [createFrameDuration(200, 300), createFrameDuration(250, 350)]

    const walkSprites: SpriteData[] = []
    wfg.spriteIndex = []
    const walkTotal = getFrameGroupTotalSprites(wfg)
    for (let i = 0; i < walkTotal; i++) {
      const id = 100 + i + 1
      wfg.spriteIndex.push(id)
      walkSprites.push({ id, pixels: makePixels(pixelSize, 0xaa) })
    }
    setThingFrameGroup(thing, FGT.WALKING, wfg)
    spriteMap.set(FGT.WALKING, walkSprites)
  }

  return createThingData(opts.obdVersion, opts.clientVersion, thing, spriteMap)
}

// ---------------------------------------------------------------------------
// LZMA compress/decompress
// ---------------------------------------------------------------------------

describe('LZMA', () => {
  it('should round-trip binary data', async () => {
    const original = new Uint8Array([0, 1, 2, 128, 254, 255, 0, 0])
    const compressed = await lzmaCompress(original)
    expect(compressed.length).toBeGreaterThan(0)
    const decompressed = await lzmaDecompress(compressed)
    expect(decompressed).toEqual(original)
  })

  it('should round-trip large data', async () => {
    const original = new Uint8Array(4096)
    for (let i = 0; i < 4096; i++) original[i] = i & 0xff
    const compressed = await lzmaCompress(original)
    const decompressed = await lzmaDecompress(compressed)
    expect(decompressed).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// Defensive decoding / encoding
// ---------------------------------------------------------------------------

describe('OBD safety validation', () => {
  it('rejects variable-size sprite payloads larger than one 32x32 ARGB sprite', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      spritePixelSize: SPRITE_DEFAULT_DATA_SIZE + 1
    })

    await expect(encodeObd(data)).rejects.toThrow(/Invalid sprite data length/)
  })

  it('rejects OBD files with too many sprite slots before allocating sprite arrays', async () => {
    const writer = new BinaryWriter()
    const thing = createThingType()
    thing.category = TC.ITEM

    writer.writeUint16(OBDVersion.VERSION_3)
    writer.writeUint16(1056)
    writer.writeUint8(getThingCategoryValue(TC.ITEM))
    writer.writeUint32(0)
    writeObdProperties(writer, thing)
    writer.writeUint8(255) // width
    writer.writeUint8(255) // height
    writer.writeUint8(64) // exact size
    writer.writeUint8(1) // layers
    writer.writeUint8(1) // patternX
    writer.writeUint8(1) // patternY
    writer.writeUint8(1) // patternZ
    writer.writeUint8(1) // frames

    const encoded = toArrayBuffer(await lzmaCompress(new Uint8Array(writer.toArrayBuffer())))

    await expect(decodeObd(encoded)).rejects.toThrow(/more than 4096 sprites/)
  })

  it('rejects truncated variable-size sprite data with a useful error', async () => {
    const writer = new BinaryWriter()
    const thing = createThingType()
    thing.category = TC.ITEM

    writer.writeUint16(OBDVersion.VERSION_3)
    writer.writeUint16(1056)
    writer.writeUint8(getThingCategoryValue(TC.ITEM))
    writer.writeUint32(0)
    writeObdProperties(writer, thing)
    writer.writeUint8(1) // width
    writer.writeUint8(1) // height
    writer.writeUint8(32) // exact size
    writer.writeUint8(1) // layers
    writer.writeUint8(1) // patternX
    writer.writeUint8(1) // patternY
    writer.writeUint8(1) // patternZ
    writer.writeUint8(1) // frames
    writer.writeUint32(1) // sprite id
    writer.writeUint32(4) // declared data size
    writer.writeUint8(1) // only one byte is available

    const truncated = toArrayBuffer(await lzmaCompress(new Uint8Array(writer.toArrayBuffer())))

    await expect(decodeObd(truncated)).rejects.toThrow(/truncated|Unexpected end/i)
  })
})

// ---------------------------------------------------------------------------
// OBD Properties (generic V2/V3 format)
// ---------------------------------------------------------------------------

describe('OBD Properties', () => {
  function roundTripProperties(thing: ThingType): ThingType {
    const writer = new BinaryWriter(256)
    writeObdProperties(writer, thing)
    const reader = new BinaryReader(writer.toArrayBuffer())
    const result = createThingType()
    result.category = thing.category
    readObdProperties(reader, result)
    return result
  }

  it('should round-trip empty properties', () => {
    const thing = createThingType()
    const result = roundTripProperties(thing)
    expect(result.isGround).toBe(false)
    expect(result.stackable).toBe(false)
  })

  it('should round-trip ground with speed', () => {
    const thing = createThingType()
    thing.isGround = true
    thing.groundSpeed = 150
    const result = roundTripProperties(thing)
    expect(result.isGround).toBe(true)
    expect(result.groundSpeed).toBe(150)
  })

  it('should handle mutually exclusive flags', () => {
    // Ground border
    const t1 = createThingType()
    t1.isGroundBorder = true
    expect(roundTripProperties(t1).isGroundBorder).toBe(true)

    // On bottom
    const t2 = createThingType()
    t2.isOnBottom = true
    expect(roundTripProperties(t2).isOnBottom).toBe(true)

    // On top
    const t3 = createThingType()
    t3.isOnTop = true
    expect(roundTripProperties(t3).isOnTop).toBe(true)
  })

  it('should round-trip all boolean flags', () => {
    const thing = createThingType()
    thing.isContainer = true
    thing.stackable = true
    thing.forceUse = true
    thing.multiUse = true
    thing.isFluidContainer = true
    thing.isFluid = true
    thing.isUnpassable = true
    thing.isUnmoveable = true
    thing.blockMissile = true
    thing.blockPathfind = true
    thing.noMoveAnimation = true
    thing.pickupable = true
    thing.hangable = true
    thing.isVertical = true
    thing.isHorizontal = true
    thing.rotatable = true
    thing.dontHide = true
    thing.isTranslucent = true
    thing.isLyingObject = true
    thing.animateAlways = true
    thing.isFullGround = true
    thing.ignoreLook = true
    thing.wrappable = true
    thing.unwrappable = true
    thing.hasCharges = true
    thing.floorChange = true
    thing.usable = true

    const result = roundTripProperties(thing)
    expect(result.isContainer).toBe(true)
    expect(result.stackable).toBe(true)
    expect(result.forceUse).toBe(true)
    expect(result.multiUse).toBe(true)
    expect(result.isFluidContainer).toBe(true)
    expect(result.isFluid).toBe(true)
    expect(result.isUnpassable).toBe(true)
    expect(result.isUnmoveable).toBe(true)
    expect(result.blockMissile).toBe(true)
    expect(result.blockPathfind).toBe(true)
    expect(result.noMoveAnimation).toBe(true)
    expect(result.pickupable).toBe(true)
    expect(result.hangable).toBe(true)
    expect(result.isVertical).toBe(true)
    expect(result.isHorizontal).toBe(true)
    expect(result.rotatable).toBe(true)
    expect(result.dontHide).toBe(true)
    expect(result.isTranslucent).toBe(true)
    expect(result.isLyingObject).toBe(true)
    expect(result.animateAlways).toBe(true)
    expect(result.isFullGround).toBe(true)
    expect(result.ignoreLook).toBe(true)
    expect(result.wrappable).toBe(true)
    expect(result.unwrappable).toBe(true)
    expect(result.hasCharges).toBe(true)
    expect(result.floorChange).toBe(true)
    expect(result.usable).toBe(true)
  })

  it('should round-trip properties with data', () => {
    const thing = createThingType()
    thing.writable = true
    thing.maxReadWriteChars = 500
    thing.writableOnce = true
    thing.maxReadChars = 200
    thing.hasLight = true
    thing.lightLevel = 7
    thing.lightColor = 215
    thing.hasOffset = true
    thing.offsetX = -10
    thing.offsetY = 20
    thing.hasElevation = true
    thing.elevation = 16
    thing.miniMap = true
    thing.miniMapColor = 0x1234
    thing.isLensHelp = true
    thing.lensHelp = 42

    const result = roundTripProperties(thing)
    expect(result.writable).toBe(true)
    expect(result.maxReadWriteChars).toBe(500)
    expect(result.writableOnce).toBe(true)
    expect(result.maxReadChars).toBe(200)
    expect(result.hasLight).toBe(true)
    expect(result.lightLevel).toBe(7)
    expect(result.lightColor).toBe(215)
    expect(result.hasOffset).toBe(true)
    expect(result.offsetX).toBe(-10)
    expect(result.offsetY).toBe(20)
    expect(result.hasElevation).toBe(true)
    expect(result.elevation).toBe(16)
    expect(result.miniMap).toBe(true)
    expect(result.miniMapColor).toBe(0x1234)
    expect(result.isLensHelp).toBe(true)
    expect(result.lensHelp).toBe(42)
  })

  it('should round-trip cloth property', () => {
    const thing = createThingType()
    thing.cloth = true
    thing.clothSlot = 5
    const result = roundTripProperties(thing)
    expect(result.cloth).toBe(true)
    expect(result.clothSlot).toBe(5)
  })

  it('should round-trip market item', () => {
    const thing = createThingType()
    thing.isMarketItem = true
    thing.marketCategory = 3
    thing.marketTradeAs = 100
    thing.marketShowAs = 101
    thing.marketName = 'Golden Armor'
    thing.marketRestrictProfession = 0xffff
    thing.marketRestrictLevel = 80
    const result = roundTripProperties(thing)
    expect(result.isMarketItem).toBe(true)
    expect(result.marketCategory).toBe(3)
    expect(result.marketTradeAs).toBe(100)
    expect(result.marketShowAs).toBe(101)
    expect(result.marketName).toBe('Golden Armor')
    expect(result.marketRestrictProfession).toBe(0xffff)
    expect(result.marketRestrictLevel).toBe(80)
  })

  it('should round-trip default action', () => {
    const thing = createThingType()
    thing.hasDefaultAction = true
    thing.defaultAction = 3
    const result = roundTripProperties(thing)
    expect(result.hasDefaultAction).toBe(true)
    expect(result.defaultAction).toBe(3)
  })

  it('should only write topEffect for EFFECT category', () => {
    // EFFECT category: topEffect should be written
    const effect = createThingType()
    effect.category = TC.EFFECT
    effect.topEffect = true
    const r1 = roundTripProperties(effect)
    expect(r1.topEffect).toBe(true)

    // ITEM category: topEffect should NOT be written
    const item = createThingType()
    item.category = TC.ITEM
    item.topEffect = true
    const r2 = roundTripProperties(item)
    expect(r2.topEffect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// OBD V1 encode/decode
// ---------------------------------------------------------------------------

describe('OBD V1', () => {
  it('should round-trip simple item', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_1,
      clientVersion: 1056,
      category: TC.ITEM,
      properties: { isGround: true, groundSpeed: 200 }
    })

    const encoded = await encodeObd(data)
    expect(encoded.byteLength).toBeGreaterThan(0)

    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_1)
    expect(decoded.clientVersion).toBe(1056)
    expect(decoded.thing.category).toBe(TC.ITEM)
    expect(decoded.thing.isGround).toBe(true)
    expect(decoded.thing.groundSpeed).toBe(200)
  })

  it('should round-trip sprite data', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_1,
      clientVersion: 860,
      spritePixelSize: 4096
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const origSprites = data.sprites.get(FGT.DEFAULT)!
    const decSprites = decoded.sprites.get(FGT.DEFAULT)!
    expect(decSprites.length).toBe(origSprites.length)
    expect(decSprites[0].id).toBe(origSprites[0].id)
    expect(decSprites[0].pixels).toEqual(origSprites[0].pixels)
  })

  it('should handle different client versions', async () => {
    for (const version of [710, 740, 760, 800, 860, 1056]) {
      const data = makeTestThingData({
        obdVersion: OBDVersion.VERSION_1,
        clientVersion: version,
        properties: { stackable: true, pickupable: true }
      })
      const encoded = await encodeObd(data)
      const decoded = await decodeObd(encoded)
      expect(decoded.clientVersion).toBe(version)
      expect(decoded.thing.stackable).toBe(true)
      expect(decoded.thing.pickupable).toBe(true)
    }
  })

  it('should use default durations for animated frames', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_1,
      clientVersion: 860,
      frameGroup: { frames: 3, isAnimation: true }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded, () => 500)

    const fg = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(fg.isAnimation).toBe(true)
    expect(fg.frames).toBe(3)
    expect(fg.frameDurations).toHaveLength(3)
    // V1 uses default durations
    expect(fg.frameDurations![0].minimum).toBe(500)
    expect(fg.frameDurations![0].maximum).toBe(500)
  })

  it('should round-trip variable-length sprite pixels', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_1,
      clientVersion: 860,
      spritePixelSize: 128 // Smaller than default
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const decSprites = decoded.sprites.get(FGT.DEFAULT)!
    expect(decSprites[0].pixels!.length).toBe(128)
  })
})

// ---------------------------------------------------------------------------
// OBD V2 encode/decode
// ---------------------------------------------------------------------------

describe('OBD V2', () => {
  it('should round-trip simple item', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      category: TC.ITEM,
      properties: { isContainer: true, stackable: true }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_2)
    expect(decoded.clientVersion).toBe(1056)
    expect(decoded.thing.category).toBe(TC.ITEM)
    expect(decoded.thing.isContainer).toBe(true)
    expect(decoded.thing.stackable).toBe(true)
  })

  it('should use fixed sprite size (4096 bytes)', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      spritePixelSize: 4096
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const sprites = decoded.sprites.get(FGT.DEFAULT)!
    expect(sprites[0].pixels!.length).toBe(SPRITE_DEFAULT_DATA_SIZE)
  })

  it('should round-trip animation data with durations', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      frameGroup: {
        frames: 4,
        isAnimation: true,
        animationMode: AnimationMode.SYNCHRONOUS,
        loopCount: 3,
        startFrame: 1
      }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const fg = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(fg.isAnimation).toBe(true)
    expect(fg.frames).toBe(4)
    expect(fg.animationMode).toBe(AnimationMode.SYNCHRONOUS)
    expect(fg.loopCount).toBe(3)
    expect(fg.startFrame).toBe(1)
    expect(fg.frameDurations).toHaveLength(4)
    expect(fg.frameDurations![0].minimum).toBe(100)
    expect(fg.frameDurations![0].maximum).toBe(200)
    expect(fg.frameDurations![3].minimum).toBe(250)
    expect(fg.frameDurations![3].maximum).toBe(350)
  })

  it('should round-trip outfit (single default group)', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      category: TC.OUTFIT,
      properties: { animateAlways: true }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.thing.category).toBe(TC.OUTFIT)
    expect(decoded.thing.animateAlways).toBe(true)
  })

  it('should round-trip all generic OBD properties', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      properties: {
        isGround: true,
        groundSpeed: 100,
        isContainer: true,
        stackable: true,
        forceUse: true,
        multiUse: true,
        writable: true,
        maxReadWriteChars: 300,
        hasLight: true,
        lightLevel: 5,
        lightColor: 200,
        hasOffset: true,
        offsetX: -5,
        offsetY: 10,
        hasElevation: true,
        elevation: 8,
        miniMap: true,
        miniMapColor: 0xabcd,
        cloth: true,
        clothSlot: 2,
        hasDefaultAction: true,
        defaultAction: 1,
        wrappable: true,
        hasCharges: true,
        floorChange: true,
        usable: true
      }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    const t = decoded.thing
    expect(t.isGround).toBe(true)
    expect(t.groundSpeed).toBe(100)
    expect(t.isContainer).toBe(true)
    expect(t.stackable).toBe(true)
    expect(t.forceUse).toBe(true)
    expect(t.multiUse).toBe(true)
    expect(t.writable).toBe(true)
    expect(t.maxReadWriteChars).toBe(300)
    expect(t.hasLight).toBe(true)
    expect(t.lightLevel).toBe(5)
    expect(t.lightColor).toBe(200)
    expect(t.hasOffset).toBe(true)
    expect(t.offsetX).toBe(-5)
    expect(t.offsetY).toBe(10)
    expect(t.hasElevation).toBe(true)
    expect(t.elevation).toBe(8)
    expect(t.miniMap).toBe(true)
    expect(t.miniMapColor).toBe(0xabcd)
    expect(t.cloth).toBe(true)
    expect(t.clothSlot).toBe(2)
    expect(t.hasDefaultAction).toBe(true)
    expect(t.defaultAction).toBe(1)
    expect(t.wrappable).toBe(true)
    expect(t.hasCharges).toBe(true)
    expect(t.floorChange).toBe(true)
    expect(t.usable).toBe(true)
  })

  it('should round-trip effect category', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      category: TC.EFFECT
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.thing.category).toBe(TC.EFFECT)
  })

  it('should round-trip missile category', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056,
      category: TC.MISSILE
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.thing.category).toBe(TC.MISSILE)
  })
})

// ---------------------------------------------------------------------------
// OBD V3 encode/decode
// ---------------------------------------------------------------------------

describe('OBD V3', () => {
  it('should round-trip simple item', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      category: TC.ITEM,
      properties: { pickupable: true, rotatable: true }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_3)
    expect(decoded.clientVersion).toBe(1056)
    expect(decoded.thing.category).toBe(TC.ITEM)
    expect(decoded.thing.pickupable).toBe(true)
    expect(decoded.thing.rotatable).toBe(true)
  })

  it('should use variable-length sprite pixels', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      spritePixelSize: 256
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const sprites = decoded.sprites.get(FGT.DEFAULT)!
    expect(sprites[0].pixels!.length).toBe(256)
  })

  it('should round-trip outfit with multiple frame groups', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      category: TC.OUTFIT,
      properties: { animateAlways: true },
      walkingGroup: true
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    expect(decoded.thing.category).toBe(TC.OUTFIT)
    expect(decoded.thing.animateAlways).toBe(true)

    // Check DEFAULT group
    const defaultGroup = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(defaultGroup).toBeDefined()

    // Check WALKING group
    const walkingGroup = getThingFrameGroup(decoded.thing, FGT.WALKING)!
    expect(walkingGroup).toBeDefined()
    expect(walkingGroup.isAnimation).toBe(true)
    expect(walkingGroup.frames).toBe(2)
    expect(walkingGroup.animationMode).toBe(AnimationMode.SYNCHRONOUS)
    expect(walkingGroup.loopCount).toBe(-1)

    // Check walking sprites
    const walkSprites = decoded.sprites.get(FGT.WALKING)!
    expect(walkSprites.length).toBe(getFrameGroupTotalSprites(walkingGroup))
    expect(walkSprites[0].id).toBe(101)
  })

  it('should round-trip outfit with single group', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      category: TC.OUTFIT
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    expect(decoded.thing.category).toBe(TC.OUTFIT)
    const defaultGroup = getThingFrameGroup(decoded.thing, FGT.DEFAULT)
    expect(defaultGroup).toBeDefined()
  })

  it('should round-trip animated effect', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      category: TC.EFFECT,
      properties: { topEffect: true },
      frameGroup: {
        frames: 5,
        isAnimation: true,
        animationMode: AnimationMode.ASYNCHRONOUS,
        loopCount: 0,
        startFrame: 0
      }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    expect(decoded.thing.category).toBe(TC.EFFECT)
    expect(decoded.thing.topEffect).toBe(true)

    const fg = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(fg.isAnimation).toBe(true)
    expect(fg.frames).toBe(5)
    expect(fg.frameDurations).toHaveLength(5)
  })

  it('should round-trip multi-tile object (exactSize)', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      frameGroup: { width: 2, height: 2 }
    })

    // Set exactSize on the frame group
    const fg = getThingFrameGroup(data.thing, FGT.DEFAULT)!
    fg.exactSize = 64

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const dfg = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(dfg.width).toBe(2)
    expect(dfg.height).toBe(2)
    expect(dfg.exactSize).toBe(64)
  })

  it('should round-trip with patterns and layers', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056,
      frameGroup: {
        layers: 2,
        patternX: 4,
        patternY: 4,
        patternZ: 1
      }
    })

    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const fg = getThingFrameGroup(decoded.thing, FGT.DEFAULT)!
    expect(fg.layers).toBe(2)
    expect(fg.patternX).toBe(4)
    expect(fg.patternY).toBe(4)
    expect(fg.patternZ).toBe(1)
  })

  it('should handle empty sprite pixels (null)', async () => {
    const thing = createThingType()
    thing.category = TC.ITEM
    const fg = createFrameGroup()
    fg.width = 1
    fg.height = 1
    fg.layers = 1
    fg.patternX = 1
    fg.patternY = 1
    fg.patternZ = 1
    fg.frames = 1
    fg.spriteIndex = [0]
    setThingFrameGroup(thing, FGT.DEFAULT, fg)

    const spriteMap = new Map()
    spriteMap.set(FGT.DEFAULT, [{ id: 0, pixels: null }])

    const data = createThingData(OBDVersion.VERSION_3, 1056, thing, spriteMap)
    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)

    const sprites = decoded.sprites.get(FGT.DEFAULT)!
    expect(sprites[0].id).toBe(0)
    expect(sprites[0].pixels).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

describe('Version detection', () => {
  it('should detect V1 from client version >= 710', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_1,
      clientVersion: 860
    })
    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_1)
  })

  it('should detect V2 from version header 200', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_2,
      clientVersion: 1056
    })
    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_2)
  })

  it('should detect V3 from version header 300', async () => {
    const data = makeTestThingData({
      obdVersion: OBDVersion.VERSION_3,
      clientVersion: 1056
    })
    const encoded = await encodeObd(data)
    const decoded = await decodeObd(encoded)
    expect(decoded.obdVersion).toBe(OBDVersion.VERSION_3)
  })
})

// ---------------------------------------------------------------------------
// BinaryReader/BinaryWriter extensions
// ---------------------------------------------------------------------------

describe('BinaryReader/BinaryWriter extensions', () => {
  it('should read/write bytes', () => {
    const writer = new BinaryWriter(32)
    const data = new Uint8Array([10, 20, 30, 40])
    writer.writeBytes(data)

    const reader = new BinaryReader(writer.toArrayBuffer())
    const result = reader.readBytes(4)
    expect(result).toEqual(data)
  })

  it('should read/write UTF strings', () => {
    const writer = new BinaryWriter(64)
    writer.writeUTF('Hello')
    writer.writeUTF('item')
    writer.writeUTF('')

    const reader = new BinaryReader(writer.toArrayBuffer())
    expect(reader.readUTF()).toBe('Hello')
    expect(reader.readUTF()).toBe('item')
    expect(reader.readUTF()).toBe('')
  })
})
