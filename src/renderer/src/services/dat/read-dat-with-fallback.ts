import type { ClientFeatures } from '../../types/version'
import type { DatReadResult } from './dat-reader'
import type { PxgDatRuntime } from '../pxg-runtime'

export interface ReadDatWithFallbackParams {
  buffer: ArrayBuffer
  version: number
  features: ClientFeatures
  defaultDurations: Record<string, number>
  runtime?: PxgDatRuntime | null
  readDat: (
    buffer: ArrayBuffer,
    version: number,
    features: ClientFeatures,
    defaultDurations: Record<string, number>,
    runtime?: PxgDatRuntime | null
  ) => Promise<DatReadResult>
}

export interface ReadDatWithFallbackResult {
  result: DatReadResult
  features: ClientFeatures
  didFallback: boolean
  originalError: string | null
}

function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0)
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

function invokeReadDat(
  readDat: ReadDatWithFallbackParams['readDat'],
  buffer: ArrayBuffer,
  version: number,
  features: ClientFeatures,
  defaultDurations: Record<string, number>,
  runtime: PxgDatRuntime | null | undefined
): Promise<DatReadResult> {
  if (runtime === undefined) {
    return readDat(buffer, version, features, defaultDurations)
  }
  return readDat(buffer, version, features, defaultDurations, runtime)
}

export async function readDatWithFallback({
  buffer,
  version,
  features,
  defaultDurations,
  runtime,
  readDat
}: ReadDatWithFallbackParams): Promise<ReadDatWithFallbackResult> {
  try {
    const result = await invokeReadDat(
      readDat,
      cloneArrayBuffer(buffer),
      version,
      features,
      defaultDurations,
      runtime
    )
    return { result, features, didFallback: false, originalError: null }
  } catch (error) {
    if (!shouldRetryWithoutFrameGroups(error, version, features)) {
      throw error
    }

    const fallbackFeatures: ClientFeatures = { ...features, frameGroups: false }
    const result = await invokeReadDat(
      readDat,
      cloneArrayBuffer(buffer),
      version,
      fallbackFeatures,
      defaultDurations,
      runtime
    )

    return {
      result,
      features: fallbackFeatures,
      didFallback: true,
      originalError: getErrorMessage(error)
    }
  }
}
