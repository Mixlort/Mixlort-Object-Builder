/**
 * Tests for ExportDialog component.
 * Covers rendering, format selection, format-specific options,
 * validation, OBD format controls, and confirm behavior.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportDialog } from '../ExportDialog'
import { ThingCategory } from '../../../types'
import { ImageFormat } from '../../../types/project'

// ---------------------------------------------------------------------------
// Mock window.api
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks()
  // Mock window.api.file.showDirectoryDialog
  Object.defineProperty(window, 'api', {
    value: {
      file: {
        showDirectoryDialog: vi.fn().mockResolvedValue({
          canceled: false,
          directoryPath: '/mock/output/dir'
        })
      }
    },
    writable: true,
    configurable: true
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(props: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    currentCategory: ThingCategory.EFFECT
  }
  return render(<ExportDialog {...defaultProps} {...props} />)
}

function getFormatRadio(label: string): HTMLInputElement {
  return screen.getByRole('radio', { name: label }) as HTMLInputElement
}

function selectFormat(label: string) {
  fireEvent.click(getFormatRadio(label))
}

function setFileName(value: string) {
  const input = screen.getByPlaceholderText('Enter file name...')
  fireEvent.change(input, { target: { value } })
}

function setIdList(value: string) {
  const input = screen.getByPlaceholderText('Ex: 1, 5, 10-15')
  fireEvent.change(input, { target: { value } })
}

function toggleIdFilter(categoryLabel = 'effects') {
  fireEvent.click(screen.getByLabelText(`Exportar IDs específicos (${categoryLabel})`))
}

function toggleOriginalIdsInFileNames() {
  fireEvent.click(screen.getByLabelText('Usar IDs originais no nome dos arquivos'))
}

async function browseDirectory() {
  const browseBtn = screen.getByText('Browse')
  fireEvent.click(browseBtn)
  // Wait for async operation
  await vi.waitFor(() => {
    expect(screen.getByDisplayValue('/mock/output/dir')).toBeInTheDocument()
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportDialog', () => {
  it('does not render when open=false', () => {
    const { container } = render(
      <ExportDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog title "Export"', () => {
    renderDialog()
    // i18n key labels.export = "Export"
    // The title is rendered and also used as the confirm button label
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Export')
  })

  it('renders file name input', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('Enter file name...')).toBeInTheDocument()
  })

  it('renders directory browse field', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('Select output folder...')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
  })

  it('renders format radio buttons (PNG, BMP, JPG, OBD)', () => {
    renderDialog()
    expect(getFormatRadio('PNG')).toBeInTheDocument()
    expect(getFormatRadio('BMP')).toBeInTheDocument()
    expect(getFormatRadio('JPG')).toBeInTheDocument()
    expect(getFormatRadio('OBD')).toBeInTheDocument()
  })

  it('renders effects filter controls', () => {
    renderDialog()
    expect(screen.getByLabelText('Exportar IDs específicos (effects)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex: 1, 5, 10-15')).toBeDisabled()
    expect(screen.getByLabelText('Usar IDs originais no nome dos arquivos')).toBeDisabled()
  })

  it('renders missiles filter controls when current tab is missiles', () => {
    renderDialog({ currentCategory: ThingCategory.MISSILE })
    expect(screen.getByLabelText('Exportar IDs específicos (missiles)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Exportar IDs específicos (effects)')).not.toBeInTheDocument()
  })

  it('hides category filter for items', () => {
    renderDialog({ currentCategory: ThingCategory.ITEM })
    expect(screen.queryByLabelText(/Exportar IDs específicos/)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Ex: 1, 5, 10-15')).not.toBeInTheDocument()
  })

  it('PNG is selected by default', () => {
    renderDialog()
    expect(getFormatRadio('PNG')).toBeChecked()
  })

  it('PNG format shows transparent background checkbox', () => {
    renderDialog()
    // Default format is PNG
    // i18n key labels.transparentBackground = "Transparent background"
    expect(screen.getByText('Transparent background')).toBeInTheDocument()
  })

  it('JPG format shows quality input', () => {
    renderDialog()
    selectFormat('JPG')
    // i18n key labels.quality = "Quality"
    expect(screen.getByText('Quality')).toBeInTheDocument()
    // Quality percentage label
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('BMP format shows "No additional options" text', () => {
    renderDialog()
    selectFormat('BMP')
    expect(screen.getByText('No additional options for BMP format.')).toBeInTheDocument()
  })

  it('OBD format shows version and OBD version selects', () => {
    renderDialog()
    selectFormat('OBD')
    // There should be selects for version and OBD version
    const selects = screen.getAllByRole('combobox')
    // At least 2 selects: one for version, one for OBD version
    expect(selects.length).toBeGreaterThanOrEqual(2)
    // Check for OBD version options
    expect(screen.getByText('OBD v2.0')).toBeInTheDocument()
    expect(screen.getByText('OBD v3.0')).toBeInTheDocument()
  })

  it('format switching shows correct options', () => {
    renderDialog()

    // PNG -> transparent background
    expect(screen.getByText('Transparent background')).toBeInTheDocument()

    // Switch to BMP -> no additional options
    selectFormat('BMP')
    expect(screen.getByText('No additional options for BMP format.')).toBeInTheDocument()
    expect(screen.queryByText('Transparent background')).not.toBeInTheDocument()

    // Switch to JPG -> quality
    selectFormat('JPG')
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.queryByText('No additional options for BMP format.')).not.toBeInTheDocument()

    // Switch back to PNG
    selectFormat('PNG')
    expect(screen.getByText('Transparent background')).toBeInTheDocument()
    expect(screen.queryByText('Quality')).not.toBeInTheDocument()
  })

  it('enableObdFormat=false hides OBD radio', () => {
    renderDialog({ enableObdFormat: false })
    expect(screen.queryByRole('radio', { name: 'OBD' })).not.toBeInTheDocument()
    // Other formats still present
    expect(getFormatRadio('PNG')).toBeInTheDocument()
    expect(getFormatRadio('BMP')).toBeInTheDocument()
    expect(getFormatRadio('JPG')).toBeInTheDocument()
  })

  it('export button stays disabled when directory is empty even if name is optional', () => {
    renderDialog()
    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    expect(exportBtn).toBeDisabled()
  })

  it('export button is disabled when directory is empty', () => {
    renderDialog()
    setFileName('test-file')
    // Directory is still empty
    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    expect(exportBtn).toBeDisabled()
  })

  it('export button is enabled with empty filename when directory is set', async () => {
    renderDialog()
    await browseDirectory()

    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    expect(exportBtn).not.toBeDisabled()
  })

  it('export button is enabled when filename and directory are set', async () => {
    renderDialog()
    setFileName('test-file')
    await browseDirectory()

    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    expect(exportBtn).not.toBeDisabled()
  })

  it('confirm calls onConfirm with correct result for PNG format', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    renderDialog({ onConfirm, onClose })

    setFileName('my-export')
    await browseDirectory()

    // Click the export/confirm button
    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    fireEvent.click(exportBtn)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const result = onConfirm.mock.calls[0][0]
    expect(result.fileName).toBe('my-export')
    expect(result.directory).toBe('/mock/output/dir')
    expect(result.format).toBe(ImageFormat.PNG)
    expect(result.transparentBackground).toBe(false)
    expect(result.jpegQuality).toBe(100)
    expect(result.version).toBeNull() // null for non-OBD
    expect(result.obdVersion).toBe(0) // 0 for non-OBD
    expect(result.idFilterEnabled).toBe(false)
    expect(result.idFilterInput).toBe('')
    expect(result.useOriginalIdsInFileNames).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('enables list field when effects filter is checked', () => {
    renderDialog()
    toggleIdFilter()
    expect(screen.getByPlaceholderText('Ex: 1, 5, 10-15')).not.toBeDisabled()
    expect(screen.getByLabelText('Usar IDs originais no nome dos arquivos')).not.toBeDisabled()
  })

  it('shows validation error and disables export for invalid token', async () => {
    renderDialog()
    setFileName('test-file')
    await browseDirectory()

    toggleIdFilter()
    setIdList('1,abc,3')

    expect(screen.getByText('Invalid token "abc"')).toBeInTheDocument()
    const exportBtn = screen.getAllByText('Export')[1]
    expect(exportBtn).toBeDisabled()
  })

  it('accepts mixed separators and ranges for effects filter', async () => {
    renderDialog()
    setFileName('test-file')
    await browseDirectory()

    toggleIdFilter()
    setIdList('1, 2 3\n4-6')

    expect(screen.queryByText(/Invalid token/)).not.toBeInTheDocument()
    const exportBtn = screen.getAllByText('Export')[1]
    expect(exportBtn).not.toBeDisabled()
  })

  it('confirm includes effects filter fields', async () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    setFileName('test-file')
    await browseDirectory()
    toggleIdFilter()
    setIdList('1, 5, 10-12')
    toggleOriginalIdsInFileNames()

    const exportBtn = screen.getAllByText('Export')[1]
    fireEvent.click(exportBtn)

    const result = onConfirm.mock.calls[0][0]
    expect(result.idFilterEnabled).toBe(true)
    expect(result.idFilterInput).toBe('1, 5, 10-12')
    expect(result.useOriginalIdsInFileNames).toBe(true)
  })

  it('confirm with JPG format includes jpeg quality', async () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    setFileName('jpg-export')
    await browseDirectory()
    selectFormat('JPG')

    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    fireEvent.click(exportBtn)

    const result = onConfirm.mock.calls[0][0]
    expect(result.format).toBe(ImageFormat.JPG)
    expect(result.jpegQuality).toBe(100) // default value
  })

  it('uses defaultFileName prop', () => {
    renderDialog({ defaultFileName: 'preset-name' })
    expect(screen.getByDisplayValue('preset-name')).toBeInTheDocument()
  })

  it('uses defaultFormat prop', () => {
    renderDialog({ defaultFormat: ImageFormat.BMP })
    expect(getFormatRadio('BMP')).toBeChecked()
    expect(getFormatRadio('PNG')).not.toBeChecked()
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    // i18n key labels.cancel = "Cancel"
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('OBD format requires version selection for validation', async () => {
    renderDialog()
    setFileName('obd-export')
    await browseDirectory()
    selectFormat('OBD')

    // Export should be disabled because no version is selected for OBD
    const exportButtons = screen.getAllByText('Export')
    const exportBtn = exportButtons[exportButtons.length - 1]
    expect(exportBtn).toBeDisabled()
  })
})
