/**
 * Tests for the main application layout components:
 * SplitPane, Toolbar, StatusBar, LogPanel, and App composition.
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from '../../App'
import { resetAppStore, useAppStore } from '../../stores'
import { createClientInfo } from '../../types'
import { SplitPane } from '../SplitPane'
import { Toolbar } from '../Toolbar'
import { StatusBar } from '../StatusBar'
import { LogPanel } from '../LogPanel'

beforeEach(() => {
  resetAppStore()
})

// ===========================================================================
// SplitPane
// ===========================================================================

describe('SplitPane', () => {
  it('renders all three panels', () => {
    render(
      <SplitPane
        left={<div>Left Content</div>}
        center={<div>Center Content</div>}
        right={<div>Right Content</div>}
        leftWidth={200}
        rightWidth={200}
      />
    )
    expect(screen.getByText('Left Content')).toBeInTheDocument()
    expect(screen.getByText('Center Content')).toBeInTheDocument()
    expect(screen.getByText('Right Content')).toBeInTheDocument()
  })

  it('hides left panel when showLeft is false', () => {
    render(
      <SplitPane
        left={<div>Left Content</div>}
        center={<div>Center Content</div>}
        right={<div>Right Content</div>}
        leftWidth={200}
        rightWidth={200}
        showLeft={false}
      />
    )
    expect(screen.queryByText('Left Content')).not.toBeInTheDocument()
    expect(screen.getByText('Center Content')).toBeInTheDocument()
    expect(screen.getByText('Right Content')).toBeInTheDocument()
  })

  it('hides right panel when showRight is false', () => {
    render(
      <SplitPane
        left={<div>Left Content</div>}
        center={<div>Center Content</div>}
        right={<div>Right Content</div>}
        leftWidth={200}
        rightWidth={200}
        showRight={false}
      />
    )
    expect(screen.getByText('Left Content')).toBeInTheDocument()
    expect(screen.getByText('Center Content')).toBeInTheDocument()
    expect(screen.queryByText('Right Content')).not.toBeInTheDocument()
  })

  it('hides both side panels', () => {
    render(
      <SplitPane
        left={<div>Left Content</div>}
        center={<div>Center Content</div>}
        right={<div>Right Content</div>}
        leftWidth={200}
        rightWidth={200}
        showLeft={false}
        showRight={false}
      />
    )
    expect(screen.queryByText('Left Content')).not.toBeInTheDocument()
    expect(screen.getByText('Center Content')).toBeInTheDocument()
    expect(screen.queryByText('Right Content')).not.toBeInTheDocument()
  })

  it('applies configured widths to panels', () => {
    render(
      <SplitPane
        left={<div>Left</div>}
        center={<div>Center</div>}
        right={<div>Right</div>}
        leftWidth={250}
        rightWidth={180}
      />
    )
    const leftPanel = screen.getByTestId('split-left')
    const rightPanel = screen.getByTestId('split-right')
    expect(leftPanel.style.width).toBe('250px')
    expect(rightPanel.style.width).toBe('180px')
  })

  it('renders two drag handles when both panels visible', () => {
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
      />
    )
    expect(screen.getByTestId('split-handle-left')).toBeInTheDocument()
    expect(screen.getByTestId('split-handle-right')).toBeInTheDocument()
  })

  it('hides drag handles when panels are hidden', () => {
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
        showLeft={false}
        showRight={false}
      />
    )
    expect(screen.queryByTestId('split-handle-left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('split-handle-right')).not.toBeInTheDocument()
  })

  it('calls onLeftWidthChange on left handle drag', () => {
    const onLeftWidthChange = vi.fn()
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
        onLeftWidthChange={onLeftWidthChange}
      />
    )
    const handle = screen.getByTestId('split-handle-left')
    fireEvent.mouseDown(handle, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 250 })
    fireEvent.mouseUp(document)
    expect(onLeftWidthChange).toHaveBeenCalledWith(250)
  })

  it('calls onRightWidthChange on right handle drag', () => {
    const onRightWidthChange = vi.fn()
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
        onRightWidthChange={onRightWidthChange}
      />
    )
    const handle = screen.getByTestId('split-handle-right')
    fireEvent.mouseDown(handle, { clientX: 600 })
    fireEvent.mouseMove(document, { clientX: 550 })
    fireEvent.mouseUp(document)
    expect(onRightWidthChange).toHaveBeenCalledWith(250)
  })

  it('clamps left width to min/max', () => {
    const onLeftWidthChange = vi.fn()
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
        leftMinWidth={150}
        leftMaxWidth={300}
        onLeftWidthChange={onLeftWidthChange}
      />
    )
    const handle = screen.getByTestId('split-handle-left')

    // Drag below min
    fireEvent.mouseDown(handle, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 100 })
    expect(onLeftWidthChange).toHaveBeenCalledWith(150)
    fireEvent.mouseUp(document)

    // Drag above max
    fireEvent.mouseDown(handle, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 400 })
    expect(onLeftWidthChange).toHaveBeenCalledWith(300)
    fireEvent.mouseUp(document)
  })

  it('clamps right width to min/max', () => {
    const onRightWidthChange = vi.fn()
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
        rightMinWidth={150}
        rightMaxWidth={300}
        onRightWidthChange={onRightWidthChange}
      />
    )
    const handle = screen.getByTestId('split-handle-right')

    // Drag right (shrink panel) - should clamp to min
    fireEvent.mouseDown(handle, { clientX: 600 })
    fireEvent.mouseMove(document, { clientX: 700 })
    expect(onRightWidthChange).toHaveBeenCalledWith(150)
    fireEvent.mouseUp(document)

    // Drag left (grow panel) - should clamp to max
    fireEvent.mouseDown(handle, { clientX: 600 })
    fireEvent.mouseMove(document, { clientX: 400 })
    expect(onRightWidthChange).toHaveBeenCalledWith(300)
    fireEvent.mouseUp(document)
  })

  it('restores cursor after drag ends', () => {
    render(
      <SplitPane
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        leftWidth={200}
        rightWidth={200}
      />
    )
    const handle = screen.getByTestId('split-handle-left')
    fireEvent.mouseDown(handle, { clientX: 200 })
    expect(document.body.style.cursor).toBe('col-resize')
    fireEvent.mouseUp(document)
    expect(document.body.style.cursor).toBe('')
  })
})

// ===========================================================================
// Toolbar
// ===========================================================================

describe('Toolbar', () => {
  it('renders all toolbar buttons', () => {
    render(<Toolbar />)
    expect(screen.getByTitle(/New/)).toBeInTheDocument()
    expect(screen.getByTitle(/Open/)).toBeInTheDocument()
    expect(screen.getByTitle('Compile (Ctrl+S)')).toBeInTheDocument()
    expect(screen.getByTitle(/Compile As/)).toBeInTheDocument()
    expect(screen.getByTitle('Object Viewer')).toBeInTheDocument()
    expect(screen.getByTitle('Sprites')).toBeInTheDocument()
    expect(screen.getByTitle('Animation Editor')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-toggle-editor-panel')).toBeInTheDocument()
    expect(screen.getByTestId('toolbar-toggle-sprite-panel')).toBeInTheDocument()
    expect(screen.getByTitle(/Log Window/)).toBeInTheDocument()
  })

  it('disables compile when no project is loaded', () => {
    render(<Toolbar />)
    expect(screen.getByTitle('Compile (Ctrl+S)')).toBeDisabled()
  })

  it('disables compile as when no project loaded', () => {
    render(<Toolbar />)
    expect(screen.getByTitle(/Compile As/)).toBeDisabled()
  })

  it('enables compile as when project is loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      clientInfo
    })
    render(<Toolbar />)
    expect(screen.getByTitle(/Compile As/)).not.toBeDisabled()
  })

  it('enables compile when project changed and not temporary', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      fileName: 'test.dat',
      clientInfo
    })
    useAppStore.getState().setProjectChanged(true)
    render(<Toolbar />)
    expect(screen.getByTitle('Compile (Ctrl+S)')).not.toBeDisabled()
  })

  it('keeps compile enabled when temporary and loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      isTemporary: true,
      clientInfo
    })
    useAppStore.getState().setProjectChanged(true)
    render(<Toolbar />)
    expect(screen.getByTitle('Compile (Ctrl+S)')).not.toBeDisabled()
  })

  it('dispatches action on button click', () => {
    const onAction = vi.fn()
    render(<Toolbar onAction={onAction} />)
    fireEvent.click(screen.getByTitle(/New/))
    expect(onAction).toHaveBeenCalledWith('fileNew')
  })

  it('dispatches correct action for each button', () => {
    const onAction = vi.fn()
    render(<Toolbar onAction={onAction} />)

    fireEvent.click(screen.getByTitle(/New/))
    expect(onAction).toHaveBeenLastCalledWith('fileNew')

    fireEvent.click(screen.getByTitle(/Open/))
    expect(onAction).toHaveBeenLastCalledWith('fileOpen')

    fireEvent.click(screen.getByTitle('Object Viewer'))
    expect(onAction).toHaveBeenLastCalledWith('toolsObjectViewer')

    fireEvent.click(screen.getByTitle('Sprites'))
    expect(onAction).toHaveBeenLastCalledWith('toolsSlicer')

    fireEvent.click(screen.getByTitle('Animation Editor'))
    expect(onAction).toHaveBeenLastCalledWith('toolsAnimationEditor')

    fireEvent.click(screen.getByTitle(/Log Window/))
    expect(onAction).toHaveBeenLastCalledWith('windowLog')
  })

  it('does not dispatch disabled button actions', () => {
    const onAction = vi.fn()
    render(<Toolbar onAction={onAction} />)
    fireEvent.click(screen.getByTitle('Compile (Ctrl+S)'))
    expect(onAction).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// StatusBar
// ===========================================================================

describe('StatusBar', () => {
  it('shows "No project loaded" when no project', () => {
    render(<StatusBar />)
    expect(screen.getByText('No project loaded')).toBeInTheDocument()
  })

  it('shows project filename when loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    clientInfo.clientVersionStr = '10.56'
    clientInfo.minItemId = 100
    clientInfo.maxItemId = 200
    clientInfo.minOutfitId = 1
    clientInfo.maxOutfitId = 50
    clientInfo.minEffectId = 1
    clientInfo.maxEffectId = 30
    clientInfo.minMissileId = 1
    clientInfo.maxMissileId = 20
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      fileName: 'test.dat',
      clientInfo
    })
    render(<StatusBar />)
    expect(screen.getByText('test.dat')).toBeInTheDocument()
  })

  it('shows version info when loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    clientInfo.clientVersionStr = '10.56'
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<StatusBar />)
    expect(screen.getByText('v10.56')).toBeInTheDocument()
  })

  it('shows category counts when loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    clientInfo.minItemId = 100
    clientInfo.maxItemId = 199
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<StatusBar />)
    expect(screen.getByText('Items: 100')).toBeInTheDocument()
  })

  it('shows sprite count when loaded', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    useAppStore.getState().setSpriteCount(5000)
    render(<StatusBar />)
    expect(screen.getByText('Sprites: 5000')).toBeInTheDocument()
  })

  it('shows unsaved indicator when project changed', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({
      loaded: true,
      fileName: 'test.dat',
      clientInfo
    })
    useAppStore.getState().setProjectChanged(true)
    render(<StatusBar />)
    expect(screen.getByText('test.dat')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows current category', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<StatusBar />)
    expect(screen.getByText('item')).toBeInTheDocument()
  })

  it('shows "Untitled" when no filename', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<StatusBar />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })
})

// ===========================================================================
// LogPanel
// ===========================================================================

describe('LogPanel', () => {
  it('shows "No log entries" when empty', () => {
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('shows log header', () => {
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText('Log Window')).toBeInTheDocument()
  })

  it('shows log entries', () => {
    useAppStore.getState().addLog('info', 'Test message')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText(/Test message/)).toBeInTheDocument()
  })

  it('shows warning entries with level indicator', () => {
    useAppStore.getState().addLog('warning', 'Warning text')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText(/Warning text/)).toBeInTheDocument()
    // Component renders entry.level without brackets
    expect(screen.getByText('warning')).toBeInTheDocument()
  })

  it('shows error entries with level indicator', () => {
    useAppStore.getState().addLog('error', 'Error text')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText(/Error text/)).toBeInTheDocument()
    // Component renders entry.level without brackets
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('does not show level indicator for info entries', () => {
    useAppStore.getState().addLog('info', 'Info text')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.queryByText('[INFO]')).not.toBeInTheDocument()
  })

  it('clears logs on Clear button click', () => {
    useAppStore.getState().addLog('info', 'Test message')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText(/Test message/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('hides panel on close button click', () => {
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(useAppStore.getState().ui.showLogPanel).toBe(false)
  })

  it('shows multiple log entries', () => {
    useAppStore.getState().addLog('info', 'First message')
    useAppStore.getState().addLog('warning', 'Second message')
    useAppStore.getState().addLog('error', 'Third message')
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByText(/First message/)).toBeInTheDocument()
    expect(screen.getByText(/Second message/)).toBeInTheDocument()
    expect(screen.getByText(/Third message/)).toBeInTheDocument()
  })

  it('renders drag handle for vertical resize', () => {
    render(<LogPanel height={150} onHeightChange={() => {}} />)
    expect(screen.getByTestId('log-drag-handle')).toBeInTheDocument()
  })

  it('calls onHeightChange on vertical drag', () => {
    const onHeightChange = vi.fn()
    render(<LogPanel height={150} onHeightChange={onHeightChange} />)
    const handle = screen.getByTestId('log-drag-handle')
    fireEvent.mouseDown(handle, { clientY: 400 })
    fireEvent.mouseMove(document, { clientY: 350 })
    fireEvent.mouseUp(document)
    expect(onHeightChange).toHaveBeenCalledWith(200)
  })

  it('clamps height to min/max on drag', () => {
    const onHeightChange = vi.fn()
    render(<LogPanel height={150} onHeightChange={onHeightChange} />)
    const handle = screen.getByTestId('log-drag-handle')

    // Drag up beyond max (400)
    fireEvent.mouseDown(handle, { clientY: 400 })
    fireEvent.mouseMove(document, { clientY: 0 })
    expect(onHeightChange).toHaveBeenCalledWith(400)
    fireEvent.mouseUp(document)
  })

  it('applies height from prop', () => {
    render(<LogPanel height={200} onHeightChange={() => {}} />)
    const panel = screen.getByTestId('log-panel')
    expect(panel.style.height).toBe('200px')
  })
})

// ===========================================================================
// App layout integration
// ===========================================================================

describe('App layout', () => {
  it('renders toolbar, three panels, log panel, and status bar', () => {
    render(<App />)
    // Toolbar buttons (use exact match to avoid collision with action bar "New" button)
    expect(screen.getByTitle('New (Ctrl+N)')).toBeInTheDocument()
    // Panels - ThingListPanel shows category tabs instead of "Objects" header
    expect(screen.getByTestId('thing-list-panel')).toBeInTheDocument()
    expect(screen.getByText('Items')).toBeInTheDocument()
    // ThingTypeEditor shows "Edit" in both header and empty state body
    expect(screen.getAllByText('Edit').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Sprites')).toBeInTheDocument()
    // Log panel
    expect(screen.getByText('Log Window')).toBeInTheDocument()
    // Status bar ("No project loaded" also appears in ThingListPanel)
    expect(screen.getAllByText('No project loaded').length).toBeGreaterThanOrEqual(1)
  })

  it('hides log panel when toggled', () => {
    useAppStore.getState().togglePanel('log')
    render(<App />)
    expect(screen.queryByText('Log Window')).not.toBeInTheDocument()
  })

  it('hides things panel when toggled', () => {
    useAppStore.getState().togglePanel('things')
    render(<App />)
    expect(screen.queryByTestId('thing-list-panel')).not.toBeInTheDocument()
  })

  it('hides sprites panel when toggled', () => {
    useAppStore.getState().togglePanel('sprites')
    render(<App />)
    expect(screen.queryByText('Sprites')).not.toBeInTheDocument()
  })

  it('hides item editor panel when toggled', () => {
    useAppStore.getState().togglePanel('editor')
    render(<App />)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('shows all panels by default', () => {
    render(<App />)
    expect(screen.getByTestId('thing-list-panel')).toBeInTheDocument()
    // ThingTypeEditor shows "Edit" in both header and empty state body
    expect(screen.getAllByText('Edit').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Sprites')).toBeInTheDocument()
    expect(screen.getByText('Log Window')).toBeInTheDocument()
  })

  it('toggles log panel via toolbar log button', () => {
    render(<App />)
    expect(screen.getByText('Log Window')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle(/Log Window/))
    expect(screen.queryByText('Log Window')).not.toBeInTheDocument()
  })

  it('toggles item editor panel via toolbar button', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<App />)

    expect(screen.getAllByText('Edit').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByTestId('toolbar-toggle-editor-panel'))
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toolbar-toggle-editor-panel'))
    expect(screen.getAllByText('Edit').length).toBeGreaterThanOrEqual(1)
  })

  it('toggles sprite panel via toolbar button', () => {
    const clientInfo = createClientInfo()
    clientInfo.loaded = true
    useAppStore.getState().setProjectLoaded({ loaded: true, clientInfo })
    render(<App />)

    expect(screen.getByTestId('sprite-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toolbar-toggle-sprite-panel'))
    expect(screen.queryByTestId('sprite-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toolbar-toggle-sprite-panel'))
    expect(screen.getByTestId('sprite-panel')).toBeInTheDocument()
  })
})
