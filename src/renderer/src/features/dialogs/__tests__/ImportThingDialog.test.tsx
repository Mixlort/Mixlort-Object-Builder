/**
 * Tests for ImportThingDialog component.
 * Covers rendering, file browsing, preview, action radios,
 * canReplace prop, and confirm/cancel behavior.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportThingDialog } from '../ImportThingDialog'
import { ThingCategory, createThingData, createThingType } from '../../../types'

vi.mock('../../../workers/worker-service', () => ({
  workerService: {
    decodeObd: vi.fn(async () => {
      const thing = createThingType()
      thing.id = 1
      thing.category = ThingCategory.EFFECT
      return createThingData(0, 1098, thing, new Map())
    })
  }
}))

// ---------------------------------------------------------------------------
// Mock window.api and worker-service (dynamic import in component)
// ---------------------------------------------------------------------------

const mockShowOpenDialog = vi.fn()
const mockReadBinary = vi.fn()

beforeEach(() => {
  vi.restoreAllMocks()

  Object.defineProperty(window, 'api', {
    value: {
      file: {
        showOpenDialog: mockShowOpenDialog.mockResolvedValue({
          canceled: true,
          filePaths: []
        }),
        readBinary: mockReadBinary.mockResolvedValue(new ArrayBuffer(0))
      }
    },
    writable: true,
    configurable: true
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(props: Partial<React.ComponentProps<typeof ImportThingDialog>> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn()
  }
  return render(<ImportThingDialog {...defaultProps} {...props} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportThingDialog', () => {
  it('does not render when open=false', () => {
    const { container } = render(
      <ImportThingDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog title "Import Object"', () => {
    renderDialog()
    // i18n key controls.importObject = "Import Object"
    expect(screen.getByText('Import Object')).toBeInTheDocument()
  })

  it('renders browse field for file selection', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('Select .obd file...')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
  })

  it('renders action radio buttons', () => {
    renderDialog()
    // i18n keys: labels.add = "Add", labels.replace = "Replace"
    expect(screen.getByRole('radio', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Replace' })).toBeInTheDocument()
  })

  it('shows "Select a file to preview." text initially', () => {
    renderDialog()
    expect(screen.getByText('Select a file to preview.')).toBeInTheDocument()
  })

  it('action defaults to "add"', () => {
    renderDialog()
    const addRadio = screen.getByRole('radio', { name: 'Add' }) as HTMLInputElement
    const replaceRadio = screen.getByRole('radio', { name: 'Replace' }) as HTMLInputElement
    expect(addRadio).toBeChecked()
    expect(replaceRadio).not.toBeChecked()
  })

  it('replace radio is disabled when canReplace=false (default)', () => {
    renderDialog()
    // canReplace defaults to false
    const replaceRadio = screen.getByRole('radio', { name: 'Replace' }) as HTMLInputElement
    expect(replaceRadio).toBeDisabled()
  })

  it('replace radio is enabled when canReplace=true', () => {
    renderDialog({ canReplace: true })
    const replaceRadio = screen.getByRole('radio', { name: 'Replace' }) as HTMLInputElement
    expect(replaceRadio).not.toBeDisabled()
  })

  it('import button is disabled when no file loaded', () => {
    renderDialog()
    // i18n key labels.import = "Import"
    const importBtn = screen.getByText('Import')
    expect(importBtn).toBeDisabled()
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    // i18n key labels.cancel = "Cancel"
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders preview section', () => {
    renderDialog()
    // i18n key labels.preview = "Preview"
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('renders action section', () => {
    renderDialog()
    expect(screen.getByText('Action')).toBeInTheDocument()
  })

  it('browse dialog allows selecting multiple obd files', async () => {
    renderDialog()

    mockShowOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: []
    })

    fireEvent.click(screen.getByText('Browse'))

    await vi.waitFor(() => {
      expect(mockShowOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({ multiSelections: true })
      )
    })
  })

  it('shows count mismatch error when replace file count differs from selected objects', async () => {
    renderDialog({ canReplace: true, replaceCount: 2 })

    mockShowOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/tmp/1.obd']
    })

    fireEvent.click(screen.getByText('Browse'))

    const replaceRadio = screen.getByRole('radio', { name: 'Replace' })
    fireEvent.click(replaceRadio)

    await vi.waitFor(() => {
      expect(
        screen.getByText('The number of selected objects does not equal the amount of files.')
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Import')).toBeDisabled()
  })
})
