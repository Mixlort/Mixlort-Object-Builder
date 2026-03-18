/**
 * Dialog for compiling/saving a project (File > Compile As).
 * Ported from legacy CompileAssetsWindow.mxml.
 *
 * User selects output directory, file name, version, and options.
 * Optionally exports server items (OTB/XML).
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  DialogButton,
  FieldGroup,
  SelectField,
  TextInputField,
  BrowseField,
  CheckboxField
} from '../../components/Modal'
import { VERSIONS } from '../../data/versions'
import { ATTRIBUTE_SERVERS, DEFAULT_ATTRIBUTE_SERVER } from '../../data/attribute-servers'
import { OTFormat } from '../../types/project'
import type { ClientFeatures } from '../../types/version'
import { FeatureFlagsGroup } from './FeatureFlagsGroup'
import { useFeatureFlags, applyVersionDefaults } from './useFeatureFlags'
import type { Version } from '../../types/version'

export interface CompileAssetsResult {
  filesName: string
  directory: string
  version: Version
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean
  serverItemsDirectory: string | null
  serverItemsFormat: string
  serverItemsBinaryPeer: string
  attributeServer: string
}

interface CompileAssetsDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: CompileAssetsResult) => void
  currentVersion?: Version | null
  currentFeatures?: ClientFeatures | null
  serverItemsLoaded?: boolean
  lastDirectory?: string | null
}

export function CompileAssetsDialog({
  open,
  onClose,
  onConfirm,
  currentVersion,
  currentFeatures,
  serverItemsLoaded = false,
  lastDirectory
}: CompileAssetsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [filesName, setFilesName] = useState('Tibia')
  const [directory, setDirectory] = useState('')
  const [serverItemsEnabled, setServerItemsEnabled] = useState(false)
  const [serverItemsDirectory, setServerItemsDirectory] = useState('')
  const [serverItemsFormat, setServerItemsFormat] = useState<string>(OTFormat.XML)
  const [serverItemsBinaryPeer, setServerItemsBinaryPeer] = useState<string>(OTFormat.OTB)
  const [selectedAttributeServer, setSelectedAttributeServer] = useState(DEFAULT_ATTRIBUTE_SERVER)

  // Find initial version index based on currentVersion
  const initialVersionIndex = useMemo(() => {
    if (!currentVersion) return ''
    const idx = VERSIONS.findIndex(
      (v) =>
        v.datSignature === currentVersion.datSignature &&
        v.sprSignature === currentVersion.sprSignature
    )
    return idx >= 0 ? String(idx) : ''
  }, [currentVersion])

  const [selectedVersionIndex, setSelectedVersionIndex] = useState(initialVersionIndex)
  const { flags, setFlag, setFlags } = useFeatureFlags()

  // Reset version index when dialog opens with a different currentVersion
  React.useEffect(() => {
    if (open) {
      setSelectedVersionIndex(initialVersionIndex)
      if (currentFeatures) {
        setFlags({
          extended: currentFeatures.extended,
          transparency: currentFeatures.transparency,
          improvedAnimations: currentFeatures.improvedAnimations,
          frameGroups: currentFeatures.frameGroups
        })
      } else if (currentVersion) {
        setFlags(
          applyVersionDefaults(
            { extended: false, transparency: false, improvedAnimations: false, frameGroups: false },
            currentVersion.value
          )
        )
      }
    }
  }, [open, initialVersionIndex, currentVersion, currentFeatures, setFlags])

  const versionOptions = useMemo(
    () => [
      { value: '', label: 'Select version...' },
      ...VERSIONS.map((v, i) => ({ value: String(i), label: v.valueStr }))
    ],
    []
  )

  const serverOptions = useMemo(
    () => ATTRIBUTE_SERVERS.map((s) => ({ value: s.id, label: s.label })),
    []
  )

  const formatOptions = useMemo(() => [{ value: OTFormat.XML, label: 'XML' }], [])

  const peerOptions = useMemo(
    () => [
      { value: OTFormat.OTB, label: 'Items.otb' },
      { value: OTFormat.DAT, label: 'Tibia.dat' },
      { value: OTFormat.ASSETS, label: 'Assets.dat' }
    ],
    []
  )

  const selectedVersion =
    selectedVersionIndex !== '' ? VERSIONS[Number(selectedVersionIndex)] : null

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

  const handleBrowseDirectory = useCallback(async () => {
    if (!window.api?.file) return

    const result = await window.api.file.showDirectoryDialog({
      title: 'Select Output Folder',
      defaultPath: lastDirectory ?? undefined
    })

    if (!result.canceled && result.directoryPath) {
      setDirectory(result.directoryPath)
    }
  }, [lastDirectory])

  const handleBrowseServerItems = useCallback(async () => {
    if (!window.api?.file) return

    const result = await window.api.file.showDirectoryDialog({
      title: 'Select Server Items Output Folder'
    })

    if (!result.canceled && result.directoryPath) {
      setServerItemsDirectory(result.directoryPath)
    }
  }, [])

  const canConfirm = selectedVersion != null && directory !== '' && filesName.trim() !== ''

  const handleConfirm = useCallback(() => {
    if (!selectedVersion || !canConfirm) return

    onConfirm({
      filesName: filesName.trim(),
      directory,
      version: selectedVersion,
      ...flags,
      serverItemsDirectory: serverItemsEnabled ? serverItemsDirectory || null : null,
      serverItemsFormat,
      serverItemsBinaryPeer,
      attributeServer: selectedAttributeServer
    })
    onClose()
  }, [
    selectedVersion,
    canConfirm,
    filesName,
    directory,
    flags,
    serverItemsEnabled,
    serverItemsDirectory,
    serverItemsFormat,
    serverItemsBinaryPeer,
    selectedAttributeServer,
    onConfirm,
    onClose
  ])

  const handleClose = useCallback(() => {
    setDirectory('')
    setServerItemsDirectory('')
    setServerItemsEnabled(false)
    onClose()
  }, [onClose])

  return (
    <Modal
      title={t('controls.compileAssetFiles')}
      open={open}
      onClose={handleClose}
      width={520}
      footer={
        <>
          <DialogButton label={t('labels.cancel')} onClick={handleClose} />
          <DialogButton
            label={t('labels.confirm')}
            onClick={handleConfirm}
            primary
            disabled={!canConfirm}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Output name */}
        <FieldGroup label={t('labels.name')}>
          <TextInputField
            label={t('labels.name')}
            value={filesName}
            onChange={setFilesName}
            placeholder="Tibia"
          />
        </FieldGroup>

        {/* Output folder */}
        <FieldGroup label={t('controls.outputFolder')}>
          <BrowseField
            label="Folder"
            value={directory}
            onBrowse={handleBrowseDirectory}
            placeholder="Select output folder..."
          />
        </FieldGroup>

        {/* Server items export (optional) */}
        <FieldGroup label="Server Items Export">
          <div className="flex flex-col gap-2">
            <CheckboxField
              label="Export server items"
              checked={serverItemsEnabled}
              onChange={setServerItemsEnabled}
              disabled={!serverItemsLoaded}
            />
            {serverItemsEnabled && (
              <>
                <BrowseField
                  label="Folder"
                  value={serverItemsDirectory}
                  onBrowse={handleBrowseServerItems}
                  placeholder="Select server items folder..."
                />
                <SelectField
                  label={t('labels.format')}
                  value={serverItemsFormat}
                  onChange={setServerItemsFormat}
                  options={formatOptions}
                />
                <SelectField
                  label="Binary Peer"
                  value={serverItemsBinaryPeer}
                  onChange={setServerItemsBinaryPeer}
                  options={peerOptions}
                />
                <SelectField
                  label="Attr. Server"
                  value={selectedAttributeServer}
                  onChange={setSelectedAttributeServer}
                  options={serverOptions}
                />
              </>
            )}
          </div>
        </FieldGroup>

        {/* Version */}
        <FieldGroup label={t('labels.version')}>
          <SelectField
            label={t('labels.version')}
            value={selectedVersionIndex}
            onChange={handleVersionChange}
            options={versionOptions}
          />
        </FieldGroup>

        {/* Feature flags */}
        <FeatureFlagsGroup
          flags={flags}
          versionValue={selectedVersion?.value ?? 0}
          onFlagChange={setFlag}
          forceFrameGroups={false}
        />
      </div>
    </Modal>
  )
}
