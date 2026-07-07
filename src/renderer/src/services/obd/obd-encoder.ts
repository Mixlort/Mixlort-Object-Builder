/**
 * OBD (Object Builder Data) encoder/decoder.
 * Supports OBD V1 (100), V2 (200), and V3 (300).
 *
 * Ported from legacy AS3: otlib/obd/OBDEncoder.as
 *
 * File format: Entire content is LZMA compressed. After decompression:
 * - V1: [clientVersion:u16][category:UTF][properties][frameGroup][sprites]
 * - V2: [obdVersion:u16][clientVersion:u16][category:u8][spritesPos:u32][properties][frameGroup][sprites]
 * - V3: [obdVersion:u16][clientVersion:u16][category:u8][spritesPos:u32][properties][frameGroups*][sprites*]
 */

import { BinaryReader, BinaryWriter } from '../dat/binary-stream'
import { getPropertyReader, getPropertyWriters } from '../dat'
import {
  type ThingData,
  type ThingCategory,
  ThingCategory as TC,
  createThingType,
  createThingData,
  setThingFrameGroup,
  getThingFrameGroup,
  getThingCategoryByValue,
  getThingCategoryValue,
  isValidThingCategory,
  type FrameGroup,
  type FrameDuration,
  type FrameGroupType,
  FrameGroupType as FGT,
  type AnimationMode,
  createFrameGroup,
  createFrameDuration,
  getFrameGroupTotalSprites,
  type SpriteData,
  OBDVersion,
  SPRITE_DEFAULT_SIZE,
  SPRITE_DEFAULT_DATA_SIZE
} from '../../types'
import {
  readObdProperties,
  writeObdProperties,
  getDatVersionFromClientVersion
} from './obd-properties'
import { lzmaCompress, lzmaDecompress } from './lzma'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DefaultDurationFn = (category: ThingCategory) => number

const MAX_OBD_SPRITES = SPRITE_DEFAULT_DATA_SIZE

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function validateSpritePixelsLength(length: number): void {
  if (length > SPRITE_DEFAULT_DATA_SIZE) {
    throw new Error(
      `Invalid sprite data length: expected at most ${SPRITE_DEFAULT_DATA_SIZE}, got ${length}`
    )
  }
}

function validateReadableBytes(reader: BinaryReader, length: number): void {
  if (length > reader.bytesAvailable) {
    throw new Error(
      `Unexpected end of data: expected ${length} bytes, available ${reader.bytesAvailable}`
    )
  }
}

