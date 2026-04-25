/**
 * Shared types for Web Worker communication.
 *
 * Workers use a request/response protocol over postMessage with unique IDs
 * for correlating responses to requests. Transferable objects are used
 * where possible to avoid ArrayBuffer copies.
 */

import type { ClientFeatures } from '../types'
import type { DatReadResult } from '../services/dat/dat-reader'
import type { PxgDatRuntime } from '../services/pxg-runtime'
import type { SprWriteData } from '../services/spr/spr-writer'
import type { ThingData } from '../types'

// ---------------------------------------------------------------------------
// Generic message envelope
// ---------------------------------------------------------------------------

export interface WorkerRequest<T = unknown> {
  id: string
  type: string
  payload: T
}

export interface WorkerResponse<T = unknown> {
  id: string
  type: string
  success: boolean
  result?: T
  error?: string
}

// ---------------------------------------------------------------------------
// DAT Worker messages
// ---------------------------------------------------------------------------

export interface ReadDatPayload {
  buffer: ArrayBuffer
  version: number
  features: ClientFeatures
  /** Pre-computed default durations per category (can't pass functions via postMessage) */
  defaultDurations: Record<string, number>
  runtime?: PxgDatRuntime | null
}

export interface WriteDatPayload {
  data: DatReadResult
  version: number
  features: ClientFeatures
}

export const DAT_WORKER_READ = 'readDat' as const
export const DAT_WORKER_WRITE = 'writeDat' as const

// ---------------------------------------------------------------------------
// SPR Worker messages
// ---------------------------------------------------------------------------

export interface ReadSprPayload {
  buffer: ArrayBuffer
  extended: boolean
}

export interface WriteSprPayload {
  data: SprWriteData
  extended: boolean
}

export interface BatchDecompressPayload {
  /** Array of [spriteId, compressedPixels] entries */
  entries: Array<[number, Uint8Array]>
  transparent: boolean
}

export interface BatchDecompressResult {
  /** Array of [spriteId, decompressedPixels] entries */
  entries: Array<[number, Uint8Array]>
}

export const SPR_WORKER_READ = 'readSpr' as const
export const SPR_WORKER_WRITE = 'writeSpr' as const
export const SPR_WORKER_BATCH_DECOMPRESS = 'batchDecompress' as const

// ---------------------------------------------------------------------------
// OBD Worker messages
// ---------------------------------------------------------------------------

export interface EncodeObdPayload {
  data: ThingData
}

export interface DecodeObdPayload {
  buffer: ArrayBuffer
  defaultDurations?: Record<string, number>
}

export const OBD_WORKER_ENCODE = 'encodeObd' as const
export const OBD_WORKER_DECODE = 'decodeObd' as const

// ---------------------------------------------------------------------------
// Results re-export for convenience
// ---------------------------------------------------------------------------

export type { DatReadResult } from '../services/dat/dat-reader'
export type { SprReadResult } from '../services/spr/spr-reader'
export type { SprWriteData } from '../services/spr/spr-writer'
