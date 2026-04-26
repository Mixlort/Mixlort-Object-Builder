import type { ThingType } from '../types'

export const GRID_AREA_FILTER_OPTIONS = [
  { value: 0, label: 'All' },
  { value: 1, label: '1+ tiles' },
  { value: 2, label: '2+ tiles' },
  { value: 4, label: '4+ tiles' },
  { value: 6, label: '6+ tiles' },
  { value: 9, label: '9+ tiles' }
] as const

export function getThingGridArea(thing: ThingType): number {
  const frameGroup = thing.frameGroups?.[0]
  if (!frameGroup) return 1
  return Math.max(1, frameGroup.width || 1) * Math.max(1, frameGroup.height || 1)
}

export function filterThingsByMinGridArea(things: ThingType[], minArea: number): ThingType[] {
  if (minArea <= 1) return things
  return things.filter((thing) => getThingGridArea(thing) >= minArea)
}
