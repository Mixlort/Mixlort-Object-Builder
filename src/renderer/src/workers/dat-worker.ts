/**
 * Web Worker for DAT file reading/writing.
 *
 * Offloads the heavy parsing of 50k+ thing types from the main thread.
 * Communicates via the WorkerRequest/WorkerResponse protocol.
 */

import type { WorkerRequest, WorkerResponse, ReadDatPayload, WriteDatPayload } from './types'
import { readDat } from '../services/dat/dat-reader'
import { writeDat } from '../services/dat/dat-writer'
import { DAT_WORKER_READ, DAT_WORKER_WRITE } from './types'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data

  try {
    switch (type) {
      case DAT_WORKER_READ: {
        const p = payload as ReadDatPayload
        // Create the defaultDuration function from the pre-computed durations map
        const defaultDurationFn = (category: string): number => {
          return p.defaultDurations[category] ?? 0
        }
        const result = readDat(p.buffer, p.version, p.features, defaultDurationFn, p.runtime)

        const response: WorkerResponse = {
          id,
          type,
          success: true,
          result
        }
        ctx.postMessage(response)
        break
      }

      case DAT_WORKER_WRITE: {
        const p = payload as WriteDatPayload
        const result = writeDat(p.data, p.version, p.features)

        const response: WorkerResponse = {
          id,
          type,
          success: true,
          result
        }
        // Transfer the ArrayBuffer back to the main thread (zero-copy)
        ctx.postMessage(response, [result])
        break
      }

      default: {
        const response: WorkerResponse = {
          id,
          type,
          success: false,
          error: `Unknown DAT worker message type: ${type}`
        }
        ctx.postMessage(response)
      }
    }
  } catch (err) {
    const response: WorkerResponse = {
      id,
      type,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
    ctx.postMessage(response)
  }
}
