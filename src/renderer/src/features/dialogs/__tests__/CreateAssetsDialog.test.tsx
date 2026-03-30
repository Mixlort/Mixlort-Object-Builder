/**
 * Tests for CreateAssetsDialog component.
 * Covers rendering, version selection, dimension selection,
 * feature flags, confirm/cancel behavior, and version-based defaults.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateAssetsDialog } from '../CreateAssetsDialog'
import { VERSIONS } from '../../../data/versions'
import { SPRITE_DIMENSIONS } from '../../../data/sprite-dimensions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(props: Partial<React.ComponentProps<typeof CreateAssetsDialog>> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn()
  }
  return render(<CreateAssetsDialog {...defaultProps} {...props} />)
}

function selectVersion(index: number) {
  // The version select is the first <select> rendered (inside "Version" FieldGroup)
  const selects = screen.getAllByRole('combobox')
  // The first select is the version dropdown
  fireEvent.change(selects[0], { target: { value: String(index) } })
}

function selectDimension(index: number) {
  const selects = screen.getAllByRole('combobox')
  // The second select is the dimension dropdown
  fireEvent.change(selects[1], { target: { value: String(index) } })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateAssetsDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render when open=false', () => {
    const { container } = render(
      <CreateAssetsDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    // Modal returns null when not open
    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog title', () => {
    renderDialog()
    // i18n key controls.createAssetFiles = "Create Asset Files"
    expect(screen.getByText('Create Asset Files')).toBeInTheDocument()
  })

  it('renders the version select with all versions', () => {
    renderDialog()
    const selects = screen.getAllByRole('combobox')
    // First select is version, should have "Select version..." + all VERSIONS
    const versionSelect = selects[0]
    const options = versionSelect.querySelectorAll('option')
    expect(options.length).toBe(VERSIONS.length + 1) // +1 for placeholder
    expect(options[0].textContent).toBe('Select version...')
  })

  it('renders the sprite dimension select', () => {
    renderDialog()
    const selects = screen.getAllByRole('combobox')
    const dimensionSelect = selects[1]
    const options = dimensionSelect.querySelectorAll('option')
    expect(options.length).toBe(SPRITE_DIMENSIONS.length)
    expect(options[0].textContent).toBe('32x32')
  })

  it('renders feature flags checkboxes', () => {
    renderDialog()
    expect(screen.getByText('Extended')).toBeInTheDocument()
    expect(screen.getByText('Transparency')).toBeInTheDocument()
    expect(screen.getByText('Improved Animations')).toBeInTheDocument()
    expect(screen.getByText('Frame Groups')).toBeInTheDocument()
  })

  it('confirm button is disabled when no version selected', () => {
    renderDialog()
    // i18n key labels.confirm = "Confirm"
    const confirmBtn = screen.getByText('Confirm')
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm button is enabled after selecting a version', () => {
    renderDialog()
    selectVersion(0) // Select the first version (7.10)
    const confirmBtn = screen.getByText('Confirm')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    // i18n key labels.cancel = "Cancel"
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resets version selection on cancel', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    // Select a version first
    selectVersion(5)
    const confirmBtn = screen.getByText('Confirm')
    expect(confirmBtn).not.toBeDisabled()
    // Cancel
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('confirm calls onConfirm with correct result structure', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    renderDialog({ onConfirm, onClose })

    // Select version 7.10 (index 0)
    selectVersion(0)
    // Select dimension 64x64 (index 1)
    selectDimension(1)

    fireEvent.click(screen.getByText('Confirm'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const result = onConfirm.mock.calls[0][0]
    expect(result.version).toEqual(VERSIONS[0])
    expect(result.spriteDimension).toEqual(SPRITE_DIMENSIONS[1])
    expect(result).toHaveProperty('extended')
    expect(result).toHaveProperty('transparency')
    expect(result).toHaveProperty('improvedAnimations')
    expect(result).toHaveProperty('frameGroups')
    // Also calls onClose after confirm
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('transparency defaults to enabled for old versions while other flags stay off', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    // Select version 7.10 (value=710, no forced flags)
    selectVersion(0)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.extended).toBe(false)
    expect(result.transparency).toBe(true)
    expect(result.improvedAnimations).toBe(false)
    expect(result.frameGroups).toBe(false)
  })

  it('extended is auto-enabled for version >= 960', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    // Find a version with value >= 960 in VERSIONS array
    const v960Index = VERSIONS.findIndex((v) => v.value >= 960)
    expect(v960Index).toBeGreaterThanOrEqual(0)

    selectVersion(v960Index)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.extended).toBe(true)
  })

  it('improvedAnimations is auto-enabled for version >= 1050', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    const v1050Index = VERSIONS.findIndex((v) => v.value >= 1050)
    expect(v1050Index).toBeGreaterThanOrEqual(0)

    selectVersion(v1050Index)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.extended).toBe(true)
    expect(result.improvedAnimations).toBe(true)
  })

  it('frameGroups is auto-enabled for version >= 1057', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    const v1057Index = VERSIONS.findIndex((v) => v.value >= 1057)
    expect(v1057Index).toBeGreaterThanOrEqual(0)

    selectVersion(v1057Index)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.extended).toBe(true)
    expect(result.improvedAnimations).toBe(true)
    expect(result.frameGroups).toBe(true)
  })

  it('uses default sprite dimension (32x32) when not changed', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })
    selectVersion(0)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.spriteDimension).toEqual(SPRITE_DIMENSIONS[0])
    expect(result.spriteDimension.value).toBe('32x32')
  })

  it('uses default transparency when provided', () => {
    const onConfirm = vi.fn()
    renderDialog({ onConfirm, defaultTransparency: true })

    selectVersion(0)
    fireEvent.click(screen.getByText('Confirm'))

    const result = onConfirm.mock.calls[0][0]
    expect(result.transparency).toBe(true)
  })
})
