/**
 * Shared component for feature flag checkboxes.
 * Used by Create, Open, Compile, and Merge dialogs.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { FieldGroup, CheckboxField } from '../../components/Modal'
import type { FeatureFlags, FeatureForceOptions } from './useFeatureFlags'
import { isFeatureForced } from './useFeatureFlags'

interface FeatureFlagsGroupProps {
  flags: FeatureFlags
  versionValue: number
  onFlagChange: (key: keyof FeatureFlags, value: boolean) => void
  compact?: boolean
  forceFrameGroups?: FeatureForceOptions['forceFrameGroups']
}

export function FeatureFlagsGroup({
  flags,
  versionValue,
  onFlagChange,
  compact = false,
  forceFrameGroups = true
}: FeatureFlagsGroupProps): React.JSX.Element {
  const { t } = useTranslation()
  const forced = isFeatureForced(versionValue, { forceFrameGroups })

  return (
    <FieldGroup label={t('labels.options')} compact={compact}>
      <div className={compact ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'grid grid-cols-2 gap-2'}>
        <CheckboxField
          label={t('labels.extended')}
          checked={flags.extended}
          onChange={(v) => onFlagChange('extended', v)}
          disabled={forced.extended}
          compact={compact}
        />
        <CheckboxField
          label={t('labels.transparency')}
          checked={flags.transparency}
          onChange={(v) => onFlagChange('transparency', v)}
          compact={compact}
        />
        <CheckboxField
          label={t('labels.improvedAnimations')}
          checked={flags.improvedAnimations}
          onChange={(v) => onFlagChange('improvedAnimations', v)}
          disabled={forced.improvedAnimations}
          compact={compact}
        />
        <CheckboxField
          label={t('thingType.frameGroups')}
          checked={flags.frameGroups}
          onChange={(v) => onFlagChange('frameGroups', v)}
          disabled={forced.frameGroups}
          compact={compact}
        />
      </div>
    </FieldGroup>
  )
}
