/**
 * DAT file reader - reads OpenTibia metadata (DAT) binary files.
 * Ported from legacy AS3: otlib/things/MetadataReader.as, MetadataReader1-6.as,
 * otlib/things/ThingTypeStorage.as (load logic)
 *
 * Supports client versions 7.10 through 10.56+ (MetadataFlags 1-6).
 */

import { BinaryReader } from './binary-stream'
import {
  type ThingType,
  type ThingCategory,
  ThingCategory as TC,
  createThingType,
  setThingFrameGroup,
  type FrameGroup,
  type FrameDuration,
  type AnimationMode,
  createFrameGroup,
  createFrameDuration,
  getFrameGroupTotalSprites,
  getFrameGroupSpriteIndex,
  type ClientFeatures,
  Direction,
  MetadataFlags1,
  MetadataFlags2,
  MetadataFlags3,
  MetadataFlags4,
  MetadataFlags5,
  MetadataFlags6,
  LAST_FLAG,
  SPRITE_DEFAULT_SIZE
} from '../../types'
import {
  PXG_RUNTIME_FLAGS,
  getPxgRuntimeItemFlags,
  hasPxgRuntimeFlag,
  type PxgDatRuntime,
  type PxgRuntimeFlags,
  type PxgRuntimeMetadata,
  type PxgRuntimeTexture
} from '../pxg-runtime'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DAT file header byte offsets */
const HEADER_SIGNATURE = 0
const HEADER_ITEMS_COUNT = 4
const HEADER_OUTFITS_COUNT = 6
const HEADER_EFFECTS_COUNT = 8
const HEADER_MISSILES_COUNT = 10
const HEADER_SIZE = 12

/** Minimum IDs per category (OpenTibia protocol) */
const MIN_ITEM_ID = 100
const MIN_OUTFIT_ID = 1
const MIN_EFFECT_ID = 1
const MIN_MISSILE_ID = 1

const MAX_THING_SPRITES = 1048576

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DatReadResult {
  signature: number
  maxItemId: number
  maxOutfitId: number
  maxEffectId: number
  maxMissileId: number
  items: ThingType[]
  outfits: ThingType[]
  effects: ThingType[]
  missiles: ThingType[]
}

export type DefaultDurationFn = (category: ThingCategory) => number

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads a DAT binary file and returns all parsed thing types.
 *
 * @param buffer - Raw DAT file bytes
 * @param version - Client version number (e.g. 710, 860, 1056)
 * @param features - Client feature flags
 * @param getDefaultDuration - Callback returning default animation duration (ms) per category
 */
