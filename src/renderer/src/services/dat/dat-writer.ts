/**
 * DAT file writer - writes OpenTibia metadata (DAT) binary files.
 * Ported from legacy AS3: otlib/things/MetadataWriter.as, MetadataWriter1-6.as,
 * otlib/things/ThingTypeStorage.as (save/compile logic)
 *
 * Supports client versions 7.10 through 10.56+ (MetadataFlags 1-6).
 */

import { BinaryWriter } from './binary-stream'
import type { DatReadResult } from './dat-reader'
import {
  type ThingType,
  ThingCategory as TC,
  type FrameGroup,
  createFrameGroup,
  getThingFrameGroup,
  getFrameGroupTotalSprites,
  makeOutfitFrameGroup,
  type ClientFeatures,
  Direction,
  MetadataFlags1,
  MetadataFlags2,
  MetadataFlags3,
  MetadataFlags4,
  MetadataFlags5,
  MetadataFlags6,
  LAST_FLAG
} from '../../types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Writes a DAT binary file from parsed thing types.
 *
 * @param data - Parsed DAT data (from readDat or manually constructed)
 * @param version - Target client version number (e.g. 710, 860, 1056)
 * @param features - Target client feature flags
 */
export function writeDat(
  data: DatReadResult,
  version: number,
  features: ClientFeatures
): ArrayBuffer {
  const writer = new BinaryWriter(1024 * 1024) // 1MB initial, will grow as needed

  // Write header
  writer.writeUint32(data.signature)
  writer.writeUint16(data.maxItemId)
  writer.writeUint16(data.maxOutfitId)
  writer.writeUint16(data.maxEffectId)
  writer.writeUint16(data.maxMissileId)

  const { writeItemProps, writeNonItemProps } = getPropertyWriters(version)
  const hasPatternZ = version >= 755

  // Write items
  for (const thing of data.items) {
    writeItemProps(writer, thing)
    writeTexturePatterns(writer, thing, features, hasPatternZ)
  }

  // Write outfits
  for (const thing of data.outfits) {
    writeNonItemProps(writer, thing)
    writeTexturePatterns(writer, thing, features, hasPatternZ)
  }

  // Write effects
  for (const thing of data.effects) {
    writeNonItemProps(writer, thing)
    writeTexturePatterns(writer, thing, features, hasPatternZ)
  }

  // Write missiles
  for (const thing of data.missiles) {
    writeNonItemProps(writer, thing)
    writeTexturePatterns(writer, thing, features, hasPatternZ)
  }

  return writer.toArrayBuffer()
}

function createFallbackFrameGroup(thing: ThingType, groupType: 0 | 1): FrameGroup {
  if (thing.category === TC.OUTFIT) {
    const frameGroup = makeOutfitFrameGroup(0)
    frameGroup.type = groupType
    return frameGroup
  }

  const frameGroup = createFrameGroup()
  frameGroup.type = groupType
  if (thing.category === TC.MISSILE) {
    frameGroup.patternX = 3
    frameGroup.patternY = 3
  }
  frameGroup.spriteIndex = new Array(getFrameGroupTotalSprites(frameGroup)).fill(0)
  return frameGroup
}

function normalizeSpriteIndex(frameGroup: FrameGroup): number[] {
  const totalSprites = getFrameGroupTotalSprites(frameGroup)
  const spriteIndex = new Array<number>(totalSprites).fill(0)

  for (let i = 0; i < totalSprites; i++) {
    spriteIndex[i] = frameGroup.spriteIndex[i] ?? 0
  }

  return spriteIndex
}

// ---------------------------------------------------------------------------
// Texture patterns (shared across all versions)
// ---------------------------------------------------------------------------

