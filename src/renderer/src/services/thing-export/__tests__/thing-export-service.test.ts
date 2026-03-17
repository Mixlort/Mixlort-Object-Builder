import { describe, it, expect, vi } from 'vitest'
import { ThingCategory, createThingType, type ThingType } from '../../../types'
import { ImageFormat } from '../../../types/project'
import { createThingExportPlan, exportThingPlanToFiles } from '../thing-export-service'

function makeThing(id: number, category: ThingCategory): ThingType {
  const thing = createThingType()
  thing.id = id
  thing.category = category
  thing.name = `${category}-${id}`
  return thing
}

describe('thing-export-service', () => {
  it('creates filtered effects plan with contiguous reindex and id map', () => {
    const effects = Array.from({ length: 20 }, (_, i) => makeThing(i + 1, ThingCategory.EFFECT))

    const plan = createThingExportPlan({
      category: ThingCategory.EFFECT,
      selectedThingIds: [],
      things: {
        items: [],
        outfits: [],
        effects,
        missiles: []
      },
      effectIdFilterEnabled: true,
      effectIdFilterInput: '1, 3, 10-12'
    })

    expect(plan.entries.map((e) => e.sourceId)).toEqual([1, 3, 10, 11, 12])
    expect(plan.entries.map((e) => e.exportId)).toEqual([1, 2, 3, 4, 5])
    expect(plan.effectsIdMap).toEqual({
      oldToNew: { '1': 1, '3': 2, '10': 3, '11': 4, '12': 5 },
      newToOld: { '1': 1, '2': 3, '3': 10, '4': 11, '5': 12 }
    })
    expect(plan.missingEffectIds).toEqual([])
    expect(plan.filterApplied).toBe(true)
  })

  it('keeps missing effect ids as warnings while exporting existing ones', () => {
    const plan = createThingExportPlan({
      category: ThingCategory.EFFECT,
      selectedThingIds: [],
      things: {
        items: [],
        outfits: [],
        effects: [
          makeThing(1, ThingCategory.EFFECT),
          makeThing(2, ThingCategory.EFFECT),
          makeThing(3, ThingCategory.EFFECT)
        ],
        missiles: []
      },
      effectIdFilterEnabled: true,
      effectIdFilterInput: '1,3,9'
    })

    expect(plan.entries.map((e) => e.sourceId)).toEqual([1, 3])
    expect(plan.entries.map((e) => e.exportId)).toEqual([1, 2])
    expect(plan.missingEffectIds).toEqual([9])
  })

  it('keeps default behavior when filter is disabled', () => {
    const effects = [
      makeThing(1, ThingCategory.EFFECT),
      makeThing(2, ThingCategory.EFFECT),
      makeThing(3, ThingCategory.EFFECT),
      makeThing(4, ThingCategory.EFFECT)
    ]

    const plan = createThingExportPlan({
      category: ThingCategory.EFFECT,
      selectedThingIds: [4, 2],
      things: {
        items: [],
        outfits: [],
        effects,
        missiles: []
      },
      effectIdFilterEnabled: false,
      effectIdFilterInput: '1-10'
    })

    expect(plan.entries.map((e) => e.sourceId)).toEqual([2, 4])
    expect(plan.entries.map((e) => e.exportId)).toEqual([2, 4])
    expect(plan.effectsIdMap).toBeNull()
    expect(plan.filterApplied).toBe(false)
  })

  it('writes export files and effects-id-map.json when map exists', async () => {
    const plan = createThingExportPlan({
      category: ThingCategory.EFFECT,
      selectedThingIds: [],
      things: {
        items: [],
        outfits: [],
        effects: [
          makeThing(1, ThingCategory.EFFECT),
          makeThing(3, ThingCategory.EFFECT)
        ],
        missiles: []
      },
      effectIdFilterEnabled: true,
      effectIdFilterInput: '1,3'
    })

    const writeBinary = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const encodeThing = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)

    const result = await exportThingPlanToFiles({
      plan,
      directory: '/tmp/out',
      fileNamePrefix: 'effect',
      format: ImageFormat.PNG,
      encodeThing,
      writeBinary,
      writeText
    })

    expect(result.exportedCount).toBe(2)
    expect(writeBinary).toHaveBeenCalledTimes(2)
    expect(writeBinary).toHaveBeenNthCalledWith(1, '/tmp/out/1.png', expect.any(ArrayBuffer))
    expect(writeBinary).toHaveBeenNthCalledWith(2, '/tmp/out/2.png', expect.any(ArrayBuffer))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('/tmp/out/effects-id-map.json', expect.any(String))
    expect(result.mapFilePath).toBe('/tmp/out/effects-id-map.json')
  })

  it('uses exported effect ids as file names even without filter', async () => {
    const plan = createThingExportPlan({
      category: ThingCategory.EFFECT,
      selectedThingIds: [7],
      things: {
        items: [],
        outfits: [],
        effects: [makeThing(7, ThingCategory.EFFECT)],
        missiles: []
      },
      effectIdFilterEnabled: false,
      effectIdFilterInput: ''
    })

    const writeBinary = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const encodeThing = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)

    await exportThingPlanToFiles({
      plan,
      directory: '/tmp/out',
      fileNamePrefix: 'ignored-for-effects',
      format: ImageFormat.BMP,
      encodeThing,
      writeBinary,
      writeText
    })

    expect(writeBinary).toHaveBeenCalledWith('/tmp/out/7.bmp', expect.any(ArrayBuffer))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('does not create map file when no effects filter map exists', async () => {
    const plan = createThingExportPlan({
      category: ThingCategory.ITEM,
      selectedThingIds: [100, 101],
      things: {
        items: [makeThing(100, ThingCategory.ITEM), makeThing(101, ThingCategory.ITEM)],
        outfits: [],
        effects: [],
        missiles: []
      },
      effectIdFilterEnabled: true,
      effectIdFilterInput: '1,2'
    })

    const writeBinary = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const encodeThing = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)

    const result = await exportThingPlanToFiles({
      plan,
      directory: '/tmp/out',
      fileNamePrefix: 'item',
      format: ImageFormat.BMP,
      encodeThing,
      writeBinary,
      writeText
    })

    expect(result.exportedCount).toBe(2)
    expect(writeBinary).toHaveBeenCalledTimes(2)
    expect(writeText).not.toHaveBeenCalled()
    expect(result.mapFilePath).toBeNull()
  })
})
