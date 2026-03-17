/**
 * Preview panel with three sections: Info, Preview, and Colorize.
 * Shown in the far-left panel of the application layout.
 *
 * - Info: project metadata (version, signatures, counts)
 * - Preview: animated sprite viewer with playback controls
 * - Colorize: HSI color pickers for outfit parts + addon checkboxes
 *
 * Ported from legacy AS3: PreviewPanel area of ObjectBuilder.mxml
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, selectClientInfo, selectSpriteCount } from '../../stores'
import { useEditorStore, selectEditingThingData } from '../../stores'
import { useAnimationStore } from '../../stores'
import { ThingCategory } from '../../types/things'
import { cloneFrameGroup, FrameGroupType as FGT } from '../../types/animation'
import type { FrameGroupType } from '../../types/animation'
import { SpriteRenderer } from '../sprites'
import { createOutfitData, type OutfitData } from '../../services/sprite-render'
import { HSIColorPicker } from './HSIColorPicker'
import { useTranslation } from 'react-i18next'

// ---------------------------------------------------------------------------
// InfoSection
// ---------------------------------------------------------------------------

function InfoSection(): React.JSX.Element | null {
  const { t } = useTranslation()
  const clientInfo = useAppStore(selectClientInfo)
  const spriteCount = useAppStore(selectSpriteCount)

  if (!clientInfo) return null

  const items = clientInfo.maxItemId - clientInfo.minItemId + 1
  const outfits = clientInfo.maxOutfitId - clientInfo.minOutfitId + 1
  const effects = clientInfo.maxEffectId - clientInfo.minEffectId + 1
  const missiles = clientInfo.maxMissileId - clientInfo.minMissileId + 1

  const rows = [
    { label: t('labels.version'), value: clientInfo.clientVersionStr },
    {
      label: 'DAT Signature',
      value: `0x${(clientInfo.datSignature >>> 0).toString(16).toUpperCase()}`
    },
    {
      label: 'SPR Signature',
      value: `0x${(clientInfo.sprSignature >>> 0).toString(16).toUpperCase()}`
    },
    { label: t('labels.items'), value: items > 0 ? String(items) : '0' },
    { label: t('labels.outfits'), value: outfits > 0 ? String(outfits) : '0' },
    { label: t('labels.effects'), value: effects > 0 ? String(effects) : '0' },
    { label: t('labels.missiles'), value: missiles > 0 ? String(missiles) : '0' },
    { label: t('labels.sprites'), value: String(spriteCount) }
  ]

  return (
    <div className="border-b border-border px-2 py-1.5">
      <div className="mb-1 text-xs font-semibold uppercase text-secondary">{t('labels.info')}</div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between text-xs">
            <span className="text-secondary">{row.label}</span>
            <span className="text-primary">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PreviewSection
// ---------------------------------------------------------------------------

interface PreviewSectionProps {
  /** Outfit data passed from parent (only applied when colorizeEnabled) */
  outfitData: OutfitData
  /** Whether colorize is active (toggle ON + layers > 1) */
  colorizeEnabled: boolean
}