function writeTexturePatterns(
  writer: BinaryWriter,
  thing: ThingType,
  features: ClientFeatures,
  hasPatternZ: boolean
): void {
  const extended = features.extended
  const improvedAnimations = features.improvedAnimations
  const useFrameGroups = features.frameGroups

  let groupCount = 1
  if (useFrameGroups && thing.category === TC.OUTFIT) {
    groupCount = Math.max(thing.frameGroups.length, 1)
    writer.writeUint8(groupCount)
  }

  for (let groupType = 0; groupType < groupCount; groupType++) {
    if (useFrameGroups && thing.category === TC.OUTFIT) {
      let group = groupType
      if (groupCount < 2) group = 1
      writer.writeUint8(group)
    }

    const frameGroup =
      getThingFrameGroup(thing, groupType as 0 | 1) ??
      createFallbackFrameGroup(thing, groupType as 0 | 1)

    writer.writeUint8(frameGroup.width)
    writer.writeUint8(frameGroup.height)

    if (frameGroup.width > 1 || frameGroup.height > 1) {
      writer.writeUint8(frameGroup.exactSize)
    }

    writer.writeUint8(frameGroup.layers)
    writer.writeUint8(frameGroup.patternX)
    writer.writeUint8(frameGroup.patternY)
    if (hasPatternZ) {
      writer.writeUint8(frameGroup.patternZ)
    }
    writer.writeUint8(frameGroup.frames)

    if (improvedAnimations && frameGroup.frames > 1) {
      writer.writeUint8(frameGroup.animationMode)
      writer.writeInt32(frameGroup.loopCount)
      writer.writeInt8(frameGroup.startFrame)

      for (let i = 0; i < frameGroup.frames; i++) {
        const fd = frameGroup.frameDurations?.[i]
        writer.writeUint32(fd?.minimum ?? 0)
        writer.writeUint32(fd?.maximum ?? 0)
      }
    }

    const spriteIndex = normalizeSpriteIndex(frameGroup)
    for (let i = 0; i < spriteIndex.length; i++) {
      if (extended) {
        writer.writeUint32(spriteIndex[i])
      } else {
        writer.writeUint16(spriteIndex[i])
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Version selector
// ---------------------------------------------------------------------------

export type WritePropertiesFn = (writer: BinaryWriter, thing: ThingType) => void

export interface PropertyWriters {
  writeItemProps: WritePropertiesFn
  writeNonItemProps: WritePropertiesFn
}

export function getPropertyWriters(version: number): PropertyWriters {
  if (version < 740)
    return { writeItemProps: writeItemPropsV1, writeNonItemProps: writeNonItemPropsV1 }
  if (version < 755)
    return { writeItemProps: writeItemPropsV2, writeNonItemProps: writeNonItemPropsV2 }
  if (version < 780)
    return { writeItemProps: writeItemPropsV3, writeNonItemProps: writeNonItemPropsV3 }
  if (version < 860)
    return { writeItemProps: writeItemPropsV4, writeNonItemProps: writeNonItemPropsV4 }
  if (version < 1010)
    return { writeItemProps: writeItemPropsV5, writeNonItemProps: writeNonItemPropsV5 }
  return { writeItemProps: writeItemPropsV6, writeNonItemProps: writeNonItemPropsV6 }
}

// ---------------------------------------------------------------------------
// Version 1: Clients 7.10 - 7.30
// ---------------------------------------------------------------------------

function writeNonItemPropsV1(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags1
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) writer.writeUint8(F.HAS_OFFSET)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV1(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags1
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFINDER)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.floorChange) writer.writeUint8(F.FLOOR_CHANGE)
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.hasOffset) writer.writeUint8(F.HAS_OFFSET)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.topEffect && thing.category === TC.EFFECT) writer.writeUint8(F.TOP_EFFECT)
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.wrappable) writer.writeUint8(F.WRAPPABLE)
  if (thing.unwrappable) writer.writeUint8(F.UNWRAPPABLE)
  writer.writeUint8(LAST_FLAG)
}

// ---------------------------------------------------------------------------
// Version 2: Clients 7.40 - 7.50
// ---------------------------------------------------------------------------

function writeNonItemPropsV2(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags2
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) writer.writeUint8(F.HAS_OFFSET)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV2(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags2
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFINDER)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.floorChange) writer.writeUint8(F.FLOOR_CHANGE)
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.hasOffset) writer.writeUint8(F.HAS_OFFSET)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.hangable) writer.writeUint8(F.HANGABLE)
  if (thing.isVertical) writer.writeUint8(F.VERTICAL)
  if (thing.isHorizontal) writer.writeUint8(F.HORIZONTAL)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.topEffect && thing.category === TC.EFFECT) writer.writeUint8(F.TOP_EFFECT)
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.wrappable) writer.writeUint8(F.WRAPPABLE)
  if (thing.unwrappable) writer.writeUint8(F.UNWRAPPABLE)
  writer.writeUint8(LAST_FLAG)
}

// ---------------------------------------------------------------------------
// Version 3: Clients 7.55 - 7.72
// ---------------------------------------------------------------------------

