/**
 * Object Viewer content and wrappers.
 *
 * Supports both the legacy in-app dialog wrapper and the detached BrowserWindow page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/Modal'
import {
  IconArrowNW,
  IconArrowN,
  IconArrowNE,
  IconArrowW,
  IconArrowE,
  IconArrowSW,
  IconArrowS,
  IconArrowSE,
  IconChevronLeft,
  IconChevronRight,
  IconFirst,
  IconPrevious,
  IconPlay,
  IconPause,
  IconStop,
  IconNext,
  IconLast,
  IconOpen
} from '../../components/Icons'
import { useEditorStore, selectEditingThingData } from '../../stores'
import { useAnimationStore } from '../../stores'
import { SpriteRenderer } from '../sprites'
import { ThingCategory, type ThingData, cloneThingData } from '../../types'
import { FrameGroupType as FGT } from '../../types/animation'
import type { FrameGroupType } from '../../types/animation'
import { Direction } from '../../types/geometry'

export interface ObjectViewerDialogProps {
  open: boolean
  onClose: () => void
}

interface ObjectViewerContentProps {
  active: boolean
  editingThingData: ThingData | null
  fillWindow?: boolean
}

interface ObdFileEntry {
  name: string
  path: string
}

interface DirectionPadProps {
  direction: number
  onDirectionChange: (patternX: number) => void
  maxDirections: number
}

function DirectionPad({
  direction,
  onDirectionChange,
  maxDirections
}: DirectionPadProps): React.JSX.Element {
  const buttons: Array<{
    dir: number
    label: string
    icon: React.ReactNode
  }> = [
    { dir: Direction.NORTHWEST, label: 'NW', icon: <IconArrowNW size={12} /> },
    { dir: Direction.NORTH, label: 'N', icon: <IconArrowN size={12} /> },
    { dir: Direction.NORTHEAST, label: 'NE', icon: <IconArrowNE size={12} /> },
    { dir: Direction.WEST, label: 'W', icon: <IconArrowW size={12} /> },
    { dir: -1, label: '', icon: null },
    { dir: Direction.EAST, label: 'E', icon: <IconArrowE size={12} /> },
    { dir: Direction.SOUTHWEST, label: 'SW', icon: <IconArrowSW size={12} /> },
    { dir: Direction.SOUTH, label: 'S', icon: <IconArrowS size={12} /> },
    { dir: Direction.SOUTHEAST, label: 'SE', icon: <IconArrowSE size={12} /> }
  ]

  const dirToPatternX = (dir: number): number => {
    switch (dir) {
      case Direction.NORTH:
      case Direction.NORTHWEST:
        return 0
      case Direction.EAST:
      case Direction.NORTHEAST:
        return 1
      case Direction.SOUTH:
      case Direction.SOUTHEAST:
        return 2
      case Direction.WEST:
      case Direction.SOUTHWEST:
        return 3
      default:
        return 0
    }
  }

  return (
    <div className="grid grid-cols-3 gap-0.5" style={{ width: 72, height: 72 }}>
      {buttons.map((btn) => {
        if (btn.dir === -1) {
          return <div key="center" className="h-6 w-6" />
        }

        const patternX = dirToPatternX(btn.dir)
        const isActive = direction === patternX
        const isAvailable = patternX < maxDirections

        return (
          <button
            key={btn.label}
            type="button"
            title={btn.label}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] transition-colors ${
              isActive
                ? 'bg-accent text-white'
                : isAvailable
                  ? 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
                  : 'cursor-not-allowed bg-bg-primary text-text-muted'
            }`}
            onClick={() => isAvailable && onDirectionChange(patternX)}
            disabled={!isAvailable}
          >
            {btn.icon}
          </button>
        )
      })}
    </div>
  )
}

interface ObdFileListProps {
  files: ObdFileEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
}

function ObdFileList({ files, selectedIndex, onSelect }: ObdFileListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current || selectedIndex < 0) return
    const element = listRef.current.children[selectedIndex] as HTMLElement | undefined
    element?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-muted">
        No files loaded
      </div>
    )
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto">
      {files.map((file, index) => (
        <div
          key={file.path}
          className={`cursor-pointer truncate px-2 py-1 text-xs ${
            index === selectedIndex
              ? 'bg-accent text-white'
              : 'text-text-primary hover:bg-accent-subtle'
          }`}
          onClick={() => onSelect(index)}
        >
          {file.name}
        </div>
      ))}
    </div>
  )
}

function ObjectViewerContent({
  active,
  editingThingData,
  fillWindow = false
}: ObjectViewerContentProps): React.JSX.Element {
  const { t } = useTranslation()
  const [sourceMode, setSourceMode] = useState<'editing' | 'obd'>('editing')
  const [obdFiles, setObdFiles] = useState<ObdFileEntry[]>([])
  const [obdSelectedIndex, setObdSelectedIndex] = useState(-1)
  const [obdThingData, setObdThingData] = useState<ThingData | null>(null)
  const [obdLoading, setObdLoading] = useState(false)
  const [obdError, setObdError] = useState<string | null>(null)
  const [patternX, setPatternX] = useState(2)
  const [frameGroupType, setFrameGroupType] = useState<FrameGroupType>(FGT.DEFAULT)
  const [zoom, setZoom] = useState(1.0)
  const [showBgColor, setShowBgColor] = useState(false)
  const [bgColor, setBgColor] = useState('#ff00ff')

  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const currentFrame = useAnimationStore((s) => s.currentFrame)
  const animFrameRef = useRef<number>(0)
  const thingData = sourceMode === 'editing' ? editingThingData : obdThingData
  const thing = thingData?.thing
  const category = thing?.category
  const isOutfit = category === ThingCategory.OUTFIT

  const frameGroup = useMemo(() => {
    if (!thing?.frameGroups) return null
    const index = frameGroupType === FGT.WALKING ? 1 : 0
    return thing.frameGroups[index] ?? thing.frameGroups[0] ?? null
  }, [thing, frameGroupType])

  const hasWalking = isOutfit && thing?.frameGroups && thing.frameGroups.length > 1
  const hasAnimation = frameGroup !== null && frameGroup !== undefined && frameGroup.frames > 1
  const maxDirections = frameGroup?.patternX ?? 1

  useEffect(() => {
    if (!active) return

    if (!thingData || !frameGroup) {
      useAnimationStore.getState().clearFrameGroup()
      return
    }

    useAnimationStore.getState().setFrameGroup(frameGroup, frameGroupType)
    if (hasAnimation) {
      useAnimationStore.getState().play()
    }
  }, [active, thingData, frameGroup, frameGroupType, hasAnimation])

  useEffect(() => {
    if (!isPlaying || !active) return

    const tick = (time: number): void => {
      useAnimationStore.getState().update(time)
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [active, isPlaying])

  useEffect(() => {
    if (active) {
      setObdError(null)
      setZoom(1.0)

      if (editingThingData) {
        const isOutfitCategory = editingThingData.thing.category === ThingCategory.OUTFIT
        setPatternX(isOutfitCategory ? 2 : 0)
        const hasWalkingGroup =
          isOutfitCategory &&
          editingThingData.thing.frameGroups &&
          editingThingData.thing.frameGroups.length > 1
        setFrameGroupType(hasWalkingGroup ? FGT.WALKING : FGT.DEFAULT)
      } else {
        setPatternX(0)
        setFrameGroupType(FGT.DEFAULT)
      }
    } else {
      useAnimationStore.getState().clearFrameGroup()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [active, editingThingData])

  const loadObdFile = useCallback(async (filePath: string) => {
    setObdLoading(true)
    setObdError(null)
    setObdThingData(null)

    try {
      const buffer = await window.api.file.readBinary(filePath)
      const { workerService } = await import('../../workers/worker-service')
      const decoded = await workerService.decodeObd(new Uint8Array(buffer).buffer)
      setObdThingData(decoded)

      const isOutfitCategory = decoded.thing.category === ThingCategory.OUTFIT
      setPatternX(isOutfitCategory ? 2 : 0)
      const hasWalkingGroup =
        isOutfitCategory && decoded.thing.frameGroups && decoded.thing.frameGroups.length > 1
      setFrameGroupType(hasWalkingGroup ? FGT.WALKING : FGT.DEFAULT)
    } catch (error) {
      setObdError(error instanceof Error ? error.message : String(error))
    } finally {
      setObdLoading(false)
    }
  }, [])

  const handleOpenObdFiles = useCallback(async () => {
    try {
      const result = await window.api.file.showOpenDialog({
        filters: [{ name: 'Object Builder Data', extensions: ['obd'] }]
      })

      if (result.canceled || result.filePaths.length === 0) return

      const selectedPath = result.filePaths[0]
      const normalized = selectedPath.replace(/\\/g, '/')
      const directory = normalized.replace(/\/[^/]+$/u, '')
      const allFiles = await window.api.file.list(directory, ['obd'])
      const entries = allFiles
        .map((filePath) => ({
          name: filePath.split('/').pop() ?? filePath,
          path: filePath
        }))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))

      setObdFiles(entries)
      setSourceMode('obd')

      const nextIndex = entries.findIndex((entry) => entry.path === selectedPath)
      setObdSelectedIndex(nextIndex >= 0 ? nextIndex : 0)
      await loadObdFile(selectedPath)
    } catch (error) {
      setObdError(error instanceof Error ? error.message : String(error))
    }
  }, [loadObdFile])

  const handleObdSelect = useCallback(
    async (index: number) => {
      if (index < 0 || index >= obdFiles.length) return
      setObdSelectedIndex(index)
      await loadObdFile(obdFiles[index].path)
    },
    [obdFiles, loadObdFile]
  )

  const handlePrevious = useCallback(() => {
    if (obdSelectedIndex > 0) {
      void handleObdSelect(obdSelectedIndex - 1)
    }
  }, [handleObdSelect, obdSelectedIndex])

  const handleNext = useCallback(() => {
    if (obdSelectedIndex < obdFiles.length - 1) {
      void handleObdSelect(obdSelectedIndex + 1)
    }
  }, [handleObdSelect, obdFiles.length, obdSelectedIndex])

  const handlePlay = useCallback(() => {
    useAnimationStore.getState().play()
  }, [])

  const handlePause = useCallback(() => {
    useAnimationStore.getState().pause()
  }, [])

  const handleStop = useCallback(() => {
    useAnimationStore.getState().stop()
  }, [])

  const handleFirstFrame = useCallback(() => {
    useAnimationStore.getState().firstFrame()
  }, [])

  const handlePrevFrame = useCallback(() => {
    useAnimationStore.getState().prevFrame()
  }, [])

  const handleNextFrame = useCallback(() => {
    useAnimationStore.getState().nextFrame()
  }, [])

  const handleLastFrame = useCallback(() => {
    useAnimationStore.getState().lastFrame()
  }, [])

  const handleZoomChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(parseFloat(event.target.value))
  }, [])

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'o') {
          event.preventDefault()
          void handleOpenObdFiles()
        }
      } else if (sourceMode === 'obd' && obdFiles.length > 1) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          handlePrevious()
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          handleNext()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, handleNext, handleOpenObdFiles, handlePrevious, obdFiles.length, sourceMode])

  const statusText = useMemo(() => {
    if (!thingData) return ''

    const parts: string[] = []

    if (sourceMode === 'obd' && obdFiles[obdSelectedIndex]) {
      parts.push(`Name: ${obdFiles[obdSelectedIndex].name.replace(/\.obd$/iu, '')}`)
    } else if (thing) {
      parts.push(`${thing.category} #${thing.id}`)
    }

    if (thing) {
      parts.push(`Type: ${thing.category}`)
    }

    if (thingData.clientVersion > 0) {
      parts.push(`Client: ${(thingData.clientVersion / 100).toFixed(2)}`)
    }

    if (thingData.obdVersion > 0) {
      parts.push(`OBD: ${(thingData.obdVersion / 100).toFixed(1)}`)
    }

    return parts.join(' | ')
  }, [obdFiles, obdSelectedIndex, sourceMode, thing, thingData])

  return (
    <div
      className={`flex min-h-0 flex-col gap-3 overflow-hidden ${fillWindow ? 'h-full' : ''}`}
      style={fillWindow ? undefined : { height: 'min(560px, calc(90vh - 10rem))' }}
    >
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              sourceMode === 'editing'
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
            }`}
            onClick={() => setSourceMode('editing')}
            title="View current editing object"
          >
            Current
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
              sourceMode === 'obd'
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
            }`}
            onClick={() => void handleOpenObdFiles()}
            title="Open OBD files (Ctrl+O)"
          >
            <IconOpen size={12} /> Open OBD...
          </button>
        </div>

        <div className="flex-1" />

        <label className="flex items-center gap-1 text-xs text-text-primary">
          <input
            type="checkbox"
            className="accent-accent"
            checked={showBgColor}
            onChange={(event) => setShowBgColor(event.target.checked)}
          />
          Background
        </label>
        <input
          type="color"
          className="h-5 w-5 cursor-pointer rounded border border-border"
          value={bgColor}
          onChange={(event) => setBgColor(event.target.value)}
          disabled={!showBgColor}
          title="Background color"
        />
      </div>

      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-hidden">
        {sourceMode === 'obd' && (
          <div className="flex h-full min-h-0 w-48 shrink-0 flex-col rounded border border-border">
            <div className="border-b border-border px-2 py-1 text-xs font-semibold text-text-secondary">
              Files ({obdFiles.length})
            </div>
            <div className="flex-1 overflow-hidden">
              <ObdFileList
                files={obdFiles}
                selectedIndex={obdSelectedIndex}
                onSelect={handleObdSelect}
              />
            </div>
            <div className="flex items-center justify-center gap-1 border-t border-border py-1">
              <button
                type="button"
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-40"
                onClick={handlePrevious}
                disabled={obdSelectedIndex <= 0}
                title="Previous (Left Arrow)"
              >
                <IconChevronLeft size={12} /> Prev
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-primary hover:bg-bg-hover disabled:opacity-40"
                onClick={handleNext}
                disabled={obdSelectedIndex >= obdFiles.length - 1}
                title="Next (Right Arrow)"
              >
                Next <IconChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center rounded border border-border p-4">
          {obdLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-accent" />
              Loading...
            </div>
          ) : obdError ? (
            <div className="text-xs text-error">{obdError}</div>
          ) : !thingData ? (
            <div className="text-xs text-text-muted">
              {sourceMode === 'editing'
                ? 'No object selected. Select an object from the list to preview.'
                : 'Open an OBD file to preview.'}
            </div>
          ) : (
            <div
              style={{
                backgroundColor: showBgColor ? bgColor : 'transparent',
                padding: 8,
                borderRadius: 4
              }}
            >
              <SpriteRenderer
                thingData={thingData}
                frameGroupType={frameGroupType}
                frame={currentFrame}
                patternX={patternX}
                zoom={zoom}
                minSize={96}
                showCheckerboard={!showBgColor}
                drawBlendLayer={!isOutfit}
                className="rounded"
                onZoomChange={setZoom}
              />
            </div>
          )}
        </div>

        <div className="flex w-48 shrink-0 self-start flex-col gap-3">
          <div className="rounded border border-border p-2">
            <div className="mb-1 text-xs font-semibold text-text-secondary">Direction</div>
            <div className="flex justify-center">
              <DirectionPad
                direction={patternX}
                onDirectionChange={setPatternX}
                maxDirections={maxDirections}
              />
            </div>
          </div>

          {hasWalking && (
            <div className="rounded border border-border p-2">
              <div className="mb-1 text-xs font-semibold text-text-secondary">Frame Group</div>
              <select
                className="w-full rounded border border-border bg-bg-input px-2 py-1 text-xs text-text-primary"
                value={frameGroupType}
                onChange={(event) => setFrameGroupType(Number(event.target.value) as FrameGroupType)}
              >
                <option value={FGT.DEFAULT}>{t('thingType.idle')}</option>
                <option value={FGT.WALKING}>{t('thingType.walking')}</option>
              </select>
            </div>
          )}

          {hasAnimation && (
            <div className="rounded border border-border p-2">
              <div className="mb-1 text-xs font-semibold text-text-secondary">Playback</div>
              <div className="flex flex-wrap justify-center gap-0.5">
                <button
                  type="button"
                  className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                  onClick={handleFirstFrame}
                  title={t('labels.firstFrame')}
                >
                  <IconFirst size={14} />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                  onClick={handlePrevFrame}
                  title={t('labels.previousFrame')}
                >
                  <IconPrevious size={14} />
                </button>
                {isPlaying ? (
                  <button
                    type="button"
                    className="flex items-center justify-center rounded bg-accent p-1 text-white hover:bg-accent-hover"
                    onClick={handlePause}
                    title={t('labels.pause')}
                  >
                    <IconPause size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                    onClick={handlePlay}
                    title={t('labels.play')}
                  >
                    <IconPlay size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                  onClick={handleStop}
                  title={t('labels.stop')}
                >
                  <IconStop size={14} />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                  onClick={handleNextFrame}
                  title={t('labels.nextFrame')}
                >
                  <IconNext size={14} />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center rounded p-1 text-text-primary hover:bg-bg-hover"
                  onClick={handleLastFrame}
                  title={t('labels.lastFrame')}
                >
                  <IconLast size={14} />
                </button>
              </div>
              <div className="mt-1 text-center text-[10px] text-text-muted">
                Frame {currentFrame + 1} / {frameGroup?.frames ?? 0}
              </div>
            </div>
          )}

          <div className="rounded border border-border p-2">
            <div className="mb-1 text-xs font-semibold text-text-secondary">{t('labels.zoom')}</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="flex-1 accent-accent"
                min="1.0"
                max="5.0"
                step="0.1"
                value={zoom}
                onChange={handleZoomChange}
                disabled={!thingData}
              />
              <span className="w-9 text-right text-xs text-text-primary">{zoom.toFixed(1)}x</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-text-secondary">{statusText}</span>
        <span className="text-xs text-text-secondary">Zoom: {zoom.toFixed(1)}x</span>
      </div>
    </div>
  )
}

export function ObjectViewerDialog({ open, onClose }: ObjectViewerDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const editingThingData = useEditorStore(selectEditingThingData)

  if (!open) return null

  return (
    <Modal
      title={t('labels.objectViewer')}
      open={open}
      onClose={onClose}
      width={800}
      closeOnBackdrop={false}
      bodyScrollable={false}
    >
      <ObjectViewerContent active={open} editingThingData={editingThingData} />
    </Modal>
  )
}

export function DetachedObjectViewerWindow(): React.JSX.Element {
  const { t } = useTranslation()
  const [editingThingData, setEditingThingData] = useState<ThingData | null>(null)

  useEffect(() => {
    let mounted = true

    void window.api.objectViewer
      .getCurrentThing()
      .then((thingData) => {
        if (mounted) {
          setEditingThingData(thingData ? cloneThingData(thingData) : null)
        }
      })
      .catch(() => {
        if (mounted) {
          setEditingThingData(null)
        }
      })

    const unsubscribe = window.api.objectViewer.onCurrentThingChanged((thingData) => {
      setEditingThingData(thingData ? cloneThingData(thingData) : null)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold text-text-primary">{t('labels.objectViewer')}</h1>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <ObjectViewerContent active={true} editingThingData={editingThingData} fillWindow />
      </div>
    </div>
  )
}
