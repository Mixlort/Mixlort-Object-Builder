/**
 * Shared hook for managing feature flag state with version-based defaults.
 * Used by Create, Open, Compile, and Merge dialogs.
 */

import { useState, useCallback } from 'react'

export interface FeatureFlags {
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean
}

export interface FeatureForceOptions {
  forceFrameGroups?: boolean
}

/**
 * Returns whether a feature is forced ON by the version and cannot be toggled off.
 */
export function isFeatureForced(
  versionValue: number,
  options: FeatureForceOptions = {}
): {
  extended: boolean
  improvedAnimations: boolean
  frameGroups: boolean
} {
  const forceFrameGroups = options.forceFrameGroups ?? true

  return {
    extended: versionValue >= 960,
    improvedAnimations: versionValue >= 1050,
    frameGroups: forceFrameGroups && versionValue >= 1057
  }
}

/**
 * Apply version-based defaults to feature flags.
 * Forces certain features ON for versions that require them.
 */
export function applyVersionDefaults(flags: FeatureFlags, versionValue: number): FeatureFlags {
  const forced = isFeatureForced(versionValue)
  return {
    extended: forced.extended || flags.extended,
    transparency: flags.transparency,
    improvedAnimations: forced.improvedAnimations || flags.improvedAnimations,
    frameGroups: forced.frameGroups || flags.frameGroups
  }
}

export interface UseFeatureFlagsReturn {
  flags: FeatureFlags
  setFlag: (key: keyof FeatureFlags, value: boolean) => void
  setFlags: (flags: FeatureFlags) => void
  applyVersion: (versionValue: number) => void
  isForced: (key: keyof FeatureFlags, versionValue: number) => boolean
}

export function useFeatureFlags(initial?: Partial<FeatureFlags>): UseFeatureFlagsReturn {
  const [flags, setFlagsState] = useState<FeatureFlags>({
    extended: initial?.extended ?? false,
    transparency: initial?.transparency ?? false,
    improvedAnimations: initial?.improvedAnimations ?? false,
    frameGroups: initial?.frameGroups ?? false
  })

  const setFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    setFlagsState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setFlags = useCallback((newFlags: FeatureFlags) => {
    setFlagsState(newFlags)
  }, [])

  const applyVersion = useCallback((versionValue: number) => {
    setFlagsState((prev) => applyVersionDefaults(prev, versionValue))
  }, [])

  const isForced = useCallback((key: keyof FeatureFlags, versionValue: number): boolean => {
    const forced = isFeatureForced(versionValue)
    if (key === 'extended') return forced.extended
    if (key === 'improvedAnimations') return forced.improvedAnimations
    if (key === 'frameGroups') return forced.frameGroups
    return false
  }, [])

  return { flags, setFlag, setFlags, applyVersion, isForced }
}
