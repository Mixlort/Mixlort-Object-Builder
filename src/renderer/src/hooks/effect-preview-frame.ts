import { getFrameGroupSpriteIndex, type FrameGroup } from '../types'
import type { EffectPreviewFrameMode } from '../../../shared/settings'

export type { EffectPreviewFrameMode }

type CompressedSpriteProvider = (spriteId: number) => Uint8Array | undefined

function getCompressedSpriteVisualScore(compressed: Uint8Array | undefined, transparent: boolean): number {
  if (!compressed || compressed.length === 0) return 0

  const view = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength)
  let read = 0
  let score = 0

  while (read + 4 <= compressed.length) {
    read += 2
    const coloredPixels = view.getUint16(read, true)
    read += 2

    if (!transparent) {
      score += coloredPixels * 0xff
      read += coloredPixels * 3
      continue
    }

    for (let i = 0; i < coloredPixels && read + 4 <= compressed.length; i++) {
      read += 3
      score += compressed[read++]
    }
  }

  return score
}

function getFrameVisualScore(
  fg: FrameGroup,
  frame: number,
  getSprite: CompressedSpriteProvider,
  transparent: boolean,
  spriteScoreCache: Map<number, number>
): number {
  let score = 0

  for (let layer = 0; layer < fg.layers; layer++) {
    for (let w = 0; w < fg.width; w++) {
      for (let h = 0; h < fg.height; h++) {
        const spriteArrayIndex = getFrameGroupSpriteIndex(fg, w, h, layer, 0, 0, 0, frame)
        const spriteId = fg.spriteIndex[spriteArrayIndex]
        if (!spriteId || spriteId <= 0) continue
        let spriteScore = spriteScoreCache.get(spriteId)
        if (spriteScore === undefined) {
          spriteScore = getCompressedSpriteVisualScore(getSprite(spriteId), transparent)
          spriteScoreCache.set(spriteId, spriteScore)
        }
        score += spriteScore
      }
    }
  }

  return score
}

export function getEffectPreviewFrameIndex(
  fg: FrameGroup,
  mode: EffectPreviewFrameMode,
  getSprite: CompressedSpriteProvider,
  transparent: boolean
): number {
  if (mode === 'first' || fg.frames <= 1) {
    return 0
  }

  let bestFrame = 0
  let bestScore = 0
  const spriteScoreCache = new Map<number, number>()

  for (let frame = 0; frame < fg.frames; frame++) {
    const score = getFrameVisualScore(fg, frame, getSprite, transparent, spriteScoreCache)
    if (score > bestScore) {
      bestScore = score
      bestFrame = frame
    }
  }

  return bestFrame
}
