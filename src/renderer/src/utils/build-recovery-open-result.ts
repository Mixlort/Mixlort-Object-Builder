import { DEFAULT_ATTRIBUTE_SERVER } from '../data/attribute-servers'
import { SPRITE_DIMENSIONS } from '../data/sprite-dimensions'
import { VERSIONS, findVersionBySignatures } from '../data/versions'
import type { OpenAssetsResult } from '../features/dialogs'
import type { ClientFeatures } from '../types'

export interface BuildRecoveryOpenResultParams {
  datFilePath: string
  sprFilePath: string
  versionValue: number
  serverItemsPath: string | null
  features: ClientFeatures | null
  datBuffer: ArrayBuffer
  sprBuffer: ArrayBuffer
}

export function buildRecoveryOpenResult({
  datFilePath,
  sprFilePath,
  versionValue,
  serverItemsPath,
  features,
  datBuffer,
  sprBuffer
}: BuildRecoveryOpenResultParams): OpenAssetsResult {
  const datView = new DataView(datBuffer)
  const sprView = new DataView(sprBuffer)
  const datSignature = datView.getUint32(0, true)
  const sprSignature = sprView.getUint32(0, true)

  const version =
    findVersionBySignatures(datSignature, sprSignature) ??
    VERSIONS.find((entry) => entry.value === versionValue)

  if (!version) {
    throw new Error(
      `Could not resolve client version for recovery (version=${versionValue}, dat=0x${datSignature.toString(16)}, spr=0x${sprSignature.toString(16)})`
    )
  }

  const resolvedFeatures =
    features ??
    {
      extended: version.value >= 960,
      transparency: true,
      improvedAnimations: version.value >= 1050,
      frameGroups: version.value >= 1057,
      metadataController: 'default',
      attributeServer: DEFAULT_ATTRIBUTE_SERVER
    }

  return {
    datFile: datFilePath,
    sprFile: sprFilePath,
    version,
    spriteDimension: SPRITE_DIMENSIONS[0],
    extended: resolvedFeatures.extended,
    transparency: resolvedFeatures.transparency,
    improvedAnimations: resolvedFeatures.improvedAnimations,
    frameGroups: resolvedFeatures.frameGroups,
    serverItemsDirectory: serverItemsPath,
    attributeServer: resolvedFeatures.attributeServer ?? DEFAULT_ATTRIBUTE_SERVER
  }
}
