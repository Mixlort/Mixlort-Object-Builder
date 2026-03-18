import { describe, expect, it, vi } from 'vitest'
import { createClientFeatures } from '../../../types/version'
import { readDatWithFallback } from '../read-dat-with-fallback'

describe('readDatWithFallback', () => {
  it('retries without frame groups for unknown-flag parse errors on modern clients', async () => {
    const sourceBuffer = new ArrayBuffer(8)
    const readDat = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unknown flag 0xec (previous: 0x1) for effect id 365'))
      .mockResolvedValueOnce({
        signature: 0,
        maxItemId: 99,
        maxOutfitId: 0,
        maxEffectId: 0,
        maxMissileId: 0,
        items: [],
        outfits: [],
        effects: [],
        missiles: []
      })

    const features = createClientFeatures(true, false, true, true)

    const result = await readDatWithFallback({
      buffer: sourceBuffer,
      version: 1098,
      features,
      defaultDurations: {},
      readDat
    })

    expect(result.didFallback).toBe(true)
    expect(result.originalError).toContain('Unknown flag 0xec')
    expect(result.features.frameGroups).toBe(false)
    expect(readDat).toHaveBeenNthCalledWith(1, expect.any(ArrayBuffer), 1098, features, {})
    expect(readDat).toHaveBeenNthCalledWith(
      2,
      expect.any(ArrayBuffer),
      1098,
      expect.objectContaining({ frameGroups: false }),
      {}
    )
    expect(readDat.mock.calls[0][0]).not.toBe(sourceBuffer)
    expect(readDat.mock.calls[1][0]).not.toBe(sourceBuffer)
  })

  it('does not retry when frame groups are already disabled', async () => {
    const error = new Error('Unknown flag 0xec (previous: 0x1) for effect id 365')
    const readDat = vi.fn().mockRejectedValue(error)

    await expect(
      readDatWithFallback({
        buffer: new ArrayBuffer(0),
        version: 1098,
        features: createClientFeatures(true, false, true, false),
        defaultDurations: {},
        readDat
      })
    ).rejects.toThrow(error.message)

    expect(readDat).toHaveBeenCalledTimes(1)
  })

  it('does not retry for non compatibility errors', async () => {
    const error = new Error('Sprite count mismatch')
    const readDat = vi.fn().mockRejectedValue(error)

    await expect(
      readDatWithFallback({
        buffer: new ArrayBuffer(0),
        version: 1098,
        features: createClientFeatures(true, false, true, true),
        defaultDurations: {},
        readDat
      })
    ).rejects.toThrow(error.message)

    expect(readDat).toHaveBeenCalledTimes(1)
  })
})
