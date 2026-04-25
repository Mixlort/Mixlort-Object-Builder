import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { compressPixels } from '../../services/spr'
import { resetAppStore, resetSpriteStore, useAppStore, useSpriteStore } from '../../stores'
import {
  createClientInfo,
  createFrameGroup,
  createThingType,
  ThingCategory,
  type ThingType
} from '../../types'
import { clearThumbnailCache, useSpriteThumbnail } from '../use-sprite-thumbnail'

let lastImageData: ImageData | null = null
let getContextSpy: { mockRestore: () => void }
let toDataUrlSpy: { mockRestore: () => void }

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class TestImageData {
    data: Uint8ClampedArray
    width: number
    height: number

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  } as typeof ImageData
}

function pixelsWithColor(red: number, green: number, blue: number, count = 1): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4)
  for (let index = 0; index < count; index++) {
    const offset = index * 4
    pixels[offset] = 0xff
    pixels[offset + 1] = red
    pixels[offset + 2] = green
    pixels[offset + 3] = blue
  }
  return pixels
}

function makeThing(category: ThingCategory): ThingType {
  const thing = createThingType()
  thing.id = 1
  thing.category = category
  const fg = createFrameGroup()
  fg.frames = 2
  fg.spriteIndex = [1, 2]
  thing.frameGroups[0] = fg
  return thing
}

function Thumbnail({
  thing,
  category,
  mode
}: {
  thing: ThingType
  category: ThingCategory
  mode: 'first' | 'largest'
}): React.JSX.Element {
  const url = useSpriteThumbnail(thing, category, mode)
  return <output data-testid="thumbnail-url">{url}</output>
}

beforeEach(() => {
  resetAppStore()
  resetSpriteStore()
  clearThumbnailCache()
  lastImageData = null

  const clientInfo = createClientInfo()
  clientInfo.features.transparency = false
  useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })

  useSpriteStore
    .getState()
    .loadSprites(
      new Map([
        [1, compressPixels(pixelsWithColor(0x00, 0x00, 0xff, 1), false)],
        [2, compressPixels(pixelsWithColor(0xff, 0x00, 0x00, 3), false)]
      ])
    )

  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        putImageData: (imageData: ImageData) => {
          lastImageData = imageData
        },
        clearRect: vi.fn()
      }) as unknown as CanvasRenderingContext2D
  )
  toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
    const data = lastImageData?.data
    return data ? `mock:${data[0]},${data[1]},${data[2]},${data[3]}` : 'mock:none'
  })
})

afterEach(() => {
  getContextSpy.mockRestore()
  toDataUrlSpy.mockRestore()
})

describe('useSpriteThumbnail effect preview mode', () => {
  it('uses the largest visible frame for effects when requested', () => {
    render(<Thumbnail thing={makeThing(ThingCategory.EFFECT)} category={ThingCategory.EFFECT} mode="largest" />)

    expect(screen.getByTestId('thumbnail-url')).toHaveTextContent('mock:255,0,0,255')
  })

  it('keeps frame 0 for effects in first-frame mode', () => {
    render(<Thumbnail thing={makeThing(ThingCategory.EFFECT)} category={ThingCategory.EFFECT} mode="first" />)

    expect(screen.getByTestId('thumbnail-url')).toHaveTextContent('mock:0,0,255,255')
  })

  it('keeps frame 0 for non-effects even when largest mode is requested', () => {
    render(<Thumbnail thing={makeThing(ThingCategory.ITEM)} category={ThingCategory.ITEM} mode="largest" />)

    expect(screen.getByTestId('thumbnail-url')).toHaveTextContent('mock:0,0,255,255')
  })
})