export function readDat(
  buffer: ArrayBuffer,
  version: number,
  features: ClientFeatures,
  getDefaultDuration: DefaultDurationFn,
  runtime?: PxgDatRuntime | null
): DatReadResult {
  const reader = new BinaryReader(buffer)
  const runtimeMetadata = runtime?.metadata ?? null
  const runtimeContext: RuntimeReadContext = {
    metadata: runtimeMetadata,
    textureIndex: 0
  }

  // Read header
  reader.position = HEADER_SIGNATURE
  const signature = reader.readUint32()

  let maxItemId: number
  let maxOutfitId: number
  let maxEffectId: number
  let maxMissileId: number

  if (runtimeMetadata) {
    maxItemId = runtimeMetadata.maxItemId
    maxOutfitId = runtimeMetadata.maxOutfitId
    maxEffectId = runtimeMetadata.maxEffectId
    maxMissileId = runtimeMetadata.maxMissileId
  } else {
    reader.position = HEADER_ITEMS_COUNT
    maxItemId = reader.readUint16()

    reader.position = HEADER_OUTFITS_COUNT
    maxOutfitId = reader.readUint16()

    reader.position = HEADER_EFFECTS_COUNT
    maxEffectId = reader.readUint16()

    reader.position = HEADER_MISSILES_COUNT
    maxMissileId = reader.readUint16()
  }

  // Position after header for sequential reading
  reader.position = HEADER_SIZE

  const readProps = getPropertyReader(version)
  const hasPatternZ = version >= 755

  // Read items (100 to maxItemId)
  const items: ThingType[] = []
  for (let id = MIN_ITEM_ID; id <= maxItemId; id++) {
    const thing = createThingType()
    thing.id = id
    thing.category = TC.ITEM
    readProps(reader, thing)
    readTexturePatterns(reader, thing, features, getDefaultDuration, hasPatternZ, runtimeContext)
    items.push(thing)
  }

  // Read outfits (1 to maxOutfitId)
  const outfits: ThingType[] = []
  for (let id = MIN_OUTFIT_ID; id <= maxOutfitId; id++) {
    const thing = createThingType()
    thing.id = id
    thing.category = TC.OUTFIT
    readProps(reader, thing)
    readTexturePatterns(reader, thing, features, getDefaultDuration, hasPatternZ, runtimeContext)
    outfits.push(thing)
  }

  // Read effects (1 to maxEffectId)
  const effects: ThingType[] = []
  for (let id = MIN_EFFECT_ID; id <= maxEffectId; id++) {
    const thing = createThingType()
    thing.id = id
    thing.category = TC.EFFECT
    readProps(reader, thing)
    readTexturePatterns(reader, thing, features, getDefaultDuration, hasPatternZ, runtimeContext)
    effects.push(thing)
  }

  // Read missiles (1 to maxMissileId)
  const missiles: ThingType[] = []
  for (let id = MIN_MISSILE_ID; id <= maxMissileId; id++) {
    const thing = createThingType()
    thing.id = id
    thing.category = TC.MISSILE
    readProps(reader, thing)
    readTexturePatterns(reader, thing, features, getDefaultDuration, hasPatternZ, runtimeContext)
    missiles.push(thing)
  }

  applyPxgRuntimeFlags(items, runtime?.flags ?? null)

  return {
    signature,
    maxItemId,
    maxOutfitId,
    maxEffectId,
    maxMissileId,
    items,
    outfits,
    effects,
    missiles
  }
}

// ---------------------------------------------------------------------------
// Texture patterns (shared across all versions)
// ---------------------------------------------------------------------------

interface RuntimeReadContext {
  metadata: PxgRuntimeMetadata | null
  textureIndex: number
}

