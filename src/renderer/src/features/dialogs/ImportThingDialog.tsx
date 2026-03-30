/**
 * Import thing dialog for loading .obd files into the project.
 * Ported from legacy ImportThingWindow.mxml.
 *
 * Allows browsing for .obd files, shows a preview of the content
 * (type, version), and confirms import.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  DialogButton,
  BrowseField,
  FieldGroup,
  InfoRow,
  RadioField
} from '../../components/Modal'
import type { ThingData } from '../../types/things'
import { ThingCategory } from '../../types/things'
import { VERSIONS } from '../../data'
import { compareFileNamesNaturally } from '../../utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportAction = 'add' | 'replace'

export interface ImportThingEntry {
  filePath: string
  thingData: ThingData
}

export interface ImportThingResult {
  entries: ImportThingEntry[]
  action: ImportAction
}

export interface ImportThingDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: ImportThingResult) => void
  canReplace?: boolean
  replaceCount?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCategoryLabel(category: string): string {
  switch (category) {
    case ThingCategory.ITEM:
      return 'Item'
    case ThingCategory.OUTFIT:
      return 'Outfit'
    case ThingCategory.EFFECT:
      return 'Effect'
    case ThingCategory.MISSILE:
      return 'Missile'
    default:
      return category
  }
}

function getVersionLabel(clientVersion: number): string {
  const ver = VERSIONS.find((v) => v.value === clientVersion)
  return ver ? `v${ver.valueStr}` : `v${clientVersion}`
}

// ---------------------------------------------------------------------------
// ImportThingDialog
// ---------------------------------------------------------------------------

export function ImportThingDialog({
  open,
  onClose,
  onConfirm,
  canReplace = false,
  replaceCount = 0
}: ImportThingDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [fileLabel, setFileLabel] = useState('')
  const [entries, setEntries] = useState<ImportThingEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<ImportAction>('add')

  const firstEntry = entries[0] ?? null
  const countMismatch = action === 'replace' && replaceCount > 0 && entries.length !== replaceCount

  // Reset state on open
  useEffect(() => {
    if (open) {
      setFileLabel('')
      setEntries([])
      setLoading(false)
      setError(null)
      setAction('add')
    }
  }, [open])

  const handleBrowse = useCallback(async () => {
    if (!window.api?.file) return
    const result = await window.api.file.showOpenDialog({
      title: 'Select OBD File',
      filters: [{ name: 'Object Builder Data', extensions: ['obd'] }],
      multiSelections: true
    })
    if (result.canceled || result.filePaths.length === 0) return

    const selectedPaths = [...result.filePaths].sort(compareFileNamesNaturally)
    setFileLabel(selectedPaths.length === 1 ? selectedPaths[0] : `${selectedPaths.length} file(s) selected`)
    setError(null)
    setLoading(true)

    try {
      const { workerService } = await import('../../workers/worker-service')
      const loadedEntries: ImportThingEntry[] = []

      for (const selectedPath of selectedPaths) {
        const buffer = await window.api.file.readBinary(selectedPath)
        const thingData = await workerService.decodeObd(new Uint8Array(buffer).buffer)
        loadedEntries.push({ filePath: selectedPath, thingData })
      }

      setEntries(loadedEntries)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read OBD file'
      setError(message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleConfirm = useCallback(() => {
    if (entries.length === 0 || countMismatch) return
    onConfirm({ entries, action })
    onClose()
  }, [entries, countMismatch, action, onConfirm, onClose])

  const isValid = entries.length > 0 && !loading && !countMismatch

  return (
    <Modal
      title={t('controls.importObject')}
      open={open}
      onClose={onClose}
      width={420}
      footer={
        <>
          <DialogButton
            label={t('labels.import')}
            onClick={handleConfirm}
            primary
            disabled={!isValid}
          />
          <DialogButton label={t('labels.cancel')} onClick={onClose} />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* File selection */}
        <BrowseField
          label="File"
          value={fileLabel}
          onBrowse={handleBrowse}
          placeholder="Select .obd file..."
        />

        {/* Preview */}
        <FieldGroup label={t('labels.preview')}>
          {loading && <p className="text-xs text-text-secondary">Loading...</p>}

          {error && <p className="text-xs text-error">{error}</p>}

          {!loading && !error && entries.length === 0 && (
            <p className="text-xs text-text-secondary">Select a file to preview.</p>
          )}

          {firstEntry && !loading && (
            <div className="flex flex-col gap-1">
              <InfoRow label="Files" value={entries.length} />
              <InfoRow
                label={t('labels.type')}
                value={getCategoryLabel(firstEntry.thingData.thing.category)}
              />
              <InfoRow
                label={t('labels.version')}
                value={getVersionLabel(firstEntry.thingData.clientVersion)}
              />
              <InfoRow
                label="OBD Version"
                value={
                  firstEntry.thingData.obdVersion === 0
                    ? 'v1.0'
                    : `v${(firstEntry.thingData.obdVersion / 100).toFixed(1)}`
                }
              />
              {firstEntry.thingData.thing.marketName && (
                <InfoRow label={t('labels.name')} value={firstEntry.thingData.thing.marketName} />
              )}
              {firstEntry.thingData.thing.name && !firstEntry.thingData.thing.marketName && (
                <InfoRow label={t('labels.name')} value={firstEntry.thingData.thing.name} />
              )}
              <InfoRow
                label={t('labels.sprites')}
                value={(() => {
                  let count = 0
                  firstEntry.thingData.sprites.forEach((arr) => {
                    count += arr.length
                  })
                  return count
                })()}
              />
            </div>
          )}
        </FieldGroup>

        {/* Import action */}
        <FieldGroup label="Action">
          <div className="flex gap-4">
            <RadioField
              label={t('labels.add')}
              name="import-action"
              value="add"
              checked={action === 'add'}
              onChange={(v) => setAction(v as ImportAction)}
            />
            <RadioField
              label={t('labels.replace')}
              name="import-action"
              value="replace"
              checked={action === 'replace'}
              onChange={(v) => setAction(v as ImportAction)}
              disabled={!canReplace}
            />
          </div>
          {countMismatch && (
            <p className="mt-2 text-xs text-error">
              {t('alert.invalidFileAmount', { 0: t('labels.objects').toLowerCase() })}
            </p>
          )}
        </FieldGroup>
      </div>
    </Modal>
  )
}
