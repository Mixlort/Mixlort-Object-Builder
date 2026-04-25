import { getFrameGroupSpriteIndex, ThingCategory, type ThingType } from '../types'
import { getEffectPreviewFrameIndex } from './effect-preview-frame'

export const EFFECT_COLOR_BUCKETS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
  'neutral'
] as const

export type EffectColorBucket = (typeof EFFECT_COLOR_BUCKETS)[number]
export type EffectColorFilter = EffectColorBucket | 'all'

type CompressedSpriteProvider = (spriteId: number) => Uint8Array | undefined

export const EFFECT_COLOR_BUCKET_LABELS: Record<EffectColorBucket, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  cyan: 'Cyan',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  neutral: 'Neutral'
}

export const EFFECT_COLOR_BUCKET_SWATCHES: Record<EffectColorBucket, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  neutral: '#9ca3af'
}

const EFFECT_COLOR_BUCKET_ORDER = new Map<EffectColorBucket, number>(
  EFFECT_COLOR_BUCKETS.map((bucket, index) => [bucket, index])
)

const MIN_VISIBLE_VALUE = 40
const MIN_CHROMATIC_SATURATION = 0.18
const MIN_CHROMATIC_SCORE = 1

interface BucketScores {
  red: number
  orange: number
  yellow: number
  green: number
  cyan: number
  blue: number
  purple: number
  pink: number
  neutral: number
}

const effectColorCache = new Map<string, EffectColorBucket>()

function createBucketScores(): BucketScores {
  return {
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    cyan: 0,
    blue: 0,
    purple: 0,
    pink: 0,
    neutral: 0
  }
}

function getThingColorSignature(thing: ThingType): string {
  const fg = thing.frameGroups?.[0]
  if (!fg) return 'no-frame-group'
  return [
    thing.id,
    fg.width,
    fg.height,
    fg.layers,
    fg.patternX,
    fg.patternY,
    fg.patternZ,
    fg.frames,
    fg.spriteIndex.join(',')
  ].join(':')
}

function getChromaticPixelScore(
  red: number,
  green: number,
  blue: number,
  alpha: number
): { bucket: EffectColorBucket; score: number } | null {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  if (max < MIN_VISIBLE_VALUE || delta / max < MIN_CHROMATIC_SATURATION) {
    return null
  }

  let hue: number
  if (max === red) {
    hue = ((green - blue) / delta) % 6
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  const degrees = (hue * 60 + 360) % 360

  const score = alpha * (delta / 0xff)

  if (degrees < 18 || degrees >= 330) return { bucket: 'red', score }
  if (degrees < 45) return { bucket: 'orange', score }
  if (degrees < 75) return { bucket: 'yellow', score }
  if (degrees < 165) return { bucket: 'green', score }
  if (degrees < 195) return { bucket: 'cyan', score }
  if (degrees < 255) return { bucket: 'blue', score }
  if (degrees < 285) return { bucket: 'purple', score }
  return { bucket: 'pink', score }
}

function addCompressedSpriteBucketScores(
  scores: BucketScores,
  compressed: Uint8Array | undefined,
  transparent: boolean
): void {
  if (!compressed || compressed.length === 0) return

  const view = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength)
  let read = 0

  while (read + 4 <= compressed.length) {
    read += 2
    const coloredPixels = view.getUint16(read, true)
    read += 2

    for (let i = 0; i < coloredPixels; i++) {
      if (read + (transparent ? 4 : 3) > compressed.length) return

      const red = compressed[read++]
      const green = compressed[read++]
      const blue = compressed[read++]
      const alpha = transparent ? compressed[read++] : 0xff
      if (alpha === 0) continue

      const chromaticScore = getChromaticPixelScore(red, green, blue, alpha)
      if (chromaticScore) {
        scores[chromaticScore.bucket] += chromaticScore.score
      }
    }
  }
}

function pickDominantBucket(scores: BucketScores): EffectColorBucket {
  let bestBucket: EffectColorBucket = 'neutral'
  let bestScore = 0

  for (const bucket of EFFECT_COLOR_BUCKETS) {
    const score = scores[bucket]
    if (score > bestScore) {
      bestBucket = bucket
      bestScore = score
    }
  }

  return bestScore >= MIN_CHROMATIC_SCORE ? bestBucket : 'neutral'
}

export function clearEffectColorAnalysisCache(): void {
  effectColorCache.clear()
}

export function getEffectDominantColorBucket(
  thing: ThingType,
  getSprite: CompressedSpriteProvider,
  transparent: boolean
): EffectColorBucket {
  if (thing.category !== ThingCategory.EFFECT) return 'neutral'

  const fg = thing.frameGroups?.[0]
  if (!fg) return 'neutral'

  const cacheKey = `${transparent ? 1 : 0}:${getThingColorSignature(thing)}`
  const cached = effectColorCache.get(cacheKey)
  if (cached) return cached

  const frame = getEffectPreviewFrameIndex(fg, 'largest', getSprite, transparent)
  const scores = createBucketScores()

  for (let layer = 0; layer < fg.layers; layer++) {
    for (let w = 0; w < fg.width; w++) {
      for (let h = 0; h < fg.height; h++) {
        const spriteArrayIndex = getFrameGroupSpriteIndex(fg, w, h, layer, 0, 0, 0, frame)
        const spriteId = fg.spriteIndex[spriteArrayIndex]
        if (!spriteId || spriteId <= 0) continue
        addCompressedSpriteBucketScores(scores, getSprite(spriteId), transparent)
      }
    }
  }

  const bucket = pickDominantBucket(scores)
  effectColorCache.set(cacheKey, bucket)
  return bucket
}

export function filterEffectsByColorBucket(
  effects: ThingType[],
  filter: EffectColorFilter,
  getSprite: CompressedSpriteProvider,
  transparent: boolean
): ThingType[] {
  if (filter === 'all') return effects
  return effects.filter(
    (thing) => getEffectDominantColorBucket(thing, getSprite, transparent) === filter
  )
}

export function sortEffectsByColorBucket(
  effects: ThingType[],
  getSprite: CompressedSpriteProvider,
  transparent: boolean
): ThingType[] {
  return [...effects].sort((a, b) => {
    const aBucket = getEffectDominantColorBucket(a, getSprite, transparent)
    const bBucket = getEffectDominantColorBucket(b, getSprite, transparent)
    const bucketDiff =
      (EFFECT_COLOR_BUCKET_ORDER.get(aBucket) ?? EFFECT_COLOR_BUCKETS.length) -
      (EFFECT_COLOR_BUCKET_ORDER.get(bBucket) ?? EFFECT_COLOR_BUCKETS.length)
    if (bucketDiff !== 0) return bucketDiff
    return a.id - b.id
  })
}
