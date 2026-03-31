/**
 * Export dialog for configuring thing/sprite export options.
 * Ported from legacy ExportWindow.mxml.
 *
 * Supports PNG, BMP, JPG, and OBD formats with format-specific options.
 * Returns export parameters on confirm.
 */

import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  DialogButton,
  FieldGroup,
  TextInputField,
  BrowseField,
  RadioField,
  CheckboxField,
  NumberInputField,
  SelectField
} from '../../components/Modal'
import { ImageFormat, OBDVersion } from '../../types/project'
import { OTFormat } from '../../types/project'
import { VERSIONS } from '../../data'
import type { Version } from '../../types/version'
import type { ThingExportFormat } from '../../types/project'
import { ThingCategory } from '../../types'
import { parseIdList } from '../../utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportDialogResult {
  fileName: string
  directory: string
  format: ThingExportFormat
  transparentBackground: boolean
  jpegQuality: number
  version: Version | null
  obdVersion: number
  idFilterEnabled: boolean
  idFilterInput: string
  useOriginalIdsInFileNames: boolean
}

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (result: ExportDialogResult) => void
  enableObdFormat?: boolean
  currentVersion?: Version | null
  currentCategory?: import('../../types').ThingCategory
  defaultFormat?: ThingExportFormat
  defaultFileName?: string
}

// ---------------------------------------------------------------------------
// OBD version options
// ---------------------------------------------------------------------------

const OBD_VERSION_OPTIONS = [
  { value: String(OBDVersion.VERSION_2), label: 'OBD v2.0' },
  { value: String(OBDVersion.VERSION_3), label: 'OBD v3.0' }
]

function supportsCategoryIdFilter(category: import('../../types').ThingCategory): boolean {
  return category === ThingCategory.EFFECT || category === ThingCategory.MISSILE
}

function getCategoryFilterLabel(category: import('../../types').ThingCategory): string {
  return category === ThingCategory.MISSILE ? 'missiles' : 'effects'
}

// ---------------------------------------------------------------------------
// ExportDialog
// ---------------------------------------------------------------------------