function readTexturePatterns(
  reader: BinaryReader,
  thing: ThingType,
  features: ClientFeatures,
  getDefaultDuration: DefaultDurationFn,
  hasPatternZ: boolean,
  runtimeContext: RuntimeReadContext
): void {
  const extended = features.extended
  const improvedAnimations = features.improvedAnimations
  const useFrameGroups = features.frameGroups
  const runtimeTexture = runtimeContext.metadata
    ? (runtimeContext.metadata.textures[runtimeContext.textureIndex++] ?? null)
    : null

  let groupCount = 1
  if (useFrameGroups && thing.category === TC.OUTFIT) {
    groupCount = reader.readUint8()
  }

  for (let groupType = 0; groupType < groupCount; groupType++) {
    if (useFrameGroups && thing.category === TC.OUTFIT) {
      reader.readUint8() // group type byte (consumed but not used)
    }

    const frameGroup: FrameGroup = createFrameGroup()
    const storedFrameGroup: FrameGroup = createFrameGroup()
    const groupRuntimeTexture = groupType === 0 ? runtimeTexture : null
    frameGroup.width = reader.readUint8()
    frameGroup.height = reader.readUint8()

    if (frameGroup.width > 1 || frameGroup.height > 1) {
      frameGroup.exactSize = reader.readUint8()
    } else {
      frameGroup.exactSize = SPRITE_DEFAULT_SIZE
    }
    storedFrameGroup.width = frameGroup.width
    storedFrameGroup.height = frameGroup.height
    storedFrameGroup.exactSize = frameGroup.exactSize

    const rawLayers = reader.readUint8()
    const rawPatternX = reader.readUint8()
    const rawPatternY = reader.readUint8()
    if (runtimeContext.metadata) {
      applyPxgAxisMapping(frameGroup, thing.category, rawLayers, rawPatternX, rawPatternY)
    } else {
      frameGroup.layers = rawLayers
      frameGroup.patternX = rawPatternX
      frameGroup.patternY = rawPatternY
    }
    storedFrameGroup.layers = frameGroup.layers
    storedFrameGroup.patternX = frameGroup.patternX
    storedFrameGroup.patternY = frameGroup.patternY

    const encodedPatternZ = hasPatternZ ? reader.readUint8() : 1
    const resolvedPatternZ =
      groupRuntimeTexture && encodedPatternZ === 64 && groupRuntimeTexture.patternZ > 64
        ? groupRuntimeTexture.patternZ
        : encodedPatternZ
    const encodedFrames = reader.readUint8()
    const promotePatternZToFrames = shouldUsePatternZAsAnimationFrames(
      groupRuntimeTexture,
      resolvedPatternZ,
      encodedFrames
    )

    frameGroup.patternZ = promotePatternZToFrames ? 1 : resolvedPatternZ
    frameGroup.frames = promotePatternZToFrames ? resolvedPatternZ : encodedFrames
    storedFrameGroup.patternZ = frameGroup.patternZ
    storedFrameGroup.frames = frameGroup.frames

    applyPxgRuntimeTexture(frameGroup, groupRuntimeTexture, thing.category)

    if (frameGroup.frames > 1) {
      frameGroup.isAnimation = true
      frameGroup.frameDurations = new Array<FrameDuration>(frameGroup.frames)

      if (improvedAnimations && encodedFrames > 1) {
        frameGroup.animationMode = reader.readUint8() as AnimationMode
        frameGroup.loopCount = reader.readInt32()
        frameGroup.startFrame = reader.readInt8()

        for (let i = 0; i < encodedFrames; i++) {
          const minimum = reader.readUint32()
          const maximum = reader.readUint32()
          if (i < frameGroup.frames) {
            frameGroup.frameDurations[i] = createFrameDuration(minimum, maximum)
          }
        }
        fillDefaultFrameDurations(frameGroup, getDefaultDuration, thing.category, encodedFrames)
      } else {
        fillDefaultFrameDurations(frameGroup, getDefaultDuration, thing.category, 0)
      }
    }

    const totalSprites = getFrameGroupTotalSprites(frameGroup)
    const storedTotalSprites = getFrameGroupTotalSprites(storedFrameGroup)
    if (totalSprites > MAX_THING_SPRITES) {
      throw new Error(`A thing type has more than ${MAX_THING_SPRITES} sprites.`)
    }
    if (storedTotalSprites > MAX_THING_SPRITES) {
      throw new Error(`A thing type has more than ${MAX_THING_SPRITES} sprites.`)
    }

    const storedSpriteIndex = new Array<number>(storedTotalSprites)
    for (let i = 0; i < storedTotalSprites; i++) {
      storedSpriteIndex[i] = extended ? reader.readUint32() : reader.readUint16()
    }

    frameGroup.spriteIndex =
      storedTotalSprites === totalSprites
        ? storedSpriteIndex
        : expandSpriteIndex(storedSpriteIndex, storedFrameGroup, frameGroup)

    setThingFrameGroup(thing, groupType as 0 | 1, frameGroup)
  }
}

function shouldUsePatternZAsAnimationFrames(
  texture: PxgRuntimeTexture | null,
  resolvedPatternZ: number,
  encodedFrames: number
): boolean {
  return texture !== null && encodedFrames === 1 && resolvedPatternZ > 1
}

function applyPxgAxisMapping(
  frameGroup: FrameGroup,
  category: ThingCategory,
  rawLayers: number,
  rawPatternX: number,
  rawPatternY: number
): void {
  if (category === TC.OUTFIT) {
    frameGroup.patternX = rawLayers
    frameGroup.layers = rawPatternX
    frameGroup.patternY = rawPatternY
    return
  }

  frameGroup.patternY = rawLayers
  frameGroup.patternX = rawPatternX
  frameGroup.layers = rawPatternY
}

