/**
 * High-level async API for offloading heavy operations to Web Workers.
 *
 * Workers are lazily created on first use and reused for subsequent calls.
 * This module is the primary import for components that previously called
 * binary services directly on the main thread.
 *
 * Usage:
 *   import { workerService } from '@renderer/workers/worker-service'
 *   const result = await workerService.readDat(buffer, version, features, durations)
 */

import { WorkerManager } from './worker-manager'
import type {
  ReadDatPayload,
  WriteDatPayload,
  ReadSprPayload,
  WriteSprPayload,
  BatchDecompressPayload,
  BatchDecompressResult,
  EncodeObdPayload,
  DecodeObdPayload,
  DatReadResult,
  SprReadResult,
  SprWriteData
} from './types'
import {
  DAT_WORKER_READ,
  DAT_WORKER_WRITE,
  SPR_WORKER_READ,
  SPR_WORKER_WRITE,
  SPR_WORKER_BATCH_DECOMPRESS,
  OBD_WORKER_ENCODE,
  OBD_WORKER_DECODE
} from './types'
import { cloneThingType, type ClientFeatures, type ThingData } from '../types'
import type { PxgDatRuntime } from '../services/pxg-runtime'

// ---------------------------------------------------------------------------
// Worker instances (lazy singletons)
// ---------------------------------------------------------------------------

let datWorker: WorkerManager | null = null
let sprWorker: WorkerManager | null = null
let obdWorker: WorkerManager | null = null

function getDatWorker(): WorkerManager {
  if (!datWorker || datWorker.isTerminated) {
    datWorker = new WorkerManager(
      new Worker(new URL('./dat-worker.ts', import.meta.url), { type: 'module' })
    )
  }
  return datWorker
}

function getSprWorker(): WorkerManager {
  if (!sprWorker || sprWorker.isTerminated) {
    sprWorker = new WorkerManager(
      new Worker(new URL('./spr-worker.ts', import.meta.url), { type: 'module' })
    )
  }
  return sprWorker
}

function getObdWorker(): WorkerManager {
  if (!obdWorker || obdWorker.isTerminated) {
    obdWorker = new WorkerManager(
      new Worker(new URL('./obd-worker.ts', import.meta.url), { type: 'module' })
    )
  }
  return obdWorker
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const workerService = {
  // -------------------------------------------------------------------------
  // DAT operations
  // -------------------------------------------------------------------------

  /**
   * Parse a DAT binary file in a Web Worker.
   *
   * @param buffer - Raw DAT file bytes (will be transferred, not copied)
   * @param version - Client version number
   * @param features - Client feature flags
   * @param defaultDurations - Pre-computed default durations per category
   * @returns Parsed DAT data
   */
  async readDat(
    buffer: ArrayBuffer,
    version: number,
    features: ClientFeatures,
    defaultDurations: Record<string, number>,
    runtime?: PxgDatRuntime | null
  ): Promise<DatReadResult> {
    const payload: ReadDatPayload = { buffer, version, features, defaultDurations, runtime }
    return getDatWorker().request<DatReadResult>(DAT_WORKER_READ, payload, [buffer])
  },

  /**
   * Write a DAT binary file in a Web Worker.
   *
   * @param data - Parsed DAT data to serialize
   * @param version - Target client version
   * @param features - Target client features
   * @returns Serialized DAT binary data
   */
  async writeDat(
    data: DatReadResult,
    version: number,
    features: ClientFeatures
  ): Promise<ArrayBuffer> {
    const payload: WriteDatPayload = {
      data: {
        signature: data.signature,
        maxItemId: data.maxItemId,
        maxOutfitId: data.maxOutfitId,
        maxEffectId: data.maxEffectId,
        maxMissileId: data.maxMissileId,
        items: data.items.map(cloneThingType),
        outfits: data.outfits.map(cloneThingType),
        effects: data.effects.map(cloneThingType),
        missiles: data.missiles.map(cloneThingType)
      },
      version,
      features: { ...features }
    }
    return getDatWorker().request<ArrayBuffer>(DAT_WORKER_WRITE, payload)
  },

  // -------------------------------------------------------------------------
  // SPR operations
  // -------------------------------------------------------------------------

  /**
   * Parse a SPR binary file in a Web Worker.
   *
   * @param buffer - Raw SPR file bytes (will be transferred, not copied)
   * @param extended - Extended format flag (v960+)
   * @returns Parsed SPR data with compressed sprite pixels
   */
  async readSpr(buffer: ArrayBuffer, extended: boolean): Promise<SprReadResult> {
    const payload: ReadSprPayload = { buffer, extended }
    return getSprWorker().request<SprReadResult>(SPR_WORKER_READ, payload, [buffer])
  },

  /**
   * Write a SPR binary file in a Web Worker.
   *
   * @param data - SPR data to serialize
   * @param extended - Extended format flag
   * @returns Serialized SPR binary data
   */
  async writeSpr(data: SprWriteData, extended: boolean): Promise<ArrayBuffer> {
    const payload: WriteSprPayload = { data, extended }
    return getSprWorker().request<ArrayBuffer>(SPR_WORKER_WRITE, payload)
  },

  /**
   * Decompress multiple sprites in batch in a Web Worker.
   * Useful for pre-loading visible sprites in a list.
   *
   * @param entries - Array of [spriteId, compressedPixels]
   * @param transparent - Transparency mode for decompression
   * @returns Array of [spriteId, decompressedPixels]
   */
  async batchDecompressSprites(
    entries: Array<[number, Uint8Array]>,
    transparent: boolean
  ): Promise<Array<[number, Uint8Array]>> {
    const payload: BatchDecompressPayload = { entries, transparent }
    const result = await getSprWorker().request<BatchDecompressResult>(
      SPR_WORKER_BATCH_DECOMPRESS,
      payload
    )
    return result.entries
  },

  // -------------------------------------------------------------------------
  // OBD operations
  // -------------------------------------------------------------------------

  /**
   * Encode a ThingData to OBD binary format in a Web Worker.
   * Offloads LZMA compression from the main thread.
   *
   * @param data - ThingData to encode
   * @returns OBD binary data
   */
  async encodeObd(data: ThingData): Promise<ArrayBuffer> {
    const payload: EncodeObdPayload = { data }
    return getObdWorker().request<ArrayBuffer>(OBD_WORKER_ENCODE, payload)
  },

  /**
   * Decode an OBD binary file in a Web Worker.
   * Offloads LZMA decompression from the main thread.
   *
   * @param buffer - Raw OBD file bytes (will be transferred, not copied)
   * @param defaultDurations - Optional pre-computed default durations
   * @returns Decoded ThingData
   */
  async decodeObd(
    buffer: ArrayBuffer,
    defaultDurations?: Record<string, number>
  ): Promise<ThingData> {
    const payload: DecodeObdPayload = { buffer, defaultDurations }
    return getObdWorker().request<ThingData>(OBD_WORKER_DECODE, payload, [buffer])
  },

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Terminate all workers and free resources.
   * Workers will be recreated on next use.
   */
  terminateAll(): void {
    if (datWorker) {
      datWorker.terminate()
      datWorker = null
    }
    if (sprWorker) {
      sprWorker.terminate()
      sprWorker = null
    }
    if (obdWorker) {
      obdWorker.terminate()
      obdWorker = null
    }
  }
}
