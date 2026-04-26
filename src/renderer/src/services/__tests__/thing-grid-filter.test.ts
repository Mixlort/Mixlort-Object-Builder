import { describe, expect, it } from 'vitest'
import { createFrameGroup, createThingType, ThingCategory, type ThingType } from '../../types'
import {
  filterThingsByMinGridArea,
  getThingGridArea,
  GRID_AREA_FILTER_OPTIONS
} from '../thing-grid-filter'

function makeThing(id: number, width?: number, height?: number): ThingType {
  const thing = createThingType()
  thing.id = id
  thing.category = ThingCategory.ITEM
  if (width !== undefined && height !== undefined) {
    const frameGroup = createFrameGroup()
    frameGroup.width = width
    frameGroup.height = height
    thing.frameGroups = [frameGroup]
  } else {
    thing.frameGroups = []
  }
  return thing
}

describe('thing-grid-filter', () => {
  it('computes grid area from the main frame group', () => {
    expect(getThingGridArea(makeThing(1, 1, 1))).toBe(1)
    expect(getThingGridArea(makeThing(2, 2, 1))).toBe(2)
    expect(getThingGridArea(makeThing(3, 2, 2))).toBe(4)
    expect(getThingGridArea(makeThing(4, 3, 3))).toBe(9)
  })

  it('falls back to 1 tile when a thing has no frame group', () => {
    expect(getThingGridArea(makeThing(1))).toBe(1)
  })

  it('filters by minimum grid area presets', () => {
    const things = [makeThing(1, 1, 1), makeThing(2, 2, 1), makeThing(3, 2, 2), makeThing(4, 3, 3)]

    expect(filterThingsByMinGridArea(things, 1).map((thing) => thing.id)).toEqual([1, 2, 3, 4])
    expect(filterThingsByMinGridArea(things, 2).map((thing) => thing.id)).toEqual([2, 3, 4])
    expect(filterThingsByMinGridArea(things, 4).map((thing) => thing.id)).toEqual([3, 4])
    expect(filterThingsByMinGridArea(things, 9).map((thing) => thing.id)).toEqual([4])
  })

  it('exposes the expected compact preset list', () => {
    expect(GRID_AREA_FILTER_OPTIONS.map((option) => option.value)).toEqual([0, 1, 2, 4, 6, 9])
  })
})
