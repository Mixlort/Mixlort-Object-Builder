import {
  type ThingData,
  type ThingType,
  FrameGroupType,
  cloneThingType,
  getThingFrameGroup,
  getFrameGroupTotalSprites
} from '../../types'
import { compressPixels } from '../spr'

export interface MaterializeImportedThingDataParams {
  thingData: ThingData
  transparent: boolean
  addSprite: (compressed: Uint8Array | null) => number
}

export interface MaterializeImportedThingDataResult {
  thing: ThingType
  addedSpriteIds: number[]
}

export function materializeImportedThingData({
  thingData,
  transparent,
  addSprite
}: MaterializeImportedThingDataParams): MaterializeImportedThingDataResult {
  const thing = cloneThingType(thingData.thing)
  const addedSpriteIds: number[] = []

  for (const groupType of [FrameGroupType.DEFAULT, FrameGroupType.WALKING] as const) {
    const frameGroup = getThingFrameGroup(thing, groupType)
    if (!frameGroup) continue

    const totalSprites = getFrameGroupTotalSprites(frameGroup)
    const sourceSprites = thingData.sprites.get(groupType) ?? []
    const remappedSpriteIndex = new Array<number>(totalSprites).fill(0)

    for (let i = 0; i < totalSprites; i++) {
      const pixels = sourceSprites[i]?.pixels
      if (!pixels || pixels.length === 0) continue

      const compressed = compressPixels(pixels, transparent)
      if (compressed.length === 0) continue

      const newSpriteId = addSprite(compressed)
      remappedSpriteIndex[i] = newSpriteId
      addedSpriteIds.push(newSpriteId)
    }

    frameGroup.spriteIndex = remappedSpriteIndex
  }

  return { thing, addedSpriteIds }
}
