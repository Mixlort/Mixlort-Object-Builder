import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFrameGroup,
  createThingData,
  createThingType,
  FrameGroupType,
  getThingFrameGroup,
  ThingCategory
} from '../../../types'
import { resetSpriteStore, useSpriteStore } from '../../../stores'
import { materializeImportedThingData } from '../thing-import-service'

function makePixels(alpha = 0xff, red = 0x20, green = 0x40, blue = 0x60): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  pixels[0] = alpha
  pixels[1] = red
  pixels[2] = green
  pixels[3] = blue
  return pixels
}

function makeThingData(pixels: Uint8Array | null) {
  const thing = createThingType()
  thing.id = 15
  thing.category = ThingCategory.EFFECT

  const frameGroup = createFrameGroup()
  frameGroup.spriteIndex = [777]
  thing.frameGroups = [frameGroup]

  return createThingData(
    300,
    1098,
    thing,
    new Map([
      [
        FrameGroupType.DEFAULT,
        [
          {
            id: 777,
            pixels
          }
        ]
      ]
    ])
  )
}

describe('thing-import-service', () => {
  beforeEach(() => {
    resetSpriteStore()
  })

  it('materializes imported sprite pixels into the sprite store and rewrites sprite ids', () => {
    const result = materializeImportedThingData({
      thingData: makeThingData(makePixels()),
      transparent: false,
      addSprite: (compressed) => useSpriteStore.getState().addSprite(compressed)
    })

    const frameGroup = getThingFrameGroup(result.thing, FrameGroupType.DEFAULT)

    expect(frameGroup?.spriteIndex).toEqual([1])
    expect(result.addedSpriteIds).toEqual([1])
    expect(useSpriteStore.getState().getSprite(1)).toBeDefined()
    expect(useSpriteStore.getState().getSpriteCount()).toBe(1)
  })

  it('keeps empty imported sprites as empty entries without allocating sprite ids', () => {
    const result = materializeImportedThingData({
      thingData: makeThingData(new Uint8Array(32 * 32 * 4)),
      transparent: true,
      addSprite: (compressed) => useSpriteStore.getState().addSprite(compressed)
    })

    const frameGroup = getThingFrameGroup(result.thing, FrameGroupType.DEFAULT)

    expect(frameGroup?.spriteIndex).toEqual([0])
    expect(result.addedSpriteIds).toEqual([])
    expect(useSpriteStore.getState().getSpriteCount()).toBe(0)
  })
})
