/**
 * Dialog for opening an existing project (File > Open).
 * Ported from legacy OpenAssetsWindow.mxml.
 *
 * User selects a client folder, the dialog auto-detects DAT/SPR files
 * and version. Optional server items directory for OTB/XML loading.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  DialogButton,
  FieldGroup,
  SelectField,
  BrowseField,
  InfoRow
} from '../../components/Modal'
import { SPRITE_DIMENSIONS } from '../../data/sprite-dimensions'
import { ATTRIBUTE_SERVERS, DEFAULT_ATTRIBUTE_SERVER } from '../../data/attribute-servers'
import { findVersionBySignatures } from '../../data/versions'
import { FeatureFlagsGroup } from './FeatureFlagsGroup'
import { useFeatureFlags, applyVersionDefaults } from './useFeatureFlags'
import type { Version } from '../../types/version'
import type { SpriteDimension } from '../../types/project'

interface ClientFilesInfo {
  datFile: string
  sprFile: string
  datSignature: number
  sprSignature: number
  itemsCount: number
  outfitsCount: number
  effectsCount: number
  missilesCount: number
  spritesCount: number
  version: Version | null
}

interface ServerFilesInfo {
  otbFile: string | null
  xmlFile: string | null
}

export interface OpenAssetsResult {
  datFile: string
  sprFile: string
  version: Version
  spriteDimension: SpriteDimension
  extended: boolean
  transparency: boolean
  improvedAnimations: boolean
  frameGroups: boolean
  serverItemsDirectory: string | null
  attributeServer: string
}

interface OpenAssetsDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: OpenAssetsResult) => void
  lastDirectory?: string | null
  lastServerItemsDirectory?: string | null
}

export function OpenAssetsDialog({
  open,
  onClose,
  onConfirm,
  lastDirectory,
  lastServerItemsDirectory
}: OpenAssetsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [clientDirectory, setClientDirectory] = useState('')
  const [clientInfo, setClientInfo] = useState<ClientFilesInfo | null>(null)
  const [serverDirectory, setServerDirectory] = useState('')
  const [serverInfo, setServerInfo] = useState<ServerFilesInfo | null>(null)
  const [selectedDimensionIndex, setSelectedDimensionIndex] = useState('0')
  const [selectedAttributeServer, setSelectedAttributeServer] = useState(DEFAULT_ATTRIBUTE_SERVER)
  const [recentClientDirectories, setRecentClientDirectories] = useState<string[]>([])
  const [recentClientDirectory, setRecentClientDirectory] = useState('')
  const [recentLastDirectory, setRecentLastDirectory] = useState<string | null>(lastDirectory ?? null)
  const [recentLastServerItemsDirectory, setRecentLastServerItemsDirectory] = useState<string | null>(
    lastServerItemsDirectory ?? null
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { flags, setFlag, setFlags } = useFeatureFlags()

  const dimensionOptions = useMemo(
    () => SPRITE_DIMENSIONS.map((d, i) => ({ value: String(i), label: d.value })),
    []
  )

  const serverOptions = useMemo(
    () => ATTRIBUTE_SERVERS.map((s) => ({ value: s.id, label: s.label })),
    []
  )

  const recentClientDirectoryOptions = useMemo(
    () => [
      { value: '', label: 'Select recent folder...' },
      ...recentClientDirectories.map((directory) => ({ value: directory, label: directory }))
    ],
    [recentClientDirectories]
  )

  useEffect(() => {
    if (!open || !window.api?.recent) return

    let cancelled = false

    const loadRecentDirectories = async () => {
      await window.api.recent.load()
      const recent = await window.api.recent.getAll()
      if (cancelled) return

      setRecentClientDirectories(recent.recentClientDirectories ?? [])
      setRecentLastDirectory(recent.lastDirectory ?? lastDirectory ?? null)
      setRecentLastServerItemsDirectory(
        recent.lastServerItemsDirectory ?? lastServerItemsDirectory ?? null
      )
    }

    loadRecentDirectories().catch(() => {
      if (cancelled) return
      setRecentClientDirectories(lastDirectory ? [lastDirectory] : [])
      setRecentLastDirectory(lastDirectory ?? null)
      setRecentLastServerItemsDirectory(lastServerItemsDirectory ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [open, lastDirectory, lastServerItemsDirectory])

  const loadClientDirectory = useCallback(
    async (dir: string) => {
      setClientDirectory(dir)
      setRecentClientDirectory(dir)
      setError(null)
      setLoading(true)

      try {
        // Discover DAT/SPR files in the directory
        const discovery = await window.api.project.discoverClientFiles(dir)

        if (!discovery.datFile || !discovery.sprFile) {
          setError('No DAT/SPR files found in the selected folder.')
          setClientInfo(null)
          setLoading(false)
          return
        }

        // Read file headers to get signatures and counts
        const datBuffer = await window.api.file.readBinary(discovery.datFile)
        const sprBuffer = await window.api.file.readBinary(discovery.sprFile)

        // Parse DAT header: signature (u32) + 4x maxId (u16)
        const datView = new DataView(datBuffer)
        const datSignature = datView.getUint32(0, true)
        const maxItemId = datView.getUint16(4, true)
        const maxOutfitId = datView.getUint16(6, true)
        const maxEffectId = datView.getUint16(8, true)
        const maxMissileId = datView.getUint16(10, true)

        // Parse SPR header: signature (u32) + count (u16 or u32)
        const sprView = new DataView(sprBuffer)
        const sprSignature = sprView.getUint32(0, true)

        // Detect version by signatures
        const version = findVersionBySignatures(datSignature, sprSignature) ?? null
        const isExtended = version ? version.value >= 960 : false
        const spritesCount = isExtended ? sprView.getUint32(4, true) : sprView.getUint16(4, true)

        const info: ClientFilesInfo = {
          datFile: discovery.datFile,
          sprFile: discovery.sprFile,
          datSignature,
          sprSignature,
          itemsCount: maxItemId,
          outfitsCount: maxOutfitId,
          effectsCount: maxEffectId,
          missilesCount: maxMissileId,
          spritesCount,
          version
        }

        setClientInfo(info)

        if (version) {
          setFlags(
            applyVersionDefaults(
              {
                extended: false,
                transparency: false,
                improvedAnimations: false,
                frameGroups: false
              },
              version.value
            )
          )
        }

        await window.api.recent.set('lastDirectory', dir)
        setRecentLastDirectory(dir)
        setRecentClientDirectories((current) => [dir, ...current.filter((path) => path !== dir)].slice(0, 8))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read client files.')
        setClientInfo(null)
      } finally {
        setLoading(false)
      }
    },
    [setFlags]
  )

  const handleBrowseClient = useCallback(async () => {
    if (!window.api?.file) return

    const result = await window.api.file.showDirectoryDialog({
      title: 'Select Client Folder',
      defaultPath: recentLastDirectory ?? lastDirectory ?? undefined
    })

    if (result.canceled || !result.directoryPath) return

    await loadClientDirectory(result.directoryPath)
  }, [recentLastDirectory, lastDirectory, loadClientDirectory])

  const handleBrowseServer = useCallback(async () => {
    if (!window.api?.file) return

    const result = await window.api.file.showDirectoryDialog({
      title: 'Select Server Items Folder',
      defaultPath: recentLastServerItemsDirectory ?? lastServerItemsDirectory ?? undefined
    })

    if (result.canceled || !result.directoryPath) return

    const dir = result.directoryPath
    setServerDirectory(dir)

    try {
      const discovery = await window.api.project.discoverServerItemFiles(dir)
      setServerInfo({ otbFile: discovery.otbFile, xmlFile: discovery.xmlFile })
      await window.api.recent.set('lastServerItemsDirectory', dir)
      setRecentLastServerItemsDirectory(dir)
    } catch {
      setServerInfo(null)
    }
  }, [recentLastServerItemsDirectory, lastServerItemsDirectory])

  const canConfirm = clientInfo?.version != null && !loading

  const handleConfirm = useCallback(() => {
    if (!clientInfo?.version) return

    const dimension = SPRITE_DIMENSIONS[Number(selectedDimensionIndex)]
    onConfirm({
      datFile: clientInfo.datFile,
      sprFile: clientInfo.sprFile,
      version: clientInfo.version,
      spriteDimension: dimension,
      ...flags,
      serverItemsDirectory: serverDirectory || null,
      attributeServer: selectedAttributeServer
    })
    onClose()
  }, [
    clientInfo,
    selectedDimensionIndex,
    flags,
    serverDirectory,
    selectedAttributeServer,
    onConfirm,
    onClose
  ])

  const handleClose = useCallback(() => {
    setClientDirectory('')
    setClientInfo(null)
    setServerDirectory('')
    setServerInfo(null)
    setRecentClientDirectory('')
    setError(null)
    onClose()
  }, [onClose])

  return (
    <Modal
      title={t('controls.openAssetFiles')}
      open={open}
      onClose={handleClose}
      width={520}
      footer={
        <>
          <DialogButton label={t('labels.cancel')} onClick={handleClose} />
          <DialogButton
            label={t('labels.load')}
            onClick={handleConfirm}
            primary
            disabled={!canConfirm}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Client folder */}
        <FieldGroup label={t('controls.clientFolder')}>
          <div className="flex flex-col gap-2">
            <BrowseField label="Folder" value={clientDirectory} onBrowse={handleBrowseClient} />
            {recentClientDirectories.length > 0 && (
              <SelectField
                label="Recent"
                value={recentClientDirectory}
                onChange={(value) => {
                  setRecentClientDirectory(value)
                  if (value) {
                    void loadClientDirectory(value)
                  }
                }}
                options={recentClientDirectoryOptions}
              />
            )}
          </div>
        </FieldGroup>

        {loading && (
          <div className="text-center text-xs text-text-secondary">Loading file info...</div>
        )}

        {error && <div className="rounded bg-red-900/30 px-3 py-2 text-xs text-error">{error}</div>}

        {/* Version info (auto-detected) */}
        {clientInfo && (
          <>
            <FieldGroup label={t('labels.version')}>
              <InfoRow
                label={t('labels.version')}
                value={clientInfo.version?.valueStr ?? 'Unknown'}
              />
            </FieldGroup>

            {/* DAT info */}
            <FieldGroup label={t('labels.file') + ' DAT'}>
              <div className="grid grid-cols-2 gap-1">
                <InfoRow
                  label={t('labels.signature')}
                  value={'0x' + clientInfo.datSignature.toString(16).toUpperCase().padStart(8, '0')}
                />
                <InfoRow label={t('labels.items')} value={clientInfo.itemsCount} />
                <InfoRow label={t('labels.outfits')} value={clientInfo.outfitsCount} />
                <InfoRow label={t('labels.effects')} value={clientInfo.effectsCount} />
                <InfoRow label={t('labels.missiles')} value={clientInfo.missilesCount} />
              </div>
            </FieldGroup>

            {/* SPR info */}
            <FieldGroup label={t('labels.file') + ' SPR'}>
              <div className="grid grid-cols-2 gap-1">
                <InfoRow
                  label={t('labels.signature')}
                  value={'0x' + clientInfo.sprSignature.toString(16).toUpperCase().padStart(8, '0')}
                />
                <InfoRow label={t('labels.sprites')} value={clientInfo.spritesCount} />
              </div>
            </FieldGroup>
          </>
        )}

        {/* Server items folder (optional) */}
        <FieldGroup label="Server Items (Optional)">
          <div className="flex flex-col gap-2">
            <BrowseField
              label="Folder"
              value={serverDirectory}
              onBrowse={handleBrowseServer}
              placeholder="Select server items folder..."
            />
            {serverInfo && (
              <div className="flex gap-4 pl-[108px] text-xs">
                <span className={serverInfo.otbFile ? 'text-green-400' : 'text-error'}>
                  items.otb {serverInfo.otbFile ? '[OK]' : '[X]'}
                </span>
                <span className={serverInfo.xmlFile ? 'text-green-400' : 'text-error'}>
                  items.xml {serverInfo.xmlFile ? '[OK]' : '[X]'}
                </span>
              </div>
            )}
          </div>
        </FieldGroup>

        {/* Settings */}
        <FieldGroup label={t('labels.options')}>
          <div className="flex flex-col gap-2">
            <SelectField
              label={t('labels.spriteDimension')}
              value={selectedDimensionIndex}
              onChange={setSelectedDimensionIndex}
              options={dimensionOptions}
            />
            <SelectField
              label="Attribute Server"
              value={selectedAttributeServer}
              onChange={setSelectedAttributeServer}
              options={serverOptions}
              disabled={!serverDirectory}
            />
          </div>
        </FieldGroup>

        {/* Feature flags */}
        <FeatureFlagsGroup
          flags={flags}
          versionValue={clientInfo?.version?.value ?? 0}
          onFlagChange={setFlag}
        />
      </div>
    </Modal>
  )
}
