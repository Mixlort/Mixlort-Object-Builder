import type { EffectPreviewFrameMode } from '../../../shared/settings'
import { getFrameGroupSpriteIndex, ThingCategory, type ThingType } from '../types'

export function collectThingSpriteIds(thing: ThingType): number[] {
  const ids = new Set<number>()
  for (const frameGroup of thing.frameGroups ?? []) {
    if (!frameGroup) continue
    for (const spriteId of frameGroup.spriteIndex) {
      if (spriteId > 0) ids.add(spriteId)
    }
  }
  return Array.from(ids)
}

export function collectThingsSpriteIds(things: ThingType[]): number[] {
  const ids = new Set<number>()
  for (const thing of things) {
    for (const spriteId of collectThingSpriteIds(thing)) {
      ids.add(spriteId)
    }
  }
  return Array.from(ids)
}

export function collectThingsThumbnailSpriteIds(
  things: ThingType[],
  category: ThingCategory,
  effectPreviewFrameMode: EffectPreviewFrameMode = 'first'
): number[] {
  const ids = new Set<number>()
  for (const thing of things) {
    for (const spriteId of collectThingThumbnailSpriteIds(thing, category, effectPreviewFrameMode)) {
      ids.add(spriteId)
    }
  }
  return Array.from(ids)
}

export function collectThingThumbnailSpriteIds(
  thing: ThingType,
  category: ThingCategory,
  effectPreviewFrameMode: EffectPreviewFrameMode = 'first'
): number[] {
  const fg = thing.frameGroups?.[0]
  if (!fg) return []

  if (category === ThingCategory.EFFECT && effectPreviewFrameMode === 'largest') {
    return collectThingSpriteIds(thing)
  }

  const ids = new Set<number>()
  const isOutfit = category === ThingCategory.OUTFIT
  const layers = isOutfit ? 1 : fg.layers
  const patternX = isOutfit && fg.patternX > 1 ? 2 : 0

  for (let layer = 0; layer < layers; layer++) {
    for (let w = 0; w < fg.width; w++) {
      for (let h = 0; h < fg.height; h++) {
        const index = getFrameGroupSpriteIndex(fg, w, h, layer, patternX, 0, 0, 0)
        const spriteId = fg.spriteIndex[index]
        if (spriteId > 0) ids.add(spriteId)
      }
    }
  }

  return Array.from(ids)
}
