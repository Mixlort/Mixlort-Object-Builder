import type { ThingType, ThingCategory } from '../../types'
import { createFrameGroup, createThingType, FrameGroupType, setThingFrameGroup, ThingCategory as TC } from '../../types'
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

export interface ThingIdMap {
  oldToNew: Record<string, number>
  newToOld: Record<string, number>
}

export interface ThingExportPlan {
  category: ThingCategory
  entries: ThingExportEntry[]
  idMap: ThingIdMap | null
  missingSourceIds: number[]
  filterApplied: boolean
}

export interface CreateThingExportPlanParams {
  category: ThingCategory
  selectedThingIds: number[]
  things: ThingExportCollections
  idFilterEnabled: boolean
  idFilterInput: string
}

export interface ExportThingPlanParams {
  plan: ThingExportPlan
  directory: string
  fileNamePrefix: string
  format: ThingExportFormat
  useOriginalIdsInFileNames?: boolean
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

function supportsCategoryIdFilter(category: ThingCategory): boolean {
  return category === TC.EFFECT || category === TC.MISSILE
}

function makeThingIdMap(entries: ThingExportEntry[]): ThingIdMap {
  const oldToNew: Record<string, number> = {}
  const newToOld: Record<string, number> = {}

  for (const entry of entries) {
    oldToNew[String(entry.sourceId)] = entry.exportId
    newToOld[String(entry.exportId)] = entry.sourceId
  }

  return { oldToNew, newToOld }
}

function createEmptyThing(category: ThingCategory, id: number): ThingType {
  const thing = createThingType()
  thing.id = id
  thing.category = category

  const frameGroup = createFrameGroup()
  frameGroup.spriteIndex = [0]
  setThingFrameGroup(thing, FrameGroupType.DEFAULT, frameGroup)

  return thing
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
  useOriginalIdsInFileNames: boolean,
  useFilteredCategoryIdsInFileNames: boolean
): string {
  if (entry.thing.category === TC.EFFECT) {
    const effectFileId = useOriginalIdsInFileNames ? entry.sourceId : entry.exportId
    return `${effectFileId}.${extension}`
  }

  if (entry.thing.category === TC.MISSILE && useFilteredCategoryIdsInFileNames) {
    const missileFileId = useOriginalIdsInFileNames ? entry.sourceId : entry.exportId
    return `${missileFileId}.${extension}`
  }

  if (fileNamePrefix.trim().length === 0) {
    return `${entry.exportId}.${extension}`
  }

  return `${fileNamePrefix}_${entry.exportId}.${extension}`
}

function getIdMapFileName(category: ThingCategory): string {
  return category === TC.MISSILE ? 'missiles-id-map.json' : 'effects-id-map.json'
}

export function createThingExportPlan(params: CreateThingExportPlanParams): ThingExportPlan {
  const { category, selectedThingIds, things, idFilterEnabled, idFilterInput } = params
  const categoryThings = getThingsByCategory(things, category)

  if (!supportsCategoryIdFilter(category) || !idFilterEnabled) {
    const selectedThings = normalizeSelectedThings(categoryThings, selectedThingIds)
    return {
      category,
      entries: selectedThings.map((thing) => ({
        sourceId: thing.id,
        exportId: thing.id,
        thing
      })),
      idMap: null,
      missingSourceIds: [],
      filterApplied: false
    }
  }

  const thingsById = new Map<number, ThingType>()
  for (const thing of categoryThings) {
    thingsById.set(thing.id, thing)
  }

  const parsedIds = idFilterInput.trim().length === 0 ? [] : parseIdList(idFilterInput.trim())
  const sourceThings =
    parsedIds.length === 0
      ? [...categoryThings].sort((a, b) => a.id - b.id)
      : parsedIds.map((id) => thingsById.get(id) ?? createEmptyThing(category, id))

  const missingSourceIds = parsedIds.length === 0 ? [] : parsedIds.filter((id) => !thingsById.has(id))

  const entries = sourceThings.map((thing, index) => ({
    sourceId: parsedIds.length === 0 ? thing.id : parsedIds[index],
    exportId: index + 1,
    thing
  }))

  return {
    category,
    entries,
    idMap: makeThingIdMap(entries),
    missingSourceIds,
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
    useOriginalIdsInFileNames = false,
    encodeThing,
    writeBinary,
    writeText
  } = params

  const extension = getExportExtension(format)
  const writtenFiles: string[] = []
  const useFilteredCategoryIdsInFileNames =
    plan.filterApplied && supportsCategoryIdFilter(plan.category)

  for (const entry of plan.entries) {
    const fileName = getExportFileName(
      entry,
      extension,
      fileNamePrefix,
      useOriginalIdsInFileNames,
      useFilteredCategoryIdsInFileNames
    )
    const fullPath = joinPath(directory, fileName)
    const data = await encodeThing(entry)
    await writeBinary(fullPath, data)
    writtenFiles.push(fullPath)
  }

  let mapFilePath: string | null = null
  if (plan.idMap) {
    mapFilePath = joinPath(directory, getIdMapFileName(plan.category))
    await writeText(mapFilePath, JSON.stringify(plan.idMap, null, 2))
    writtenFiles.push(mapFilePath)
  }

  return {
    exportedCount: plan.entries.length,
    writtenFiles,
    mapFilePath
  }
}