function validateFrameGroup(fg: FrameGroup): void {
  const fields = [
    ['width', fg.width],
    ['height', fg.height],
    ['layers', fg.layers],
    ['patternX', fg.patternX],
    ['patternY', fg.patternY],
    ['patternZ', fg.patternZ],
    ['frames', fg.frames]
  ] as const

  for (const [name, value] of fields) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Invalid frame group ${name}: ${value}`)
    }
  }

  const totalSprites = getFrameGroupTotalSprites(fg)
  if (!Number.isSafeInteger(totalSprites) || totalSprites > MAX_OBD_SPRITES) {
    throw new Error(`The Object Data has more than ${MAX_OBD_SPRITES} sprites.`)
  }
}

// ---------------------------------------------------------------------------
// Public API: Encode
// ---------------------------------------------------------------------------

/**
 * Encode ThingData to OBD binary format.
 * @param data - ThingData to encode
 * @returns LZMA-compressed OBD binary data
 */
export async function encodeObd(data: ThingData): Promise<ArrayBuffer> {
  let raw: ArrayBuffer
  switch (data.obdVersion) {
    case OBDVersion.VERSION_1:
      raw = encodeV1(data)
      break
    case OBDVersion.VERSION_2:
      raw = encodeV2(data)
      break
    case OBDVersion.VERSION_3:
      raw = encodeV3(data)
      break
    default:
      throw new Error(`Unsupported OBD version: ${data.obdVersion}`)
  }

  const compressed = await lzmaCompress(new Uint8Array(raw))
  return toExactArrayBuffer(compressed)
}

// ---------------------------------------------------------------------------
// Public API: Decode
// ---------------------------------------------------------------------------

/**
 * Decode OBD binary format to ThingData.
 * @param buffer - LZMA-compressed OBD binary data
 * @param getDefaultDuration - Callback returning default animation duration (ms) per category (for V1)
 * @returns Decoded ThingData
 */
export async function decodeObd(
  buffer: ArrayBuffer,
  getDefaultDuration?: DefaultDurationFn
): Promise<ThingData> {
  const decompressed = await lzmaDecompress(new Uint8Array(buffer))
  const reader = new BinaryReader(toExactArrayBuffer(decompressed))

  // Read first uint16 to determine version
  const firstValue = reader.readUint16()
  reader.position = 0 // Reset for version-specific decoder

  if (firstValue === OBDVersion.VERSION_3) {
    return decodeV3(reader)
  } else if (firstValue === OBDVersion.VERSION_2) {
    return decodeV2(reader)
  } else if (firstValue >= 710) {
    // V1: first value is clientVersion (>= 710)
    const defaultDuration = getDefaultDuration ?? (() => 300)
    return decodeV1(reader, defaultDuration)
  } else {
    throw new Error(`Unknown OBD format: first value = ${firstValue}`)
  }
}

// ---------------------------------------------------------------------------
// V1: Encode
// ---------------------------------------------------------------------------

function encodeV1(data: ThingData): ArrayBuffer {
  const writer = new BinaryWriter(4096)

  // Header
  writer.writeUint16(data.clientVersion)
  writer.writeUTF(data.thing.category)

  // Properties (version-specific, same as DAT format)
  const datVersion = getDatVersionFromClientVersion(data.clientVersion)
  const { writeItemProps } = getPropertyWriters(datVersion)
  writeItemProps(writer, data.thing)

  // Frame group (DEFAULT only for V1)
  const frameGroup = getThingFrameGroup(data.thing, FGT.DEFAULT)
  if (!frameGroup) throw new Error('V1 encode: missing DEFAULT frame group')

  validateFrameGroup(frameGroup)
  writeFrameGroupLayout(writer, frameGroup)

  // Sprites
  const sprites = data.sprites.get(FGT.DEFAULT) ?? []
  const totalSprites = getFrameGroupTotalSprites(frameGroup)
  for (let i = 0; i < totalSprites; i++) {
    const sprite = sprites[i]
    const pixels = sprite?.pixels
    if (pixels) validateSpritePixelsLength(pixels.length)
    writer.writeUint32(sprite?.id ?? 0)
    writer.writeUint32(pixels?.length ?? 0)
    if (pixels && pixels.length > 0) {
      writer.writeBytes(pixels)
    }
  }

  return writer.toArrayBuffer()
}

// ---------------------------------------------------------------------------
// V1: Decode
// ---------------------------------------------------------------------------

function decodeV1(reader: BinaryReader, getDefaultDuration: DefaultDurationFn): ThingData {
  // Header
  const clientVersion = reader.readUint16()
  const categoryStr = reader.readUTF()

  if (!isValidThingCategory(categoryStr)) {
    throw new Error(`Invalid category: ${categoryStr}`)
  }
  const category: ThingCategory = categoryStr

  const thing = createThingType()
  thing.category = category

  // Properties (version-specific, same as DAT format)
  const datVersion = getDatVersionFromClientVersion(clientVersion)
  const readProps = getPropertyReader(datVersion)
  readProps(reader, thing)

  // Frame group layout
  const frameGroup = readFrameGroupLayout(reader)
  validateFrameGroup(frameGroup)

  // Animation (V1: no explicit durations, use defaults)
  if (frameGroup.frames > 1) {
    frameGroup.isAnimation = true
    const duration = getDefaultDuration(category)
    frameGroup.frameDurations = new Array<FrameDuration>(frameGroup.frames)
    for (let i = 0; i < frameGroup.frames; i++) {
      frameGroup.frameDurations[i] = createFrameDuration(duration, duration)
    }
  }

  // Sprites
  const totalSprites = getFrameGroupTotalSprites(frameGroup)
  frameGroup.spriteIndex = new Array<number>(totalSprites)
  const sprites: SpriteData[] = new Array(totalSprites)

  for (let i = 0; i < totalSprites; i++) {
    const spriteId = reader.readUint32()
    const dataSize = reader.readUint32()
    validateSpritePixelsLength(dataSize)
    validateReadableBytes(reader, dataSize)
    const pixels = dataSize > 0 ? reader.readBytes(dataSize) : null

    frameGroup.spriteIndex[i] = spriteId
    sprites[i] = { id: spriteId, pixels }
  }

  setThingFrameGroup(thing, FGT.DEFAULT, frameGroup)

  const spriteMap = new Map<FrameGroupType, SpriteData[]>()
  spriteMap.set(FGT.DEFAULT, sprites)

  return createThingData(OBDVersion.VERSION_1, clientVersion, thing, spriteMap)
}

// ---------------------------------------------------------------------------
// V2: Encode
// ---------------------------------------------------------------------------

function encodeV2(data: ThingData): ArrayBuffer {
  const writer = new BinaryWriter(4096)

  // Header
  writer.writeUint16(OBDVersion.VERSION_2)
  writer.writeUint16(data.clientVersion)
  writer.writeUint8(getThingCategoryValue(data.thing.category))

  // Placeholder for sprites position
  const spritePosOffset = writer.position
  writer.writeUint32(0)

  // Properties (generic OBD format)
  writeObdProperties(writer, data.thing)

  // Update sprites position
  const spritesPosition = writer.position
  writer.position = spritePosOffset
  writer.writeUint32(spritesPosition)
  writer.position = spritesPosition

  // Frame group (DEFAULT only for V2)
  const frameGroup = getThingFrameGroup(data.thing, FGT.DEFAULT)
  if (!frameGroup) throw new Error('V2 encode: missing DEFAULT frame group')

  validateFrameGroup(frameGroup)
  writeFrameGroupLayout(writer, frameGroup)
  writeAnimationData(writer, frameGroup)

  // Sprites (fixed size: SPRITE_DEFAULT_DATA_SIZE per sprite)
  const sprites = data.sprites.get(FGT.DEFAULT) ?? []
  const totalSprites = getFrameGroupTotalSprites(frameGroup)
  for (let i = 0; i < totalSprites; i++) {
    const sprite = sprites[i]
    writer.writeUint32(sprite?.id ?? 0)
    // V2: fixed size (4096 bytes), pad with zeros if needed
    const pixels = sprite?.pixels ?? new Uint8Array(SPRITE_DEFAULT_DATA_SIZE)
    if (pixels.length > SPRITE_DEFAULT_DATA_SIZE) {
      throw new Error(
        `Invalid sprite data length: expected ${SPRITE_DEFAULT_DATA_SIZE}, got ${pixels.length}`
      )
    }
    const padded =
      pixels.length === SPRITE_DEFAULT_DATA_SIZE
        ? pixels
        : padToSize(pixels, SPRITE_DEFAULT_DATA_SIZE)
    writer.writeBytes(padded)
  }

  return writer.toArrayBuffer()
}

// ---------------------------------------------------------------------------
// V2: Decode
// ---------------------------------------------------------------------------

function decodeV2(reader: BinaryReader): ThingData {
  // Header
  reader.readUint16() // OBD version (200 or 300)
  const clientVersion = reader.readUint16()
  const categoryValue = reader.readUint8()
  reader.readUint32() // sprites position (not used for sequential reading)

  const category = getThingCategoryByValue(categoryValue)
  if (!category) throw new Error(`Invalid category value: ${categoryValue}`)

  const thing = createThingType()
  thing.category = category

  // Properties (generic OBD format)
  readObdProperties(reader, thing)

  // Frame group layout
  const frameGroup = readFrameGroupLayout(reader)
  validateFrameGroup(frameGroup)

  // Animation data
  readAnimationData(reader, frameGroup)

  // Sprites (fixed size: SPRITE_DEFAULT_DATA_SIZE)
  const totalSprites = getFrameGroupTotalSprites(frameGroup)
  frameGroup.spriteIndex = new Array<number>(totalSprites)
  const sprites: SpriteData[] = new Array(totalSprites)

  for (let i = 0; i < totalSprites; i++) {
    const spriteId = reader.readUint32()
    validateReadableBytes(reader, SPRITE_DEFAULT_DATA_SIZE)
    const pixels = reader.readBytes(SPRITE_DEFAULT_DATA_SIZE)

    frameGroup.spriteIndex[i] = spriteId
    sprites[i] = { id: spriteId, pixels }
  }

  setThingFrameGroup(thing, FGT.DEFAULT, frameGroup)

  const spriteMap = new Map<FrameGroupType, SpriteData[]>()
  spriteMap.set(FGT.DEFAULT, sprites)

  return createThingData(OBDVersion.VERSION_2, clientVersion, thing, spriteMap)
}

// ---------------------------------------------------------------------------
// V3: Encode
// ---------------------------------------------------------------------------

function encodeV3(data: ThingData): ArrayBuffer {
  const writer = new BinaryWriter(4096)

  // Header
  writer.writeUint16(OBDVersion.VERSION_3)
  writer.writeUint16(data.clientVersion)
  writer.writeUint8(getThingCategoryValue(data.thing.category))

  // Placeholder for sprites position
  const spritePosOffset = writer.position
  writer.writeUint32(0)

  // Properties (generic OBD format)
  writeObdProperties(writer, data.thing)

  // Update sprites position
  const spritesPosition = writer.position
  writer.position = spritePosOffset
  writer.writeUint32(spritesPosition)
  writer.position = spritesPosition

  // Frame groups
  const isOutfit = data.thing.category === TC.OUTFIT
  const groupCount = isOutfit ? data.thing.frameGroups.filter(Boolean).length : 1

  if (isOutfit) {
    writer.writeUint8(groupCount)
  }

  for (let g = 0; g < groupCount; g++) {
    const groupType = g as FrameGroupType

    if (isOutfit) {
      writer.writeUint8(groupCount < 2 ? 1 : g)
    }

    const frameGroup = getThingFrameGroup(data.thing, groupType)
    if (!frameGroup) continue

    validateFrameGroup(frameGroup)
    writeFrameGroupLayout(writer, frameGroup)
    writeAnimationData(writer, frameGroup)

    // Sprites (variable size with length prefix)
    const sprites = data.sprites.get(groupType) ?? []
    const totalSprites = getFrameGroupTotalSprites(frameGroup)
    for (let i = 0; i < totalSprites; i++) {
      const sprite = sprites[i]
      const pixels = sprite?.pixels
      if (pixels) validateSpritePixelsLength(pixels.length)
      writer.writeUint32(sprite?.id ?? 0)
      writer.writeUint32(pixels?.length ?? 0)
      if (pixels && pixels.length > 0) {
        writer.writeBytes(pixels)
      }
    }
  }

  return writer.toArrayBuffer()
}

// ---------------------------------------------------------------------------
// V3: Decode
// ---------------------------------------------------------------------------

function decodeV3(reader: BinaryReader): ThingData {
  // Header
  reader.readUint16() // OBD version (300)
  const clientVersion = reader.readUint16()
  const categoryValue = reader.readUint8()
  reader.readUint32() // sprites position (not used for sequential reading)

  const category = getThingCategoryByValue(categoryValue)
  if (!category) throw new Error(`Invalid category value: ${categoryValue}`)

  const thing = createThingType()
  thing.category = category

  // Properties (generic OBD format)
  readObdProperties(reader, thing)

  // Frame groups
  const isOutfit = category === TC.OUTFIT
  const groupCount = isOutfit ? reader.readUint8() : 1

  const spriteMap = new Map<FrameGroupType, SpriteData[]>()

  for (let g = 0; g < groupCount; g++) {
    const groupType = (isOutfit ? g : FGT.DEFAULT) as FrameGroupType

    if (isOutfit) {
      reader.readUint8() // group ID (consumed)
    }

    // Frame group layout
    const frameGroup = readFrameGroupLayout(reader)
    validateFrameGroup(frameGroup)

    // Animation data
    readAnimationData(reader, frameGroup)

    // Sprites (variable size with length prefix)
    const totalSprites = getFrameGroupTotalSprites(frameGroup)
    frameGroup.spriteIndex = new Array<number>(totalSprites)
    const sprites: SpriteData[] = new Array(totalSprites)

    for (let i = 0; i < totalSprites; i++) {
      const spriteId = reader.readUint32()
      const dataSize = reader.readUint32()
      validateSpritePixelsLength(dataSize)
      validateReadableBytes(reader, dataSize)
      const pixels = dataSize > 0 ? reader.readBytes(dataSize) : null

      frameGroup.spriteIndex[i] = spriteId
      sprites[i] = { id: spriteId, pixels }
    }

    setThingFrameGroup(thing, groupType, frameGroup)
    spriteMap.set(groupType, sprites)
  }

  return createThingData(OBDVersion.VERSION_3, clientVersion, thing, spriteMap)
}

// ---------------------------------------------------------------------------
// Shared helpers: Frame group layout
// ---------------------------------------------------------------------------

function writeFrameGroupLayout(writer: BinaryWriter, fg: FrameGroup): void {
  writer.writeUint8(fg.width)
  writer.writeUint8(fg.height)
  if (fg.width > 1 || fg.height > 1) {
    writer.writeUint8(fg.exactSize)
  }
  writer.writeUint8(fg.layers)
  writer.writeUint8(fg.patternX)
  writer.writeUint8(fg.patternY)
  writer.writeUint8(fg.patternZ || 1)
  writer.writeUint8(fg.frames)
}

function readFrameGroupLayout(reader: BinaryReader): FrameGroup {
  const fg = createFrameGroup()
  fg.width = reader.readUint8()
  fg.height = reader.readUint8()
  if (fg.width > 1 || fg.height > 1) {
    fg.exactSize = reader.readUint8()
  } else {
    fg.exactSize = SPRITE_DEFAULT_SIZE
  }
  fg.layers = reader.readUint8()
  fg.patternX = reader.readUint8()
  fg.patternY = reader.readUint8()
  fg.patternZ = reader.readUint8()
  fg.frames = reader.readUint8()
  return fg
}

// ---------------------------------------------------------------------------
// Shared helpers: Animation data (V2/V3)
// ---------------------------------------------------------------------------

function writeAnimationData(writer: BinaryWriter, fg: FrameGroup): void {
  if (!fg.isAnimation || fg.frames <= 1) return
  writer.writeUint8(fg.animationMode)
  writer.writeInt32(fg.loopCount)
  writer.writeInt8(fg.startFrame)
  for (let i = 0; i < fg.frames; i++) {
    const fd = fg.frameDurations?.[i]
    writer.writeUint32(fd?.minimum ?? 0)
    writer.writeUint32(fd?.maximum ?? 0)
  }
}

function readAnimationData(reader: BinaryReader, fg: FrameGroup): void {
  if (fg.frames <= 1) return
  fg.isAnimation = true
  fg.animationMode = reader.readUint8() as AnimationMode
  fg.loopCount = reader.readInt32()
  fg.startFrame = reader.readInt8()
  fg.frameDurations = new Array<FrameDuration>(fg.frames)
  for (let i = 0; i < fg.frames; i++) {
    const minimum = reader.readUint32()
    const maximum = reader.readUint32()
    fg.frameDurations[i] = createFrameDuration(minimum, maximum)
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function padToSize(data: Uint8Array, size: number): Uint8Array {
  const result = new Uint8Array(size)
  result.set(data)
  return result
}
