/**
 * Generic typed wrapper for Web Workers.
 *
 * Provides a Promise-based request/response API over postMessage with:
 * - Unique ID correlation for concurrent requests
 * - Transferable object support (zero-copy ArrayBuffer transfer)
 * - Error propagation from worker to caller
 * - Automatic worker termination
 */

import type { WorkerRequest, WorkerResponse } from './types'

let nextRequestId = 1

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
}

export class WorkerManager {
  private worker: Worker
  private pending = new Map<string, PendingRequest>()
  private terminated = false

  constructor(worker: Worker) {
    this.worker = worker

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (!pending) return

      this.pending.delete(response.id)

      if (response.success) {
        pending.resolve(response.result)
      } else {
        pending.reject(new Error(response.error ?? 'Unknown worker error'))
      }
    }

    this.worker.onerror = (event: ErrorEvent) => {
      // Reject all pending requests on worker error
      const error = new Error(event.message ?? 'Worker error')
      for (const [id, pending] of this.pending) {
        pending.reject(error)
        this.pending.delete(id)
      }
    }
  }

  /**
   * Send a typed request to the worker and return a Promise for the result.
   *
   * @param type - Message type identifier
   * @param payload - Request payload data
   * @param transfer - Optional transferable objects (e.g., ArrayBuffers) for zero-copy transfer
   */
  request<TResult>(type: string, payload: unknown, transfer?: Transferable[]): Promise<TResult> {
    if (this.terminated) {
      return Promise.reject(new Error('Worker has been terminated'))
    }

    const id = String(nextRequestId++)

    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })

      const message: WorkerRequest = { id, type, payload }

      try {
        if (transfer && transfer.length > 0) {
          this.worker.postMessage(message, transfer)
        } else {
          this.worker.postMessage(message)
        }
      } catch (err) {
        this.pending.delete(id)

        if (err instanceof DOMException && err.name === 'DataCloneError') {
          reject(
            new Error(
              `Worker payload could not be cloned for "${type}". The project state contains non-serializable data.`
            )
          )
          return
        }

        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /**
   * Terminate the worker and reject all pending requests.
   */
  terminate(): void {
    if (this.terminated) return
    this.terminated = true

    const error = new Error('Worker terminated')
    for (const [, pending] of this.pending) {
      pending.reject(error)
    }
    this.pending.clear()

    this.worker.terminate()
  }

  /**
   * Check if the worker has been terminated.
   */
  get isTerminated(): boolean {
    return this.terminated
  }

  /**
   * Get the number of pending requests.
   */
  get pendingCount(): number {
    return this.pending.size
  }
}
