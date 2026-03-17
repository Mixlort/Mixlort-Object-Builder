import type { ThingType, ThingCategory } from '../../types'
import { ThingCategory as TC } from '../../types'
import type { ThingExportFormat } from '../../types/project'
import { ImageFormat, OTFormat } from '../../types/project'
import { parseIdList } from '../../utils'

export interface ThingExportCollections {
  items: ThingType[]
  outfits: ThingType[]
  effects: ThingType[]
  missiles: ThingType[]
}

export interface ThingExportEntry {
  sourceId: number
  exportId: number
  thing: ThingType
}

export interface EffectsIdMap {
  oldToNew: Record<string, number>
  newToOld: Record<string, number>
}

export interface ThingExportPlan {
  entries: ThingExportEntry[]
  effectsIdMap: EffectsIdMap | null
  missingEffectIds: number[]
  filterApplied: boolean
}

export interface CreateThingExportPlanParams {
  category: ThingCategory
  selectedThingIds: number[]
  things: ThingExportCollections
  effectIdFilterEnabled: boolean
  effectIdFilterInput: string
}

export interface ExportThingPlanParams {
  plan: ThingExportPlan
  directory: string
  fileNamePrefix: string
  format: ThingExportFormat
  effectUseOriginalIdsInFileNames?: boolean
  encodeThing: (entry: ThingExportEntry) => Promise<ArrayBuffer>
  writeBinary: (path: string, data: ArrayBuffer) => Promise<void>
  writeText: (path: string, text: string) => Promise<void>
}

export interface ExportThingPlanResult {
  exportedCount: number
  writtenFiles: string[]
  mapFilePath: string | null
}

function getThingsByCategory(things: ThingExportCollections, category: ThingCategory): ThingType[] {
  switch (category) {
    case TC.ITEM:
      return things.items
    case TC.OUTFIT:
      return things.outfits
    case TC.EFFECT:
      return things.effects
    case TC.MISSILE:
      return things.missiles
  }
}

function normalizeSelectedThings(things: ThingType[], selectedIds: number[]): ThingType[] {
  const selected = new Set(selectedIds)
  return things.filter((thing) => selected.has(thing.id)).sort((a, b) => a.id - b.id)
}

function makeEffectsIdMap(entries: ThingExportEntry[]): EffectsIdMap {
  const oldToNew: Record<string, number> = {}
  const newToOld: Record<string, number> = {}

  for (const entry of entries) {
    oldToNew[String(entry.sourceId)] = entry.exportId
    newToOld[String(entry.exportId)] = entry.sourceId
  }

  return { oldToNew, newToOld }
}

function joinPath(directory: string, fileName: string): string {
  return `${directory.replace(/[\\/]+$/, '')}/${fileName}`
}

function getExportExtension(format: ThingExportFormat): string {
  switch (format) {
    case ImageFormat.PNG:
      return 'png'
    case ImageFormat.BMP:
      return 'bmp'
    case ImageFormat.JPG:
      return 'jpg'
    case OTFormat.OBD:
      return 'obd'
  }
}

function getExportFileName(
  entry: ThingExportEntry,
  extension: string,
  fileNamePrefix: string,
  effectUseOriginalIdsInFileNames: boolean
): string {
  if (entry.thing.category === TC.EFFECT) {
    const effectFileId = effectUseOriginalIdsInFileNames ? entry.sourceId : entry.exportId
    return `${effectFileId}.${extension}`
  }

  return `${fileNamePrefix}_${entry.exportId}.${extension}`
}

export function createThingExportPlan(params: CreateThingExportPlanParams): ThingExportPlan {
  const { category, selectedThingIds, things, effectIdFilterEnabled, effectIdFilterInput } = params
  const categoryThings = getThingsByCategory(things, category)

  if (category !== TC.EFFECT || !effectIdFilterEnabled) {
    const selectedThings = normalizeSelectedThings(categoryThings, selectedThingIds)
    return {
      entries: selectedThings.map((thing) => ({
        sourceId: thing.id,
        exportId: thing.id,
        thing
      })),
      effectsIdMap: null,
      missingEffectIds: [],
      filterApplied: false
    }
  }

  const effectsById = new Map<number, ThingType>()
  for (const effect of things.effects) {
    effectsById.set(effect.id, effect)
  }

  const parsedIds =
    effectIdFilterInput.trim().length === 0 ? [] : parseIdList(effectIdFilterInput.trim())
  const sourceEffects =
    parsedIds.length === 0
      ? [...things.effects].sort((a, b) => a.id - b.id)
      : parsedIds.map((id) => effectsById.get(id)).filter((effect): effect is ThingType => !!effect)

  const missingEffectIds =
    parsedIds.length === 0 ? [] : parsedIds.filter((id) => !effectsById.has(id))

  const entries = sourceEffects.map((thing, index) => ({
    sourceId: thing.id,
    exportId: index + 1,
    thing
  }))

  return {
    entries,
    effectsIdMap: makeEffectsIdMap(entries),
    missingEffectIds,
    filterApplied: true
  }
}

export async function exportThingPlanToFiles(
  params: ExportThingPlanParams
): Promise<ExportThingPlanResult> {
  const {
    plan,
    directory,
    fileNamePrefix,
    format,
    effectUseOriginalIdsInFileNames = false,
    encodeThing,
    writeBinary,
    writeText
  } = params

  const extension = getExportExtension(format)
  const writtenFiles: string[] = []

  for (const entry of plan.entries) {
    const fileName = getExportFileName(
      entry,
      extension,
      fileNamePrefix,
      effectUseOriginalIdsInFileNames
    )
    const fullPath = joinPath(directory, fileName)
    const data = await encodeThing(entry)
    await writeBinary(fullPath, data)
    writtenFiles.push(fullPath)
  }

  let mapFilePath: string | null = null
  if (plan.effectsIdMap) {
    mapFilePath = joinPath(directory, 'effects-id-map.json')
    await writeText(mapFilePath, JSON.stringify(plan.effectsIdMap, null, 2))
    writtenFiles.push(mapFilePath)
  }

  return {
    exportedCount: plan.entries.length,
    writtenFiles,
    mapFilePath
  }
}
