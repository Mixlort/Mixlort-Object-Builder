import { describe, expect, it } from 'vitest'
import {
  ThingCategory,
  createFrameGroup,
  createThingType,
  type ThingType
} from '../../types'
import {
  collectThingSpriteIds,
  collectThingThumbnailSpriteIds,
  collectThingsSpriteIds,
  collectThingsThumbnailSpriteIds
} from '../sprite-preload'

function makeThing(category: ThingCategory, spriteIndex: number[]): ThingType {
  const thing = createThingType()
  thing.id = 1
  thing.category = category
  const frameGroup = createFrameGroup()
  frameGroup.spriteIndex = spriteIndex
  thing.frameGroups = [frameGroup]
  return thing
}

describe('sprite-preload', () => {
  it('collects every unique sprite referenced by a thing', () => {
    const thing = makeThing(ThingCategory.EFFECT, [1, 2, 2, 0, 3])

    expect(collectThingSpriteIds(thing)).toEqual([1, 2, 3])
  })

  it('collects every unique sprite referenced by multiple things', () => {
    const first = makeThing(ThingCategory.EFFECT, [1, 2])
    const second = makeThing(ThingCategory.EFFECT, [2, 3])

    expect(collectThingsSpriteIds([first, second])).toEqual([1, 2, 3])
  })

  it('uses all effect frame sprites for largest-frame thumbnails', () => {
    const effect = makeThing(ThingCategory.EFFECT, [11, 22])
    const frameGroup = effect.frameGroups[0]!
    frameGroup.frames = 2

    expect(collectThingThumbnailSpriteIds(effect, ThingCategory.EFFECT, 'largest')).toEqual([
      11,
      22
    ])
  })

  it('keeps first-frame thumbnail preloading narrow outside largest-frame effects', () => {
    const effect = makeThing(ThingCategory.EFFECT, [11, 22])
    const frameGroup = effect.frameGroups[0]!
    frameGroup.frames = 2

    expect(collectThingThumbnailSpriteIds(effect, ThingCategory.EFFECT, 'first')).toEqual([11])
  })

  it('collects unique thumbnail sprite ids for a page of things', () => {
    const first = makeThing(ThingCategory.ITEM, [1, 2])
    const second = makeThing(ThingCategory.ITEM, [2, 3])
    first.frameGroups[0]!.width = 2
    second.frameGroups[0]!.width = 2

    expect(collectThingsThumbnailSpriteIds([first, second], ThingCategory.ITEM, 'first')).toEqual([
      1,
      2,
      3
    ])
  })
})
