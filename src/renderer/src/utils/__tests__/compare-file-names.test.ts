import { describe, expect, it } from 'vitest'
import { compareFileNamesNaturally } from '../compare-file-names'

describe('compareFileNamesNaturally', () => {
  it('sorts numeric file names in numeric order', () => {
    const input = [
      '1.obd',
      '10.obd',
      '100.obd',
      '1001.obd',
      '11.obd',
      '2.obd',
      '3.obd',
      '20.obd'
    ]

    const sorted = [...input].sort(compareFileNamesNaturally)

    expect(sorted).toEqual([
      '1.obd',
      '2.obd',
      '3.obd',
      '10.obd',
      '11.obd',
      '20.obd',
      '100.obd',
      '1001.obd'
    ])
  })

  it('ignores folder prefixes and extension when comparing', () => {
    const input = [
      '/tmp/effects/12.obd',
      '/tmp/effects/2.obd',
      '/tmp/effects/1.obd',
      '/tmp/effects/10.obd'
    ]

    const sorted = [...input].sort(compareFileNamesNaturally)

    expect(sorted).toEqual([
      '/tmp/effects/1.obd',
      '/tmp/effects/2.obd',
      '/tmp/effects/10.obd',
      '/tmp/effects/12.obd'
    ])
  })
})
