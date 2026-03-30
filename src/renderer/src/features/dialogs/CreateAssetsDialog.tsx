/**
 * Dialog for creating a new empty project (File > New).
 * Ported from legacy CreateAssetsWindow.mxml.
 *
 * User selects a client version, sprite dimension, and feature flags.
 * On confirm, dispatches the create project action.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, DialogButton, FieldGroup, SelectField } from '../../components/Modal'
import { VERSIONS } from '../../data/versions'
import { SPRITE_DIMENSIONS } from '../../data/sprite-dimensions'
import { FeatureFlagsGroup } from './FeatureFlagsGroup'
import { useFeatureFlags, applyVersionDefaults } from './useFeatureFlags'
import type { Version } from '../../types/version'
import type { SpriteDimension } from '../../types/project'

export interface CreateAssetsResult {
  version: Version
  spriteDimension: SpriteDimension
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean
}

interface CreateAssetsDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: CreateAssetsResult) => void
  defaultTransparency?: boolean
}

export function CreateAssetsDialog({
  open,
  onClose,
  onConfirm,
  defaultTransparency = false
}: CreateAssetsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<string>('')
  const [selectedDimensionIndex, setSelectedDimensionIndex] = useState<string>('0')
  const { flags, setFlag, setFlags } = useFeatureFlags({ transparency: defaultTransparency })

  const versionOptions = useMemo(
    () => [
      { value: '', label: 'Select version...' },
      ...VERSIONS.map((v, i) => ({ value: String(i), label: v.valueStr }))
    ],
    []
  )

  const dimensionOptions = useMemo(
    () => SPRITE_DIMENSIONS.map((d, i) => ({ value: String(i), label: d.value })),
    []
  )

  const selectedVersion =
    selectedVersionIndex !== '' ? VERSIONS[Number(selectedVersionIndex)] : null

  React.useEffect(() => {
    if (!open) return

    setFlags({
      extended: false,
      transparency: defaultTransparency,
      improvedAnimations: false,
      frameGroups: false
    })
  }, [defaultTransparency, open, setFlags])

  const handleVersionChange = useCallback(
    (indexStr: string) => {
      setSelectedVersionIndex(indexStr)
      if (indexStr !== '') {
        const version = VERSIONS[Number(indexStr)]
        setFlags(applyVersionDefaults(flags, version.value))
      }
    },
    [flags, setFlags]
  )

  const handleConfirm = useCallback(() => {
    if (!selectedVersion) return

    const dimension = SPRITE_DIMENSIONS[Number(selectedDimensionIndex)]
    onConfirm({
      version: selectedVersion,
      spriteDimension: dimension,
      ...flags
    })
    onClose()
  }, [selectedVersion, selectedDimensionIndex, flags, onConfirm, onClose])

  const handleClose = useCallback(() => {
    setSelectedVersionIndex('')
    setSelectedDimensionIndex('0')
    setFlags({
      extended: false,
      transparency: defaultTransparency,
      improvedAnimations: false,
      frameGroups: false
    })
    onClose()
  }, [defaultTransparency, onClose, setFlags])

  return (
    <Modal
      title={t('controls.createAssetFiles')}
      open={open}
      onClose={handleClose}
      width={420}
      footer={
        <>
          <DialogButton label={t('labels.cancel')} onClick={handleClose} />
          <DialogButton
            label={t('labels.confirm')}
            onClick={handleConfirm}
            primary
            disabled={!selectedVersion}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldGroup label={t('labels.version')}>
          <SelectField
            label={t('labels.version')}
            value={selectedVersionIndex}
            onChange={handleVersionChange}
            options={versionOptions}
          />
        </FieldGroup>

        <FieldGroup label={t('labels.options')}>
          <SelectField
            label={t('labels.spriteDimension')}
            value={selectedDimensionIndex}
            onChange={setSelectedDimensionIndex}
            options={dimensionOptions}
          />
        </FieldGroup>

        <FeatureFlagsGroup
          flags={flags}
          versionValue={selectedVersion?.value ?? 0}
          onFlagChange={setFlag}
        />
      </div>
    </Modal>
  )
}