function applyPxgRuntimeTexture(
  frameGroup: FrameGroup,
  texture: PxgRuntimeTexture | null,
  category: ThingCategory
): void {
  if (!texture) return

  if (texture.width > 0) frameGroup.width = texture.width
  if (texture.height > 0) frameGroup.height = texture.height
  if (texture.exactSize > 0) frameGroup.exactSize = texture.exactSize

  let runtimeLayers = texture.layers
  let runtimePatternX = texture.patternX
  let runtimePatternY = texture.patternY
  if (category === TC.OUTFIT) {
    runtimePatternX = texture.layers
    runtimeLayers = texture.patternX
    runtimePatternY = texture.patternY
  } else {
    runtimePatternY = texture.layers
    runtimePatternX = texture.patternX
    runtimeLayers = texture.patternY
  }

  if (runtimeLayers > 0) frameGroup.layers = runtimeLayers
  if (runtimePatternX > 0) frameGroup.patternX = runtimePatternX
  if (runtimePatternY > 0) frameGroup.patternY = runtimePatternY

  const runtimePatternZ = texture.patternZ > 0 ? texture.patternZ : frameGroup.patternZ
  if (texture.frames === 0 && frameGroup.patternZ === 1 && frameGroup.frames === runtimePatternZ) {
    return
  }

  const runtimeFrames = texture.frames > 0 ? texture.frames : frameGroup.frames
  if (shouldUsePatternZAsAnimationFrames(texture, runtimePatternZ, runtimeFrames)) {
    frameGroup.patternZ = 1
    frameGroup.frames = runtimePatternZ
  } else {
    frameGroup.patternZ = runtimePatternZ
    frameGroup.frames = runtimeFrames
  }
}

function fillDefaultFrameDurations(
  frameGroup: FrameGroup,
  getDefaultDuration: DefaultDurationFn,
  category: ThingCategory,
  startIndex: number
): void {
  if (!frameGroup.frameDurations) return
  const duration = getDefaultDuration(category)
  for (let i = startIndex; i < frameGroup.frames; i++) {
    frameGroup.frameDurations[i] = createFrameDuration(duration, duration)
  }
}

function expandSpriteIndex(
  source: number[],
  sourceGroup: FrameGroup,
  targetGroup: FrameGroup
): number[] {
  const target = new Array<number>(getFrameGroupTotalSprites(targetGroup)).fill(0)
  const maxWidth = Math.min(sourceGroup.width, targetGroup.width)
  const maxHeight = Math.min(sourceGroup.height, targetGroup.height)
  const maxLayers = Math.min(sourceGroup.layers, targetGroup.layers)
  const maxPatternX = Math.min(sourceGroup.patternX, targetGroup.patternX)
  const maxPatternY = Math.min(sourceGroup.patternY, targetGroup.patternY)
  const maxPatternZ = Math.min(sourceGroup.patternZ, targetGroup.patternZ)
  const maxFrames = Math.min(sourceGroup.frames, targetGroup.frames)
  const widthOffset = targetGroup.width > sourceGroup.width ? targetGroup.width - sourceGroup.width : 0
  const heightOffset =
    targetGroup.height > sourceGroup.height ? targetGroup.height - sourceGroup.height : 0

  for (let frame = 0; frame < maxFrames; frame++) {
    for (let patternZ = 0; patternZ < maxPatternZ; patternZ++) {
      for (let patternY = 0; patternY < maxPatternY; patternY++) {
        for (let patternX = 0; patternX < maxPatternX; patternX++) {
          for (let layer = 0; layer < maxLayers; layer++) {
            for (let h = 0; h < maxHeight; h++) {
              for (let w = 0; w < maxWidth; w++) {
                const sourceIndex = getFrameGroupSpriteIndex(
                  sourceGroup,
                  w,
                  h,
                  layer,
                  patternX,
                  patternY,
                  patternZ,
                  frame
                )
                const targetIndex = getFrameGroupSpriteIndex(
                  targetGroup,
                  w + widthOffset,
                  h + heightOffset,
                  layer,
                  patternX,
                  patternY,
                  patternZ,
                  frame
                )
                if (sourceIndex < source.length && targetIndex < target.length) {
                  target[targetIndex] = source[sourceIndex]
                }
              }
            }
          }
        }
      }
    }
  }

  return target
}

