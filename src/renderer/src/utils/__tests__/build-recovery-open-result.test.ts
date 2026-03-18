import { describe, expect, it } from 'vitest'
import { buildRecoveryOpenResult } from '../build-recovery-open-result'

function makeDatHeader(signature: number): ArrayBuffer {
  const buffer = new ArrayBuffer(12)
  const view = new DataView(buffer)
  view.setUint32(0, signature, true)
  return buffer
}

function makeSprHeader(signature: number): ArrayBuffer {
  const buffer = new ArrayBuffer(6)
  const view = new DataView(buffer)
  view.setUint32(0, signature, true)
  return buffer
}

describe('buildRecoveryOpenResult', () => {
  it('builds an automatic open payload from recovery data and signatures', () => {
    const result = buildRecoveryOpenResult({
      datFilePath: '/tmp/Tibia.dat',
      sprFilePath: '/tmp/Tibia.spr',
      versionValue: 1098,
      serverItemsPath: '/tmp/server',
      datBuffer: makeDatHeader(0x42a3),
      sprBuffer: makeSprHeader(0x57bbd603)
    })

    expect(result.datFile).toBe('/tmp/Tibia.dat')
    expect(result.sprFile).toBe('/tmp/Tibia.spr')
    expect(result.version.value).toBe(1098)
    expect(result.version.valueStr).toBe('10.98')
    expect(result.spriteDimension.value).toBe('32x32')
    expect(result.extended).toBe(true)
    expect(result.improvedAnimations).toBe(true)
    expect(result.frameGroups).toBe(true)
    expect(result.serverItemsDirectory).toBe('/tmp/server')
  })

  it('falls back to version value when signatures are unknown', () => {
    const result = buildRecoveryOpenResult({
      datFilePath: '/tmp/Tibia.dat',
      sprFilePath: '/tmp/Tibia.spr',
      versionValue: 1098,
      serverItemsPath: null,
      datBuffer: makeDatHeader(0xdeadbeef),
      sprBuffer: makeSprHeader(0x12345678)
    })

    expect(result.version.value).toBe(1098)
    expect(result.serverItemsDirectory).toBeNull()
  })
})
