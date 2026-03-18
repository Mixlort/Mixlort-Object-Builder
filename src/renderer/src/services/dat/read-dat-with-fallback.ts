import type { ClientFeatures } from '../../types/version'
import type { DatReadResult } from './dat-reader'

export interface ReadDatWithFallbackParams {
  buffer: ArrayBuffer
  version: number
  features: ClientFeatures
  defaultDurations: Record<string, number>
  readDat: (
    buffer: ArrayBuffer,
    version: number,
    features: ClientFeatures,
    defaultDurations: Record<string, number>
  ) => Promise<DatReadResult>
}

export interface ReadDatWithFallbackResult {
  result: DatReadResult
  features: ClientFeatures
  didFallback: boolean
  originalError: string | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function shouldRetryWithoutFrameGroups(
  error: unknown,
  version: number,
  features: ClientFeatures
): boolean {
  if (!features.frameGroups || version < 1057) {
    return false
  }

  const message = getErrorMessage(error)
  return message.includes('Unknown flag')
}

export async function readDatWithFallback({
  buffer,
  version,
  features,
  defaultDurations,
  readDat
}: ReadDatWithFallbackParams): Promise<ReadDatWithFallbackResult> {
  try {
    const result = await readDat(buffer, version, features, defaultDurations)
    return { result, features, didFallback: false, originalError: null }
  } catch (error) {
    if (!shouldRetryWithoutFrameGroups(error, version, features)) {
      throw error
    }

    const fallbackFeatures: ClientFeatures = { ...features, frameGroups: false }
    const result = await readDat(buffer, version, fallbackFeatures, defaultDurations)

    return {
      result,
      features: fallbackFeatures,
      didFallback: true,
      originalError: getErrorMessage(error)
    }
  }
}