function applyPxgRuntimeFlags(items: ThingType[], flags: PxgRuntimeFlags | null): void {
  if (!flags) return

  for (const thing of items) {
    const record = getPxgRuntimeItemFlags(flags, thing.id)
    if (!record) continue

    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.GROUND)) {
      thing.isGround = true
      thing.groundSpeed = record.groundSpeed > 0 ? record.groundSpeed : 100
    }
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.GROUND_BORDER)) thing.isGroundBorder = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.ON_BOTTOM)) thing.isOnBottom = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.ON_TOP)) thing.isOnTop = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.CONTAINER)) thing.isContainer = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.STACKABLE)) thing.stackable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.FORCE_USE)) thing.forceUse = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.MULTI_USE)) thing.multiUse = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.WRITABLE)) thing.writable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.WRITABLE_ONCE)) thing.writableOnce = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.FLUID_CONTAINER)) {
      thing.isFluidContainer = true
    }
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.FLUID)) thing.isFluid = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.NO_MOVE_ANIMATION)) {
      thing.noMoveAnimation = true
    }
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.UNPASSABLE)) thing.isUnpassable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.UNMOVEABLE)) thing.isUnmoveable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.BLOCK_MISSILE)) thing.blockMissile = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.BLOCK_PATHFIND)) thing.blockPathfind = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.PICKUPABLE)) thing.pickupable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.HANGABLE)) thing.hangable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.VERTICAL)) {
      thing.isVertical = true
      thing.hangable = true
    }
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.HORIZONTAL)) {
      thing.isHorizontal = true
      thing.hangable = true
    }
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.ROTATABLE)) thing.rotatable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.DONT_HIDE)) thing.dontHide = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.TRANSLUCENT)) thing.isTranslucent = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.LYING_OBJECT)) thing.isLyingObject = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.ANIMATE_ALWAYS)) thing.animateAlways = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.FULL_GROUND)) thing.isFullGround = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.IGNORE_LOOK)) thing.ignoreLook = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.WRAPPABLE)) thing.wrappable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.UNWRAPPABLE)) thing.unwrappable = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.TOP_EFFECT)) thing.topEffect = true
    if (hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.USABLE)) thing.usable = true
    if (
      hasPxgRuntimeFlag(record, PXG_RUNTIME_FLAGS.MINI_MAP) &&
      record.miniMapColor > 0
    ) {
      thing.miniMap = true
      thing.miniMapColor = record.miniMapColor
    }
  }
}

// ---------------------------------------------------------------------------
// Version selector
// ---------------------------------------------------------------------------

export type ReadPropertiesFn = (reader: BinaryReader, thing: ThingType) => void

export function getPropertyReader(version: number): ReadPropertiesFn {
  if (version < 740) return readPropertiesV1
  if (version < 755) return readPropertiesV2
  if (version < 780) return readPropertiesV3
  if (version < 860) return readPropertiesV4
  if (version < 1010) return readPropertiesV5
  return readPropertiesV6
}

// ---------------------------------------------------------------------------
// Version 1: Clients 7.10 - 7.30
// ---------------------------------------------------------------------------

function readPropertiesV1(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags1
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFINDER:
        thing.blockPathfind = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.FLOOR_CHANGE:
        thing.floorChange = true
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = 8
        thing.offsetY = 8
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.WRAPPABLE:
        thing.wrappable = true
        break
      case F.UNWRAPPABLE:
        thing.unwrappable = true
        break
      case F.TOP_EFFECT:
        thing.topEffect = true
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}

// ---------------------------------------------------------------------------
// Version 2: Clients 7.40 - 7.50
// ---------------------------------------------------------------------------

function readPropertiesV2(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags2
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFINDER:
        thing.blockPathfind = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.FLOOR_CHANGE:
        thing.floorChange = true
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = 8
        thing.offsetY = 8
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.HANGABLE:
        thing.hangable = true
        break
      case F.VERTICAL:
        thing.isVertical = true
        break
      case F.HORIZONTAL:
        thing.isHorizontal = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.WRAPPABLE:
        thing.wrappable = true
        break
      case F.UNWRAPPABLE:
        thing.unwrappable = true
        break
      case F.TOP_EFFECT:
        thing.topEffect = true
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}

// ---------------------------------------------------------------------------
// Version 3: Clients 7.55 - 7.72
// ---------------------------------------------------------------------------

