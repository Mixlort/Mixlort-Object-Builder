import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewPanel } from '../PreviewPanel'
import {
  resetAppStore,
  resetEditorStore,
  resetAnimationStore,
  useAppStore,
  useEditorStore
} from '../../../stores'
import {
  ThingCategory,
  createClientInfo,
  createThingData,
  createThingType,
  FrameGroupType
} from '../../../types'

vi.mock('../../sprites', () => ({
  SpriteRenderer: () => <div data-testid="sprite-renderer" />
}))

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

describe('PreviewPanel', () => {
  beforeEach(() => {
    resetAppStore()
    resetEditorStore()
    resetAnimationStore()
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
})
