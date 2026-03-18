import { describe, expect, it } from 'vitest'
import { isFeatureForced } from '../useFeatureFlags'

describe('isFeatureForced', () => {
  it('keeps frame groups optional when requested by the dialog', () => {
    const forced = isFeatureForced(1098, { forceFrameGroups: false })

    expect(forced.extended).toBe(true)
    expect(forced.improvedAnimations).toBe(true)
    expect(forced.frameGroups).toBe(false)
  })

  it('still forces frame groups by default', () => {
    const forced = isFeatureForced(1098)

    expect(forced.frameGroups).toBe(true)
  })
})