function readPropertiesV3(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags3
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.GROUND_BORDER:
        thing.isGroundBorder = true
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFINDER:
        thing.blockPathfind = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HANGABLE:
        thing.hangable = true
        break
      case F.VERTICAL:
        thing.isVertical = true
        break
      case F.HORIZONTAL:
        thing.isHorizontal = true
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.FLOOR_CHANGE:
        thing.floorChange = true
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = reader.readInt16()
        thing.offsetY = reader.readInt16()
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}

// ---------------------------------------------------------------------------
// Version 4: Clients 7.80 - 8.54
// ---------------------------------------------------------------------------

function readPropertiesV4(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags4
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.GROUND_BORDER:
        thing.isGroundBorder = true
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.HAS_CHARGES:
        thing.hasCharges = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFIND:
        thing.blockPathfind = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HANGABLE:
        thing.hangable = true
        break
      case F.VERTICAL:
        thing.isVertical = true
        break
      case F.HORIZONTAL:
        thing.isHorizontal = true
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.DONT_HIDE:
        thing.dontHide = true
        break
      case F.FLOOR_CHANGE:
        thing.floorChange = true
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = reader.readInt16()
        thing.offsetY = reader.readInt16()
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      case F.IGNORE_LOOK:
        thing.ignoreLook = true
        break
      case F.WRAPPABLE:
        thing.wrappable = true
        break
      case F.UNWRAPPABLE:
        thing.unwrappable = true
        break
      case F.HAS_BONES:
        thing.hasBones = true
        thing.bonesOffsetX[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetY[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetX[Direction.WEST] = reader.readInt16()
        thing.bonesOffsetY[Direction.WEST] = reader.readInt16()
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}

// ---------------------------------------------------------------------------
// Version 5: Clients 8.60 - 9.86
// ---------------------------------------------------------------------------

function readPropertiesV5(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags5
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.GROUND_BORDER:
        thing.isGroundBorder = true
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFIND:
        thing.blockPathfind = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HANGABLE:
        thing.hangable = true
        break
      case F.VERTICAL:
        thing.isVertical = true
        break
      case F.HORIZONTAL:
        thing.isHorizontal = true
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.DONT_HIDE:
        thing.dontHide = true
        break
      case F.TRANSLUCENT:
        thing.isTranslucent = true
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = reader.readInt16()
        thing.offsetY = reader.readInt16()
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      case F.IGNORE_LOOK:
        thing.ignoreLook = true
        break
      case F.CLOTH:
        thing.cloth = true
        thing.clothSlot = reader.readUint16()
        break
      case F.MARKET_ITEM:
        thing.isMarketItem = true
        thing.marketCategory = reader.readUint16()
        thing.marketTradeAs = reader.readUint16()
        thing.marketShowAs = reader.readUint16()
        {
          const nameLength = reader.readUint16()
          thing.marketName = reader.readMultiByte(nameLength, MetadataFlags5.STRING_CHARSET)
        }
        thing.marketRestrictProfession = reader.readUint16()
        thing.marketRestrictLevel = reader.readUint16()
        break
      case F.HAS_BONES:
        thing.hasBones = true
        thing.bonesOffsetX[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetY[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetX[Direction.WEST] = reader.readInt16()
        thing.bonesOffsetY[Direction.WEST] = reader.readInt16()
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}

// ---------------------------------------------------------------------------
// Version 6: Clients 10.10 - 10.56+
// ---------------------------------------------------------------------------

function readPropertiesV6(reader: BinaryReader, thing: ThingType): void {
  const F = MetadataFlags6
  let flag = 0

  while (flag < LAST_FLAG) {
    const previousFlag = flag
    flag = reader.readUint8()
    if (flag === LAST_FLAG) return

    switch (flag) {
      case F.GROUND:
        thing.isGround = true
        thing.groundSpeed = reader.readUint16()
        break
      case F.GROUND_BORDER:
        thing.isGroundBorder = true
        break
      case F.ON_BOTTOM:
        thing.isOnBottom = true
        break
      case F.ON_TOP:
        thing.isOnTop = true
        break
      case F.CONTAINER:
        thing.isContainer = true
        break
      case F.STACKABLE:
        thing.stackable = true
        break
      case F.FORCE_USE:
        thing.forceUse = true
        break
      case F.MULTI_USE:
        thing.multiUse = true
        break
      case F.WRITABLE:
        thing.writable = true
        thing.maxReadWriteChars = reader.readUint16()
        break
      case F.WRITABLE_ONCE:
        thing.writableOnce = true
        thing.maxReadChars = reader.readUint16()
        break
      case F.FLUID_CONTAINER:
        thing.isFluidContainer = true
        break
      case F.FLUID:
        thing.isFluid = true
        break
      case F.UNPASSABLE:
        thing.isUnpassable = true
        break
      case F.UNMOVEABLE:
        thing.isUnmoveable = true
        break
      case F.BLOCK_MISSILE:
        thing.blockMissile = true
        break
      case F.BLOCK_PATHFIND:
        thing.blockPathfind = true
        break
      case F.NO_MOVE_ANIMATION:
        thing.noMoveAnimation = true
        break
      case F.PICKUPABLE:
        thing.pickupable = true
        break
      case F.HANGABLE:
        thing.hangable = true
        break
      case F.VERTICAL:
        thing.isVertical = true
        break
      case F.HORIZONTAL:
        thing.isHorizontal = true
        break
      case F.ROTATABLE:
        thing.rotatable = true
        break
      case F.HAS_LIGHT:
        thing.hasLight = true
        thing.lightLevel = reader.readUint16()
        thing.lightColor = reader.readUint16()
        break
      case F.DONT_HIDE:
        thing.dontHide = true
        break
      case F.TRANSLUCENT:
        thing.isTranslucent = true
        break
      case F.HAS_OFFSET:
        thing.hasOffset = true
        thing.offsetX = reader.readInt16()
        thing.offsetY = reader.readInt16()
        break
      case F.HAS_ELEVATION:
        thing.hasElevation = true
        thing.elevation = reader.readUint16()
        break
      case F.LYING_OBJECT:
        thing.isLyingObject = true
        break
      case F.ANIMATE_ALWAYS:
        thing.animateAlways = true
        break
      case F.MINI_MAP:
        thing.miniMap = true
        thing.miniMapColor = reader.readUint16()
        break
      case F.LENS_HELP:
        thing.isLensHelp = true
        thing.lensHelp = reader.readUint16()
        break
      case F.FULL_GROUND:
        thing.isFullGround = true
        break
      case F.IGNORE_LOOK:
        thing.ignoreLook = true
        break
      case F.CLOTH:
        thing.cloth = true
        thing.clothSlot = reader.readUint16()
        break
      case F.MARKET_ITEM:
        thing.isMarketItem = true
        thing.marketCategory = reader.readUint16()
        thing.marketTradeAs = reader.readUint16()
        thing.marketShowAs = reader.readUint16()
        {
          const nameLength = reader.readUint16()
          thing.marketName = reader.readMultiByte(nameLength, MetadataFlags6.STRING_CHARSET)
        }
        thing.marketRestrictProfession = reader.readUint16()
        thing.marketRestrictLevel = reader.readUint16()
        break
      case F.DEFAULT_ACTION:
        thing.hasDefaultAction = true
        thing.defaultAction = reader.readUint16()
        break
      case F.WRAPPABLE:
        thing.wrappable = true
        break
      case F.UNWRAPPABLE:
        thing.unwrappable = true
        break
      case F.TOP_EFFECT:
        thing.topEffect = true
        break
      case F.USABLE:
        thing.usable = true
        break
      case F.HAS_BONES:
        thing.hasBones = true
        thing.bonesOffsetX[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.NORTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetY[Direction.SOUTH] = reader.readInt16()
        thing.bonesOffsetX[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetY[Direction.EAST] = reader.readInt16()
        thing.bonesOffsetX[Direction.WEST] = reader.readInt16()
        thing.bonesOffsetY[Direction.WEST] = reader.readInt16()
        break
      default:
        throw new Error(
          `Unknown flag 0x${flag.toString(16)} (previous: 0x${previousFlag.toString(16)}) ` +
            `for ${thing.category} id ${thing.id}`
        )
    }
  }
}