function writeNonItemPropsV3(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags3
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV3(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags3
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isGroundBorder) {
    writer.writeUint8(F.GROUND_BORDER)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFINDER)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hangable) writer.writeUint8(F.HANGABLE)
  if (thing.isVertical) writer.writeUint8(F.VERTICAL)
  if (thing.isHorizontal) writer.writeUint8(F.HORIZONTAL)
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.floorChange) writer.writeUint8(F.FLOOR_CHANGE)
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  writer.writeUint8(LAST_FLAG)
}

// ---------------------------------------------------------------------------
// Version 4: Clients 7.80 - 8.54
// ---------------------------------------------------------------------------

function writeNonItemPropsV4(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags4
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.hasBones) {
    writer.writeUint8(F.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV4(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags4
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isGroundBorder) {
    writer.writeUint8(F.GROUND_BORDER)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.hasCharges) writer.writeUint8(F.HAS_CHARGES)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFIND)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hangable) writer.writeUint8(F.HANGABLE)
  if (thing.isVertical) writer.writeUint8(F.VERTICAL)
  if (thing.isHorizontal) writer.writeUint8(F.HORIZONTAL)
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.dontHide) writer.writeUint8(F.DONT_HIDE)
  if (thing.floorChange) writer.writeUint8(F.FLOOR_CHANGE)
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  if (thing.ignoreLook) writer.writeUint8(F.IGNORE_LOOK)
  // Note: legacy uses MetadataFlags6.WRAPPABLE/UNWRAPPABLE here (confirmed in source)
  if (thing.wrappable) writer.writeUint8(MetadataFlags6.WRAPPABLE)
  if (thing.unwrappable) writer.writeUint8(MetadataFlags6.UNWRAPPABLE)
  if (thing.hasBones) {
    writer.writeUint8(F.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}

// ---------------------------------------------------------------------------
// Version 5: Clients 8.60 - 9.86
// ---------------------------------------------------------------------------

function writeNonItemPropsV5(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags5
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.hasBones) {
    // Note: legacy uses MetadataFlags4.HAS_BONES here (confirmed in source)
    writer.writeUint8(MetadataFlags4.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV5(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags5
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isGroundBorder) {
    writer.writeUint8(F.GROUND_BORDER)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFIND)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hangable) writer.writeUint8(F.HANGABLE)
  if (thing.isVertical) writer.writeUint8(F.VERTICAL)
  if (thing.isHorizontal) writer.writeUint8(F.HORIZONTAL)
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.dontHide) writer.writeUint8(F.DONT_HIDE)
  if (thing.isTranslucent) writer.writeUint8(F.TRANSLUCENT)
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  if (thing.ignoreLook) writer.writeUint8(F.IGNORE_LOOK)
  if (thing.cloth) {
    writer.writeUint8(F.CLOTH)
    writer.writeUint16(thing.clothSlot)
  }
  if (thing.isMarketItem) {
    writer.writeUint8(F.MARKET_ITEM)
    writer.writeUint16(thing.marketCategory)
    writer.writeUint16(thing.marketTradeAs)
    writer.writeUint16(thing.marketShowAs)
    writer.writeUint16(thing.marketName.length)
    writer.writeMultiByte(thing.marketName, MetadataFlags5.STRING_CHARSET)
    writer.writeUint16(thing.marketRestrictProfession)
    writer.writeUint16(thing.marketRestrictLevel)
  }
  if (thing.hasBones) {
    writer.writeUint8(F.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}

// ---------------------------------------------------------------------------
// Version 6: Clients 10.10 - 10.56+
// ---------------------------------------------------------------------------

function writeNonItemPropsV6(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags6
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.topEffect && thing.category === TC.EFFECT) writer.writeUint8(F.TOP_EFFECT)
  if (thing.hasBones) {
    // Note: legacy uses MetadataFlags4.HAS_BONES here (confirmed in source)
    writer.writeUint8(MetadataFlags4.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}

function writeItemPropsV6(writer: BinaryWriter, thing: ThingType): void {
  const F = MetadataFlags6
  if (thing.isGround) {
    writer.writeUint8(F.GROUND)
    writer.writeUint16(thing.groundSpeed)
  } else if (thing.isGroundBorder) {
    writer.writeUint8(F.GROUND_BORDER)
  } else if (thing.isOnBottom) {
    writer.writeUint8(F.ON_BOTTOM)
  } else if (thing.isOnTop) {
    writer.writeUint8(F.ON_TOP)
  }
  if (thing.isContainer) writer.writeUint8(F.CONTAINER)
  if (thing.stackable) writer.writeUint8(F.STACKABLE)
  if (thing.forceUse) writer.writeUint8(F.FORCE_USE)
  if (thing.multiUse) writer.writeUint8(F.MULTI_USE)
  if (thing.writable) {
    writer.writeUint8(F.WRITABLE)
    writer.writeUint16(thing.maxReadWriteChars)
  }
  if (thing.writableOnce) {
    writer.writeUint8(F.WRITABLE_ONCE)
    writer.writeUint16(thing.maxReadChars)
  }
  if (thing.isFluidContainer) writer.writeUint8(F.FLUID_CONTAINER)
  if (thing.isFluid) writer.writeUint8(F.FLUID)
  if (thing.isUnpassable) writer.writeUint8(F.UNPASSABLE)
  if (thing.isUnmoveable) writer.writeUint8(F.UNMOVEABLE)
  if (thing.blockMissile) writer.writeUint8(F.BLOCK_MISSILE)
  if (thing.blockPathfind) writer.writeUint8(F.BLOCK_PATHFIND)
  if (thing.noMoveAnimation) writer.writeUint8(F.NO_MOVE_ANIMATION)
  if (thing.pickupable) writer.writeUint8(F.PICKUPABLE)
  if (thing.hangable) writer.writeUint8(F.HANGABLE)
  if (thing.isVertical) writer.writeUint8(F.VERTICAL)
  if (thing.isHorizontal) writer.writeUint8(F.HORIZONTAL)
  if (thing.rotatable) writer.writeUint8(F.ROTATABLE)
  if (thing.hasLight) {
    writer.writeUint8(F.HAS_LIGHT)
    writer.writeUint16(thing.lightLevel)
    writer.writeUint16(thing.lightColor)
  }
  if (thing.dontHide) writer.writeUint8(F.DONT_HIDE)
  if (thing.isTranslucent) writer.writeUint8(F.TRANSLUCENT)
  if (thing.hasOffset) {
    writer.writeUint8(F.HAS_OFFSET)
    writer.writeInt16(thing.offsetX)
    writer.writeInt16(thing.offsetY)
  }
  if (thing.hasElevation) {
    writer.writeUint8(F.HAS_ELEVATION)
    writer.writeUint16(thing.elevation)
  }
  if (thing.isLyingObject) writer.writeUint8(F.LYING_OBJECT)
  if (thing.animateAlways) writer.writeUint8(F.ANIMATE_ALWAYS)
  if (thing.miniMap) {
    writer.writeUint8(F.MINI_MAP)
    writer.writeUint16(thing.miniMapColor)
  }
  if (thing.isLensHelp) {
    writer.writeUint8(F.LENS_HELP)
    writer.writeUint16(thing.lensHelp)
  }
  if (thing.isFullGround) writer.writeUint8(F.FULL_GROUND)
  if (thing.ignoreLook) writer.writeUint8(F.IGNORE_LOOK)
  if (thing.cloth) {
    writer.writeUint8(F.CLOTH)
    writer.writeUint16(thing.clothSlot)
  }
  if (thing.isMarketItem) {
    writer.writeUint8(F.MARKET_ITEM)
    writer.writeUint16(thing.marketCategory)
    writer.writeUint16(thing.marketTradeAs)
    writer.writeUint16(thing.marketShowAs)
    writer.writeUint16(thing.marketName.length)
    writer.writeMultiByte(thing.marketName, MetadataFlags6.STRING_CHARSET)
    writer.writeUint16(thing.marketRestrictProfession)
    writer.writeUint16(thing.marketRestrictLevel)
  }
  if (thing.hasDefaultAction) {
    writer.writeUint8(F.DEFAULT_ACTION)
    writer.writeUint16(thing.defaultAction)
  }
  if (thing.wrappable) writer.writeUint8(F.WRAPPABLE)
  if (thing.unwrappable) writer.writeUint8(F.UNWRAPPABLE)
  if (thing.usable) writer.writeUint8(F.USABLE)
  if (thing.hasBones) {
    writer.writeUint8(F.HAS_BONES)
    writer.writeInt16(thing.bonesOffsetX[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.NORTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetY[Direction.SOUTH])
    writer.writeInt16(thing.bonesOffsetX[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetY[Direction.EAST])
    writer.writeInt16(thing.bonesOffsetX[Direction.WEST])
    writer.writeInt16(thing.bonesOffsetY[Direction.WEST])
  }
  writer.writeUint8(LAST_FLAG)
}