export function ExportDialog({
  open,
  onClose,
  onConfirm,
  enableObdFormat = true,
  currentVersion = null,
  currentCategory = ThingCategory.EFFECT,
  defaultFormat = ImageFormat.PNG,
  defaultFileName = ''
}: ExportDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [fileName, setFileName] = useState(defaultFileName)
  const [directory, setDirectory] = useState('')
  const [format, setFormat] = useState<ThingExportFormat>(defaultFormat)
  const [transparentBackground, setTransparentBackground] = useState(false)
  const [jpegQuality, setJpegQuality] = useState(100)
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(currentVersion)
  const [obdVersion, setObdVersion] = useState(OBDVersion.VERSION_3)
  const [idFilterEnabled, setIdFilterEnabled] = useState(false)
  const [idFilterInput, setIdFilterInput] = useState('')
  const [useOriginalIdsInFileNames, setUseOriginalIdsInFileNames] = useState(false)

  // Reset on open (render-time state adjustment)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setFileName(defaultFileName)
    setFormat(defaultFormat)
    setSelectedVersion(currentVersion)
    setJpegQuality(100)
    setTransparentBackground(false)
    setObdVersion(OBDVersion.VERSION_3)
    setIdFilterEnabled(false)
    setIdFilterInput('')
    setUseOriginalIdsInFileNames(false)
  }
  if (open !== prevOpen) {
    setPrevOpen(open)
  }

  const handleBrowseDirectory = useCallback(async () => {
    if (!window.api?.file) return
    const result = await window.api.file.showDirectoryDialog({ title: 'Select Output Folder' })
    if (!result.canceled && result.directoryPath) {
      setDirectory(result.directoryPath)
    }
  }, [])

  const handleFormatChange = useCallback((newFormat: string) => {
    setFormat(newFormat as ThingExportFormat)
  }, [])

  const handleVersionChange = useCallback((versionStr: string) => {
    const ver = VERSIONS.find((v) => v.valueStr === versionStr) ?? null
    setSelectedVersion(ver)
  }, [])

  const showCategoryIdFilter = supportsCategoryIdFilter(currentCategory)
  const categoryFilterLabel = getCategoryFilterLabel(currentCategory)

  const idFilterError = (() => {
    if (!showCategoryIdFilter || !idFilterEnabled || idFilterInput.trim().length === 0) {
      return null
    }

    try {
      parseIdList(idFilterInput)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })()

  const handleConfirm = useCallback(() => {
    onConfirm({
      fileName,
      directory,
      format,
      transparentBackground,
      jpegQuality,
      version: format === OTFormat.OBD ? selectedVersion : null,
      obdVersion: format === OTFormat.OBD ? obdVersion : 0,
      idFilterEnabled: showCategoryIdFilter && idFilterEnabled,
      idFilterInput,
      useOriginalIdsInFileNames: showCategoryIdFilter && useOriginalIdsInFileNames
    })
    onClose()
  }, [
    fileName,
    directory,
    format,
    transparentBackground,
    jpegQuality,
    selectedVersion,
    obdVersion,
    showCategoryIdFilter,
    idFilterEnabled,
    idFilterInput,
    useOriginalIdsInFileNames,
    onConfirm,
    onClose
  ])

  const isValid =
    directory.length > 0 &&
    (format !== OTFormat.OBD || selectedVersion !== null) &&
    !idFilterError

  const versionOptions = VERSIONS.map((v) => ({ value: v.valueStr, label: `v${v.valueStr}` }))

  return (
    <Modal
      title={t('labels.export')}
      open={open}
      onClose={onClose}
      width={450}
      footer={
        <>
          <DialogButton
            label={t('labels.export')}
            onClick={handleConfirm}
            primary
            disabled={!isValid}
          />
          <DialogButton label={t('labels.cancel')} onClick={onClose} />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* File name */}
        <TextInputField
          label={t('labels.name')}
          value={fileName}
          onChange={setFileName}
          placeholder="Enter file name..."
        />

        {/* Output folder */}
        <BrowseField
          label={t('controls.selectFolder')}
          value={directory}
          onBrowse={handleBrowseDirectory}
          placeholder="Select output folder..."
        />

        {/* Format selection */}
        <FieldGroup label={t('labels.format')}>
          <div className="flex gap-4">
            <RadioField
              label="PNG"
              name="export-format"
              value={ImageFormat.PNG}
              checked={format === ImageFormat.PNG}
              onChange={handleFormatChange}
            />
            <RadioField
              label="BMP"
              name="export-format"
              value={ImageFormat.BMP}
              checked={format === ImageFormat.BMP}
              onChange={handleFormatChange}
            />
            <RadioField
              label="JPG"
              name="export-format"
              value={ImageFormat.JPG}
              checked={format === ImageFormat.JPG}
              onChange={handleFormatChange}
            />
            {enableObdFormat && (
              <RadioField
                label="OBD"
                name="export-format"
                value={OTFormat.OBD}
                checked={format === OTFormat.OBD}
                onChange={handleFormatChange}
              />
            )}
          </div>
        </FieldGroup>

        {/* Format-specific options */}
        <FieldGroup label="Options">
          {/* PNG options */}
          {format === ImageFormat.PNG && (
            <CheckboxField
              label={t('labels.transparentBackground')}
              checked={transparentBackground}
              onChange={setTransparentBackground}
            />
          )}

          {/* BMP options */}
          {format === ImageFormat.BMP && (
            <p className="text-xs text-text-secondary">No additional options for BMP format.</p>
          )}

          {/* JPG options */}
          {format === ImageFormat.JPG && (
            <div className="flex items-center gap-3">
              <NumberInputField
                label={t('labels.quality')}
                value={jpegQuality}
                onChange={setJpegQuality}
                min={10}
                max={100}
                step={5}
              />
              <span className="text-xs text-text-secondary">{jpegQuality}%</span>
            </div>
          )}

          {/* OBD options */}
          {format === OTFormat.OBD && (
            <div className="flex flex-col gap-2">
              <SelectField
                label={t('labels.version')}
                value={selectedVersion?.valueStr ?? ''}
                onChange={handleVersionChange}
                options={[{ value: '', label: 'Select version...' }, ...versionOptions]}
              />
              <SelectField
                label="OBD Version"
                value={String(obdVersion)}
                onChange={(v) => setObdVersion(Number(v) as typeof obdVersion)}
                options={OBD_VERSION_OPTIONS}
              />
            </div>
          )}
        </FieldGroup>

        {showCategoryIdFilter && (
          <FieldGroup label={`${categoryFilterLabel[0].toUpperCase()}${categoryFilterLabel.slice(1)} Filter`}>
            <div className="flex flex-col gap-2">
              <CheckboxField
                label={`Exportar IDs específicos (${categoryFilterLabel})`}
                checked={idFilterEnabled}
                onChange={setIdFilterEnabled}
              />

              <span className="text-xs text-text-secondary">Lista de IDs</span>

              <textarea
                className="min-h-[78px] w-full resize-y rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-38"
                value={idFilterInput}
                onChange={(event) => setIdFilterInput(event.target.value)}
                placeholder="Ex: 1, 5, 10-15"
                disabled={!idFilterEnabled}
              />

              <CheckboxField
                label="Usar IDs originais no nome dos arquivos"
                checked={useOriginalIdsInFileNames}
                onChange={setUseOriginalIdsInFileNames}
                disabled={!idFilterEnabled}
              />

              {idFilterEnabled && idFilterError && <p className="text-xs text-error">{idFilterError}</p>}
            </div>
          </FieldGroup>
        )}
      </div>
    </Modal>
  )
}