function PreviewSection({
  outfitData,
  colorizeEnabled
}: PreviewSectionProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const editingThingData = useEditorStore(selectEditingThingData)
  const currentCategory = useAppStore((s) => s.currentCategory)
  const isPlaying = useAnimationStore((s) => s.isPlaying)
  const currentFrame = useAnimationStore((s) => s.currentFrame)

  const [frameGroupType, setFrameGroupType] = useState<FrameGroupType>(FGT.DEFAULT)
  const [zoomed, setZoomed] = useState(true)
  const [effectLoopEnabled, setEffectLoopEnabled] = useState(true)

  const animFrameRef = useRef<number>(0)

  const isOutfit = currentCategory === ThingCategory.OUTFIT

  // Reset state & auto-play when thing changes
  useEffect(() => {
    if (!editingThingData) {
      useAnimationStore.getState().clearFrameGroup()
      return
    }

    const thing = editingThingData.thing

    // Legacy: default to WALKING if available, otherwise DEFAULT
    const hasWalking = isOutfit && thing.frameGroups && thing.frameGroups.length > 1
    const defaultFgt = hasWalking ? FGT.WALKING : FGT.DEFAULT
    setFrameGroupType(defaultFgt)
    setZoomed(true)
    setEffectLoopEnabled(thing.category === ThingCategory.EFFECT)
  }, [editingThingData, isOutfit])

  // Sync preview animation source when selection, frame group, or effect loop mode changes
  useEffect(() => {
    if (!editingThingData) return

    const thing = editingThingData.thing
    const sourceFrameGroup =
      thing.frameGroups?.[frameGroupType === FGT.WALKING ? 1 : 0] ?? thing.frameGroups?.[0]

    if (sourceFrameGroup) {
      const previewFrameGroup =
        thing.category === ThingCategory.EFFECT
          ? (() => {
              const cloned = cloneFrameGroup(sourceFrameGroup)
              cloned.loopCount = effectLoopEnabled ? 0 : 1
              return cloned
            })()
          : sourceFrameGroup

      useAnimationStore.getState().setFrameGroup(previewFrameGroup, frameGroupType)
      useAnimationStore.getState().play()
    } else {
      useAnimationStore.getState().clearFrameGroup()
    }
  }, [editingThingData, frameGroupType, effectLoopEnabled])

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) return

    const tick = (time: number) => {
      useAnimationStore.getState().update(time)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying])

  const handlePlay = useCallback(() => {
    useAnimationStore.getState().play()
  }, [])

  const handlePause = useCallback(() => {
    useAnimationStore.getState().pause()
  }, [])

  const handleStop = useCallback(() => {
    useAnimationStore.getState().stop()
  }, [])

  const thing = editingThingData?.thing ?? null
  const hasWalking = isOutfit && !!thing?.frameGroups && thing.frameGroups.length > 1
  const fg = thing?.frameGroups?.[frameGroupType === FGT.WALKING ? 1 : 0] ?? thing?.frameGroups?.[0]
  const hasAnimation = fg !== undefined && fg.frames > 1
  const isEffect = thing?.category === ThingCategory.EFFECT

  if (!editingThingData || !thing) return null

  // Legacy: outfits always face South (patternX=2), others patternX=0
  const patternX = isOutfit ? 2 : 0

  // Colorize: only pass outfitData to renderer when toggle is ON and valid
  const effectiveOutfitData = isOutfit && colorizeEnabled ? outfitData : null

  const renderSwitch = (label: string, checked: boolean, onToggle: () => void) => (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-xs text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
        onClick={onToggle}
      >
        <span
          className={`pointer-events-none mt-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )

  return (
    <div className="border-b border-border px-2 py-1.5">
      <div className="mb-1 text-xs font-semibold uppercase text-secondary">
        {t('labels.preview')}
      </div>

      {/* Sprite renderer */}
      <div className="mb-2 flex justify-center">
        <SpriteRenderer
          thingData={editingThingData}
          frameGroupType={frameGroupType}
          frame={currentFrame}
          patternX={patternX}
          outfitData={effectiveOutfitData}
          minSize={zoomed ? 128 : 64}
          showCheckerboard={true}
          drawBlendLayer={!isOutfit}
          className="rounded border border-border"
        />
      </div>

      {/* Playback controls (only for animated things) */}
      {hasAnimation && (
        <div className="mb-1.5 flex items-center justify-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs hover:bg-bg-hover"
            onClick={handlePlay}
            title="Play"
          >
            &#9654;
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs hover:bg-bg-hover"
            onClick={handlePause}
            title="Pause"
          >
            &#9646;&#9646;
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs hover:bg-bg-hover"
            onClick={handleStop}
            title="Stop"
          >
            &#9632;
          </button>
        </div>
      )}

      {/* Frame group selector (outfits only) */}
      {hasWalking && (
        <div className="mb-1.5 flex items-center justify-center">
          <select
            className="rounded border border-border bg-bg-input px-2 py-0.5 text-xs text-primary"
            value={frameGroupType}
            onChange={(e) => setFrameGroupType(Number(e.target.value) as FrameGroupType)}
          >
            <option value={FGT.DEFAULT}>{t('thingType.idle')}</option>
            <option value={FGT.WALKING}>{t('thingType.walking')}</option>
          </select>
        </div>
      )}

      {/* Zoom toggle switch */}
      {renderSwitch(t('labels.zoom'), zoomed, () => setZoomed(!zoomed))}

      {isEffect && hasAnimation && (
        <div className="mt-1.5">
          {renderSwitch(t('labels.loop'), effectLoopEnabled, () =>
            setEffectLoopEnabled(!effectLoopEnabled)
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ColorizeSection
// ---------------------------------------------------------------------------

interface ColorizeSectionProps {
  outfitData: OutfitData
  onOutfitDataChange: (data: OutfitData) => void
  colorizeOn: boolean
  onColorizeToggle: (on: boolean) => void
  canColorize: boolean
}

function ColorizeSection({
  outfitData,
  onOutfitDataChange,
  colorizeOn,
  onColorizeToggle,
  canColorize
}: ColorizeSectionProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const currentCategory = useAppStore((s) => s.currentCategory)
  const editingThingData = useEditorStore(selectEditingThingData)

  const handleColorChange = useCallback(
    (part: keyof Pick<OutfitData, 'head' | 'body' | 'legs' | 'feet'>, index: number) => {
      onOutfitDataChange({ ...outfitData, [part]: index })
    },
    [outfitData, onOutfitDataChange]
  )

  const handleAddonToggle = useCallback(
    (bit: number) => {
      onOutfitDataChange({ ...outfitData, addons: outfitData.addons ^ bit })
    },
    [outfitData, onOutfitDataChange]
  )

  if (currentCategory !== ThingCategory.OUTFIT || !editingThingData) return null

  const controlsDisabled = !colorizeOn || !canColorize

  return (
    <div className="px-2 py-1.5">
      {/* Colorize toggle header */}
      <label className="mb-1 flex items-center gap-1.5">
        <input
          type="checkbox"
          className="accent-accent"
          checked={colorizeOn && canColorize}
          disabled={!canColorize}
          onChange={(e) => onColorizeToggle(e.target.checked)}
        />
        <span className="text-xs font-semibold uppercase text-secondary">Colorize</span>
        {!canColorize && <span className="text-[10px] text-text-muted">(no blend layer)</span>}
      </label>

      <div className={`space-y-1 ${controlsDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <HSIColorPicker
          label={t('labels.head')}
          value={outfitData.head}
          onChange={(i) => handleColorChange('head', i)}
        />
        <HSIColorPicker
          label={t('labels.body')}
          value={outfitData.body}
          onChange={(i) => handleColorChange('body', i)}
        />
        <HSIColorPicker
          label={t('labels.legs')}
          value={outfitData.legs}
          onChange={(i) => handleColorChange('legs', i)}
        />
        <HSIColorPicker
          label={t('labels.feet')}
          value={outfitData.feet}
          onChange={(i) => handleColorChange('feet', i)}
        />
      </div>

      {/* Addon checkboxes */}
      <div className={`mt-2 space-y-1 ${controlsDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-accent"
            checked={(outfitData.addons & 1) !== 0}
            onChange={() => handleAddonToggle(1)}
          />
          Addon 1
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-accent"
            checked={(outfitData.addons & 2) !== 0}
            onChange={() => handleAddonToggle(2)}
          />
          Addon 2
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PreviewPanel (main)
// ---------------------------------------------------------------------------

export function PreviewPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const clientInfo = useAppStore(selectClientInfo)
  const editingThingData = useEditorStore(selectEditingThingData)
  const currentCategory = useAppStore((s) => s.currentCategory)

  const [outfitData, setOutfitData] = useState<OutfitData>(() => createOutfitData())
  const [colorizeOn, setColorizeOn] = useState(false)

  // Reset outfit data and colorize toggle when thing changes (render-time state adjustment)
  const [prevEditingThingData, setPrevEditingThingData] = useState(editingThingData)
  if (editingThingData !== prevEditingThingData) {
    setPrevEditingThingData(editingThingData)
    setOutfitData(createOutfitData())
    setColorizeOn(false)
  }

  // Legacy validation: colorize only available when frame group has layers > 1
  const canColorize = useMemo(() => {
    if (!editingThingData || currentCategory !== ThingCategory.OUTFIT) return false
    const fg = editingThingData.thing.frameGroups?.[0]
    return fg !== undefined && fg.layers > 1
  }, [editingThingData, currentCategory])

  // Effective colorize state: toggle ON + has blend layer
  const colorizeEnabled = colorizeOn && canColorize

  if (!clientInfo) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-secondary">
        {t('app.noProjectLoaded')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-secondary">
      <InfoSection />
      <PreviewSection outfitData={outfitData} colorizeEnabled={colorizeEnabled} />
      <ColorizeSection
        outfitData={outfitData}
        onOutfitDataChange={setOutfitData}
        colorizeOn={colorizeOn}
        onColorizeToggle={setColorizeOn}
        canColorize={canColorize}
      />
    </div>
  )
}
