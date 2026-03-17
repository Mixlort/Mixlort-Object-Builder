import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewPanel } from '../PreviewPanel'
import { resetAppStore, resetEditorStore, useAppStore, useEditorStore } from '../../../stores'
import {
  ThingCategory,
  createClientInfo,
  createThingData,
  createFrameGroup,
  createThingType,
  FrameGroupType
} from '../../../types'

vi.mock('../../sprites', () => ({
  SpriteRenderer: ({ frame }: { frame?: number }) => <div data-testid="sprite-renderer">{frame}</div>
}))

function flushAnimationFrame(frameTime = 120) {
  act(() => {
    vi.advanceTimersByTime(frameTime)
  })
}

function makeThingData() {
  const clientInfo = createClientInfo()
  clientInfo.clientVersion = 1098
  clientInfo.clientVersionStr = '10.98'

  const thing = createThingType()
  thing.id = 100
  thing.category = ThingCategory.ITEM
  thing.frameGroups = []

  return {
    clientInfo,
    thingData: createThingData(0, clientInfo.clientVersion, thing, new Map([[FrameGroupType.DEFAULT, []]]))
  }
}

function makeAnimatedEffectThingData() {
  const clientInfo = createClientInfo()
  clientInfo.clientVersion = 1098
  clientInfo.clientVersionStr = '10.98'

  const thing = createThingType()
  thing.id = 1
  thing.category = ThingCategory.EFFECT

  const frameGroup = createFrameGroup()
  frameGroup.frames = 2
  frameGroup.spriteIndex = [1, 2]
  thing.frameGroups = [frameGroup]

  return {
    clientInfo,
    thingData: createThingData(0, clientInfo.clientVersion, thing, new Map([[FrameGroupType.DEFAULT, []]]))
  }
}

describe('PreviewPanel', () => {
  beforeEach(() => {
    resetAppStore()
    resetEditorStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not break hook ordering when editing thing data appears after initial render', () => {
    const { clientInfo, thingData } = makeThingData()

    act(() => {
      useAppStore.getState().setClientInfo(clientInfo)
      useAppStore.getState().setCurrentCategory(ThingCategory.ITEM)
    })

    render(<PreviewPanel />)

    expect(screen.queryByTestId('sprite-renderer')).not.toBeInTheDocument()

    act(() => {
      useEditorStore.getState().setEditingThingData(thingData)
    })

    expect(screen.getByTestId('sprite-renderer')).toBeInTheDocument()
  })

  it('keeps animated effects playable and enables zoom and loop by default', async () => {
    const { clientInfo, thingData } = makeAnimatedEffectThingData()

    act(() => {
      useAppStore.getState().setClientInfo(clientInfo)
      useAppStore.getState().setCurrentCategory(ThingCategory.EFFECT)
      useEditorStore.getState().setEditingThingData(thingData)
    })

    render(<PreviewPanel />)

    expect(screen.getByTestId('sprite-renderer')).toHaveTextContent('0')
    expect(screen.getByRole('switch', { name: 'Zoom' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Loop' })).toHaveAttribute('aria-checked', 'true')

    flushAnimationFrame(120)
    expect(screen.getByTestId('sprite-renderer')).toHaveTextContent('1')

    fireEvent.click(screen.getByTitle('Stop'))

    expect(screen.getByTestId('sprite-renderer')).toHaveTextContent('0')

    fireEvent.click(screen.getByTitle('Play'))

    flushAnimationFrame(120)
    expect(screen.getByTestId('sprite-renderer')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('switch', { name: 'Loop' }))

    expect(screen.getByRole('switch', { name: 'Loop' })).toHaveAttribute('aria-checked', 'false')
  })
})
