/**
 * ThingTypeEditor - Editor panel for ThingType objects.
 * Three tabs: Texture (sprite viewer + patterns + animation config),
 * Properties (flags + values), Attributes (server item attributes).
 *
 * Ported from legacy AS3: otlib/components/ThingTypeEditor.mxml
 */

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, selectEditingThingData } from '../../stores/use-editor-store'
import { useAppStore } from '../../stores/use-app-store'
import { useSpriteStore } from '../../stores/use-sprite-store'
import { IconClose } from '../../components/Icons'
import {
  ThingCategory,
  type ThingType,
  type ThingData,
  cloneThingType,
  getThingFrameGroup,
  setThingFrameGroup,
  FrameGroupType,
  type FrameGroup,
  type FrameDuration,
  cloneFrameGroup,
  getFrameGroupTotalSprites,
  getFrameGroupSpriteSheetSize,
  getFrameGroupSpriteIndex,
  getFrameGroupTextureIndex,
  getFrameGroupTotalX,
  Direction,
  createSpriteData
} from '../../types'
import { SPRITE_DEFAULT_SIZE } from '../../types/sprites'
import type { ClientInfo } from '../../types/project'
import { SpriteRenderer } from '../sprites/SpriteRenderer'
import { AttributesEditor } from './AttributesEditor'
import { rgbaToArgb, compressPixels } from '../../services/spr'
import { setEditableXmlAttributes } from '../../services/server-items'

// ---------------------------------------------------------------------------
// Sprite sheet drag-and-drop helpers
// ---------------------------------------------------------------------------

/**
 * Remove magenta pixels (0xFF00FF) from RGBA ImageData by making them transparent.
 * OpenTibia uses magenta as the transparency color in bitmaps.
 */
function removeMagenta(imageData: ImageData): void {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0xff && data[i + 1] === 0x00 && data[i + 2] === 0xff) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
    }
  }
}

/**
 * Calculate the combined total sprite sheet size for all frame groups stacked vertically.
 * Equivalent to legacy ThingData.getTotalSpriteSheetSize().
 * Used to validate dropped images that cover all frame groups (idle+walking).
 */
function getTotalSpriteSheetSize(thing: ThingType): { width: number; height: number } {
  let totalWidth = 0
  let totalHeight = 0
  for (const fg of thing.frameGroups) {
    if (!fg) continue
    const size = getFrameGroupSpriteSheetSize(fg)
    totalWidth = Math.max(totalWidth, size.width)
    totalHeight += size.height
  }
  return { width: totalWidth, height: totalHeight }
}

/**
 * Extract 32x32 sprites from a sprite sheet bitmap for a single frame group.
 * Equivalent to legacy ThingData.setSpriteSheet().
 *
 * The extraction follows OpenTibia's bottom-right-first tile ordering:
 * tiles are iterated with (width - w - 1) and (height - h - 1).
 *
 * Returns array of ARGB pixel arrays indexed by the frame group's sprite index.
 */
function extractSpritesFromSheet(
  ctx: CanvasRenderingContext2D,
  fg: FrameGroup,
  offsetY: number
): Uint8Array[] {
  const totalX = getFrameGroupTotalX(fg)
  const totalSprites = getFrameGroupTotalSprites(fg)
  const pixelsWidth = fg.width * SPRITE_DEFAULT_SIZE
  const pixelsHeight = fg.height * SPRITE_DEFAULT_SIZE
  const sprites: Uint8Array[] = new Array(totalSprites)

  for (let f = 0; f < fg.frames; f++) {
    for (let z = 0; z < fg.patternZ; z++) {
      for (let y = 0; y < fg.patternY; y++) {
        for (let x = 0; x < fg.patternX; x++) {
          for (let l = 0; l < fg.layers; l++) {
            const textureIndex = getFrameGroupTextureIndex(fg, l, x, y, z, f)
            const fx = (textureIndex % totalX) * pixelsWidth
            const fy = Math.floor(textureIndex / totalX) * pixelsHeight + offsetY

            for (let w = 0; w < fg.width; w++) {
              for (let h = 0; h < fg.height; h++) {
                const sprIdx = getFrameGroupSpriteIndex(fg, w, h, l, x, y, z, f)
                // Bottom-right first: reverse tile order within multi-tile objects
                const px = (fg.width - w - 1) * SPRITE_DEFAULT_SIZE
                const py = (fg.height - h - 1) * SPRITE_DEFAULT_SIZE

                const tileData = ctx.getImageData(
                  px + fx,
                  py + fy,
                  SPRITE_DEFAULT_SIZE,
                  SPRITE_DEFAULT_SIZE
                )
                removeMagenta(tileData)
                sprites[sprIdx] = rgbaToArgb(tileData.data)
              }
            }
          }
        }
      }
    }
  }

  return sprites
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type EditorTab = 'texture' | 'properties' | 'attributes'

// ---------------------------------------------------------------------------
// Constants for dropdowns
// ---------------------------------------------------------------------------

const CLOTH_SLOTS = [
  { value: 0, label: 'thingType.slot.twoHandWeapon' },
  { value: 1, label: 'thingType.slot.helmet' },
  { value: 2, label: 'thingType.slot.amulet' },
  { value: 3, label: 'thingType.slot.backpack' },
  { value: 4, label: 'thingType.slot.armor' },
  { value: 5, label: 'thingType.slot.shield' },
  { value: 6, label: 'thingType.slot.oneHandWeapon' },
  { value: 7, label: 'thingType.slot.legs' },
  { value: 8, label: 'thingType.slot.boots' },
  { value: 9, label: 'thingType.slot.ring' },
  { value: 10, label: 'thingType.slot.arrow' }
] as const

const MARKET_CATEGORIES = [
  { value: 1, label: 'thingType.market.armors' },
  { value: 2, label: 'thingType.market.amulets' },
  { value: 3, label: 'thingType.market.boots' },
  { value: 4, label: 'thingType.market.containers' },
  { value: 5, label: 'thingType.market.decoration' },
  { value: 6, label: 'thingType.market.foods' },
  { value: 7, label: 'thingType.market.helmetsAndHats' },
  { value: 8, label: 'thingType.market.legs' },
  { value: 9, label: 'thingType.market.others' },
  { value: 10, label: 'thingType.market.potions' },
  { value: 11, label: 'thingType.market.rings' },
  { value: 12, label: 'thingType.market.runes' },
  { value: 13, label: 'thingType.market.shields' },
  { value: 14, label: 'thingType.market.tools' },
  { value: 15, label: 'thingType.market.valuables' },
  { value: 16, label: 'thingType.market.ammunition' },
  { value: 17, label: 'thingType.market.axes' },
  { value: 18, label: 'thingType.market.clubs' },
  { value: 19, label: 'thingType.market.distance' },
  { value: 20, label: 'thingType.market.swords' },
  { value: 21, label: 'thingType.market.wandsAndRods' },
  { value: 22, label: 'thingType.market.premiumScrolls' },
  { value: 23, label: 'thingType.market.metaWeapons' }
] as const

const DEFAULT_ACTIONS = [
  { value: 0, label: 'thingType.action.none' },
  { value: 1, label: 'thingType.action.look' },
  { value: 2, label: 'thingType.action.use' },
  { value: 3, label: 'thingType.action.open' },
  { value: 4, label: 'thingType.action.autowalkHighlight' }
] as const

const LENS_HELP_TYPES = [
  { value: 1100, label: 'thingType.lensHelp.ladders' },
  { value: 1101, label: 'thingType.lensHelp.sewerGrates' },
  { value: 1102, label: 'thingType.lensHelp.dungeonFloor' },
  { value: 1103, label: 'thingType.lensHelp.levers' },
  { value: 1104, label: 'thingType.lensHelp.doors' },
  { value: 1105, label: 'thingType.lensHelp.specialDoors' },
  { value: 1106, label: 'thingType.lensHelp.stairs' },
  { value: 1107, label: 'thingType.lensHelp.mailboxes' },
  { value: 1108, label: 'thingType.lensHelp.depotBoxes' },
  { value: 1109, label: 'thingType.lensHelp.dustbins' },
  { value: 1110, label: 'thingType.lensHelp.stonePiles' },
  { value: 1111, label: 'thingType.lensHelp.signs' },
  { value: 1112, label: 'thingType.lensHelp.booksAndScrolls' }
] as const

const ANIMATION_MODES = [
  { value: 0, label: 'labels.asynchronous' },
  { value: 1, label: 'labels.synchronous' }
] as const

const FRAME_STRATEGIES = [
  { value: 0, label: 'labels.loop' },
  { value: 1, label: 'labels.pingPong' }
] as const

// ---------------------------------------------------------------------------
// Shared form control components
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="border-b border-border-subtle bg-bg-secondary px-2 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
        {title}
      </span>
    </div>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
  disabled
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1.5 py-0.5 text-[11px] text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-accent"
      />
      {label}
    </label>
  )
}

function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  disabled
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="min-w-[80px] text-[11px] text-text-secondary">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          let v = parseInt(e.target.value, 10)
          if (isNaN(v)) v = 0
          if (min !== undefined && v < min) v = min
          if (max !== undefined && v > max) v = max
          onChange(v)
        }}
        min={min}
        max={max}
        disabled={disabled}
        className="w-20 rounded border border-border bg-bg-primary px-1.5 py-0.5 text-[11px] text-text-primary disabled:opacity-40"
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="min-w-[80px] text-[11px] text-text-secondary">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 rounded border border-border bg-bg-primary px-1.5 py-0.5 text-[11px] text-text-primary disabled:opacity-40"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string
  value: number
  options: ReadonlyArray<{ value: number; label: string }>
  onChange: (value: number) => void
  disabled?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="min-w-[80px] text-[11px] text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="flex-1 rounded border border-border bg-bg-primary px-1 py-0.5 text-[11px] text-text-primary disabled:opacity-40"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.label)}
          </option>
        ))}
      </select>
    </div>
  )
}

function GroupCheckBox({
  label,
  checked,
  onToggle,
  disabled,
  children
}: {
  label: string
  checked: boolean
  onToggle: (checked: boolean) => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="border-b border-border/50 py-1.5 last:border-b-0">
      <label className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-text-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
          className="accent-accent"
        />
        {label}
      </label>
      {checked && <div className="mt-1 space-y-0.5 px-2 pl-6">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper: version-based feature checks
// ---------------------------------------------------------------------------

function getClientVersion(clientInfo: ClientInfo | null): number {
  return clientInfo?.clientVersion ?? 0
}

// ---------------------------------------------------------------------------
// Property update helper
// ---------------------------------------------------------------------------

function usePropertyUpdater(): (updates: Partial<ThingType>) => void {
  const setEditingThingData = useEditorStore((s) => s.setEditingThingData)
  const setEditingChanged = useEditorStore((s) => s.setEditingChanged)
  const pushUndo = useEditorStore((s) => s.pushUndo)

  return useCallback(
    (updates: Partial<ThingType>) => {
      const data = useEditorStore.getState().editingThingData
      if (!data) return

      const beforeThing = cloneThingType(data.thing)
      const afterThing = cloneThingType(data.thing)
      Object.assign(afterThing, updates)

      const updatedData: ThingData = {
        ...data,
        thing: afterThing
      }

      pushUndo({
        type: 'update-thing',
        timestamp: Date.now(),
        description: `Update properties`,
        before: [{ id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }],
        after: [{ id: afterThing.id, category: afterThing.category, thingType: afterThing }]
      })

      setEditingThingData(updatedData)
      setEditingChanged(true)
    },
    [setEditingThingData, setEditingChanged, pushUndo]
  )
}

// ---------------------------------------------------------------------------
// Frame group update helper
// ---------------------------------------------------------------------------

function useFrameGroupUpdater(): (groupType: FrameGroupType, updates: Partial<FrameGroup>) => void {
  const setEditingThingData = useEditorStore((s) => s.setEditingThingData)
  const setEditingChanged = useEditorStore((s) => s.setEditingChanged)
  const pushUndo = useEditorStore((s) => s.pushUndo)

  return useCallback(
    (groupType: FrameGroupType, updates: Partial<FrameGroup>) => {
      const data = useEditorStore.getState().editingThingData
      if (!data) return

      const beforeThing = cloneThingType(data.thing)
      const afterThing = cloneThingType(data.thing)

      const fg = getThingFrameGroup(afterThing, groupType)
      if (!fg) return

      const updatedFg = cloneFrameGroup(fg)
      Object.assign(updatedFg, updates)

      // Recalculate spriteIndex size if dimensions changed
      const oldTotal = getFrameGroupTotalSprites(fg)
      const newTotal = getFrameGroupTotalSprites(updatedFg)
      if (newTotal !== oldTotal) {
        const newSpriteIndex = new Array(newTotal).fill(0)
        for (let i = 0; i < Math.min(oldTotal, newTotal); i++) {
          newSpriteIndex[i] = updatedFg.spriteIndex[i] ?? 0
        }
        updatedFg.spriteIndex = newSpriteIndex
      }

      // Update isAnimation flag
      updatedFg.isAnimation = updatedFg.frames > 1

      // Update frame durations if frames changed
      if ('frames' in updates && updatedFg.frameDurations) {
        const newDurations: FrameDuration[] = []
        for (let i = 0; i < updatedFg.frames; i++) {
          newDurations.push(updatedFg.frameDurations[i] ?? { minimum: 100, maximum: 100 })
        }
        updatedFg.frameDurations = newDurations
      }

      setThingFrameGroup(afterThing, groupType, updatedFg)

      // Resize sprites in ThingData if needed
      const updatedSprites = new Map(data.sprites)
      const existingSprites = updatedSprites.get(groupType) ?? []
      if (newTotal !== existingSprites.length) {
        const newSprites = Array.from(
          { length: newTotal },
          (_, i) => existingSprites[i] ?? createSpriteData()
        )
        updatedSprites.set(groupType, newSprites)
      }

      pushUndo({
        type: 'update-thing',
        timestamp: Date.now(),
        description: 'Update texture',
        before: [{ id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }],
        after: [{ id: afterThing.id, category: afterThing.category, thingType: afterThing }]
      })

      setEditingThingData({ ...data, thing: afterThing, sprites: updatedSprites })
      setEditingChanged(true)
    },
    [setEditingThingData, setEditingChanged, pushUndo]
  )
}

// ---------------------------------------------------------------------------
// Section: Render Order (radio buttons)
// ---------------------------------------------------------------------------

function RenderOrderSection({
  thing,
  onUpdate,
  clientVersion
}: {
  thing: ThingType
  onUpdate: (updates: Partial<ThingType>) => void
  clientVersion: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const handleChange = useCallback(
    (order: string) => {
      onUpdate({
        isGround: false,
        groundSpeed: 0,
        isGroundBorder: false,
        isOnBottom: false,
        isOnTop: false,
        ...(order === 'ground' && { isGround: true, groundSpeed: thing.groundSpeed || 100 }),
        ...(order === 'groundBorder' && { isGroundBorder: true }),
        ...(order === 'onBottom' && { isOnBottom: true }),
        ...(order === 'onTop' && { isOnTop: true })
      })
    },
    [onUpdate, thing.groundSpeed]
  )

  const currentOrder = thing.isGround
    ? 'ground'
    : thing.isGroundBorder
      ? 'groundBorder'
      : thing.isOnBottom
        ? 'onBottom'
        : thing.isOnTop
          ? 'onTop'
          : 'common'

  return (
    <div className="space-y-0.5 px-2 py-1">
      <div className="space-y-0.5">
        <label className="flex items-center gap-1.5 text-[11px] text-text-primary">
          <input
            type="radio"
            name="renderOrder"
            checked={currentOrder === 'common'}
            onChange={() => handleChange('common')}
            className="accent-accent"
          />
          {t('thingType.isCommon')}
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-text-primary">
          <input
            type="radio"
            name="renderOrder"
            checked={currentOrder === 'ground'}
            onChange={() => handleChange('ground')}
            className="accent-accent"
          />
          {t('thingType.isGround')}
        </label>
        {thing.isGround && (
          <div className="pl-5">
            <NumericField
              label={t('thingType.groundSpeed')}
              value={thing.groundSpeed}
              onChange={(v) => onUpdate({ groundSpeed: v })}
              min={0}
              max={1000}
            />
          </div>
        )}
        {clientVersion >= 750 && (
          <label className="flex items-center gap-1.5 text-[11px] text-text-primary">
            <input
              type="radio"
              name="renderOrder"
              checked={currentOrder === 'groundBorder'}
              onChange={() => handleChange('groundBorder')}
              className="accent-accent"
            />
            {t('thingType.isGroundBorder')}
          </label>
        )}
        <label className="flex items-center gap-1.5 text-[11px] text-text-primary">
          <input
            type="radio"
            name="renderOrder"
            checked={currentOrder === 'onBottom'}
            onChange={() => handleChange('onBottom')}
            className="accent-accent"
          />
          {t('thingType.isOnBottom')}
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-text-primary">
          <input
            type="radio"
            name="renderOrder"
            checked={currentOrder === 'onTop'}
            onChange={() => handleChange('onTop')}
            className="accent-accent"
          />
          {t('thingType.isOnTop')}
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Flags (boolean checkboxes in two columns)
// ---------------------------------------------------------------------------

function FlagsSection({
  thing,
  onUpdate,
  clientVersion
}: {
  thing: ThingType
  onUpdate: (updates: Partial<ThingType>) => void
  clientVersion: number
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-x-2 px-2 py-1">
      {/* Left column */}
      <div className="space-y-0.5">
        <CheckboxField
          label={t('thingType.container')}
          checked={thing.isContainer}
          onChange={(v) => onUpdate({ isContainer: v })}
        />
        <CheckboxField
          label={t('thingType.stackable')}
          checked={thing.stackable}
          onChange={(v) => onUpdate({ stackable: v })}
        />
        <CheckboxField
          label={t('thingType.forceUse')}
          checked={thing.forceUse}
          onChange={(v) => onUpdate({ forceUse: v })}
        />
        <CheckboxField
          label={t('thingType.multiUse')}
          checked={thing.multiUse}
          onChange={(v) => onUpdate({ multiUse: v })}
        />
        <CheckboxField
          label={t('thingType.fluidContainer')}
          checked={thing.isFluidContainer}
          onChange={(v) => onUpdate({ isFluidContainer: v })}
        />
        <CheckboxField
          label={t('thingType.fluid')}
          checked={thing.isFluid}
          onChange={(v) => onUpdate({ isFluid: v })}
        />
        <CheckboxField
          label={t('thingType.unpassable')}
          checked={thing.isUnpassable}
          onChange={(v) => onUpdate({ isUnpassable: v })}
        />
        <CheckboxField
          label={t('thingType.unmovable')}
          checked={thing.isUnmoveable}
          onChange={(v) => onUpdate({ isUnmoveable: v })}
        />
        <CheckboxField
          label={t('thingType.blockMissile')}
          checked={thing.blockMissile}
          onChange={(v) => onUpdate({ blockMissile: v })}
        />
        <CheckboxField
          label={t('thingType.blockPathfinder')}
          checked={thing.blockPathfind}
          onChange={(v) => onUpdate({ blockPathfind: v })}
        />
      </div>

      {/* Right column */}
      <div className="space-y-0.5">
        {clientVersion >= 1010 && (
          <CheckboxField
            label={t('thingType.noMoveAnimation')}
            checked={thing.noMoveAnimation}
            onChange={(v) => onUpdate({ noMoveAnimation: v })}
          />
        )}
        <CheckboxField
          label={t('thingType.pickupable')}
          checked={thing.pickupable}
          onChange={(v) => onUpdate({ pickupable: v })}
        />
        {clientVersion >= 755 && (
          <>
            <CheckboxField
              label={t('thingType.hangable')}
              checked={thing.hangable}
              onChange={(v) => onUpdate({ hangable: v })}
            />
            <CheckboxField
              label={t('thingType.horizontalWall')}
              checked={thing.isHorizontal}
              onChange={(v) => onUpdate({ isHorizontal: v })}
            />
            <CheckboxField
              label={t('thingType.verticalWall')}
              checked={thing.isVertical}
              onChange={(v) => onUpdate({ isVertical: v })}
            />
          </>
        )}
        <CheckboxField
          label={t('thingType.rotatable')}
          checked={thing.rotatable}
          onChange={(v) => onUpdate({ rotatable: v })}
        />
        {clientVersion >= 780 && (
          <CheckboxField
            label={t('thingType.dontHide')}
            checked={thing.dontHide}
            onChange={(v) => onUpdate({ dontHide: v })}
          />
        )}
        {clientVersion >= 860 && (
          <CheckboxField
            label={t('thingType.translucent')}
            checked={thing.isTranslucent}
            onChange={(v) => onUpdate({ isTranslucent: v })}
          />
        )}
        <CheckboxField
          label={t('thingType.lyingObject')}
          checked={thing.isLyingObject}
          onChange={(v) => onUpdate({ isLyingObject: v })}
        />
        <CheckboxField
          label={t('thingType.fullGround')}
          checked={thing.isFullGround}
          onChange={(v) => onUpdate({ isFullGround: v })}
        />
        {clientVersion >= 780 && (
          <CheckboxField
            label={t('thingType.ignoreLook')}
            checked={thing.ignoreLook}
            onChange={(v) => onUpdate({ ignoreLook: v })}
          />
        )}
        {clientVersion >= 1021 && (
          <CheckboxField
            label={t('thingType.usable')}
            checked={thing.usable}
            onChange={(v) => onUpdate({ usable: v })}
          />
        )}
        {clientVersion >= 780 && clientVersion <= 854 && (
          <CheckboxField
            label={t('thingType.hasCharges')}
            checked={thing.hasCharges}
            onChange={(v) => onUpdate({ hasCharges: v })}
          />
        )}
        {((clientVersion >= 710 && clientVersion <= 854) || clientVersion >= 1092) && (
          <>
            <CheckboxField
              label={t('thingType.wrappable')}
              checked={thing.wrappable}
              onChange={(v) => onUpdate({ wrappable: v })}
            />
            <CheckboxField
              label={t('thingType.unwrappable')}
              checked={thing.unwrappable}
              onChange={(v) => onUpdate({ unwrappable: v })}
            />
          </>
        )}
        {clientVersion >= 710 && clientVersion <= 854 && (
          <CheckboxField
            label={t('thingType.floorChange')}
            checked={thing.floorChange}
            onChange={(v) => onUpdate({ floorChange: v })}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Outfit-specific flags
// ---------------------------------------------------------------------------

function OutfitFlagsSection({
  thing,
  onUpdate
}: {
  thing: ThingType
  onUpdate: (updates: Partial<ThingType>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="px-2 py-1">
      <CheckboxField
        label={t('thingType.animateAlways')}
        checked={thing.animateAlways}
        onChange={(v) => onUpdate({ animateAlways: v })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Effect-specific flags
// ---------------------------------------------------------------------------

function EffectFlagsSection({
  thing,
  onUpdate,
  clientVersion
}: {
  thing: ThingType
  onUpdate: (updates: Partial<ThingType>) => void
  clientVersion: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const showTopEffect = (clientVersion >= 710 && clientVersion <= 792) || clientVersion >= 1092

  if (!showTopEffect) return <React.Fragment />

  return (
    <div className="px-2 py-1">
      <CheckboxField
        label={t('thingType.topEffect')}
        checked={thing.topEffect}
        onChange={(v) => onUpdate({ topEffect: v })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Texture
// ---------------------------------------------------------------------------

function TextureTabContent({
  thingData,
  clientInfo
}: {
  thingData: ThingData
  clientInfo: ClientInfo | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const thing = thingData.thing
  const category = thing.category
  const clientVersion = getClientVersion(clientInfo)
  const updateFrameGroup = useFrameGroupUpdater()
  const updateProperty = usePropertyUpdater()

  const isOutfit = category === ThingCategory.OUTFIT
  const isMissile = category === ThingCategory.MISSILE
  const showDirections = isOutfit || isMissile

  const [direction, setDirection] = useState<number>(Direction.SOUTH)
  const [zoom, setZoom] = useState(1)
  const [frameGroupType, setFrameGroupType] = useState<FrameGroupType>(FrameGroupType.DEFAULT)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [showCropSize, setShowCropSize] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const frameGroup = getThingFrameGroup(thing, frameGroupType)
  const groupCount = thing.frameGroups.filter(Boolean).length

  const transparent = clientInfo?.features?.transparency ?? false

  const handleFrameGroupChange = useCallback((type: FrameGroupType) => {
    setFrameGroupType(type)
    setCurrentFrame(0)
  }, [])

  // Sprite sheet drag-and-drop handler
  const handleSpriteSheetDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleSpriteSheetDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleSpriteSheetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (!thingData || !frameGroup) return

      const fileList = e.dataTransfer?.files
      if (!fileList || fileList.length === 0) return

      // Accept only image files
      const file = Array.from(fileList).find(
        (f) =>
          f.type.startsWith('image/') ||
          f.name.endsWith('.png') ||
          f.name.endsWith('.bmp') ||
          f.name.endsWith('.jpg') ||
          f.name.endsWith('.jpeg')
      )
      if (!file) return

      const reader = new FileReader()
      reader.onload = (): void => {
        const img = new Image()
        img.onload = (): void => {
          const imgWidth = img.naturalWidth
          const imgHeight = img.naturalHeight

          // Check if image matches current frame group's sprite sheet size
          const fgSize = getFrameGroupSpriteSheetSize(frameGroup)
          const totalSize = getTotalSpriteSheetSize(thingData.thing)

          let mode: 'single' | 'total' | null = null

          if (imgWidth === fgSize.width && imgHeight === fgSize.height) {
            mode = 'single'
          } else if (imgWidth === totalSize.width && imgHeight === totalSize.height) {
            mode = 'total'
          }

          if (!mode) {
            // Size mismatch - log expected sizes
            const appStore = useAppStore.getState()
            const expected =
              groupCount > 1
                ? `${fgSize.width}x${fgSize.height} (current group) or ${totalSize.width}x${totalSize.height} (all groups)`
                : `${fgSize.width}x${fgSize.height}`
            appStore.addLog(
              'warning',
              `Sprite sheet size mismatch: image is ${imgWidth}x${imgHeight}, expected ${expected}`
            )
            return
          }

          // Draw image to canvas for pixel extraction
          const canvas = document.createElement('canvas')
          canvas.width = imgWidth
          canvas.height = imgHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          ctx.drawImage(img, 0, 0)

          const beforeThing = cloneThingType(thingData.thing)
          const afterThing = cloneThingType(thingData.thing)
          const newSpritesMap = new Map(thingData.sprites)
          const spriteStore = useSpriteStore.getState()

          if (mode === 'single') {
            // Extract sprites for the current frame group only
            const extractedPixels = extractSpritesFromSheet(ctx, frameGroup, 0)
            const totalSprites = getFrameGroupTotalSprites(frameGroup)
            const newInlineSprites = extractedPixels.map((pixels) => ({
              id: 0,
              pixels: pixels ?? null
            }))
            newSpritesMap.set(frameGroupType, newInlineSprites)

            // Update spriteIndex with new sprite store IDs
            const afterFg = getThingFrameGroup(afterThing, frameGroupType)
            if (afterFg) {
              const newSpriteIndex = new Array(totalSprites)
              for (let i = 0; i < totalSprites; i++) {
                if (extractedPixels[i]) {
                  const compressed = compressPixels(extractedPixels[i], transparent)
                  newSpriteIndex[i] = spriteStore.addSprite(compressed)
                } else {
                  newSpriteIndex[i] = 0
                }
              }
              afterFg.spriteIndex = newSpriteIndex
            }
          } else {
            // mode === 'total': Extract sprites for all frame groups
            let offsetY = 0
            for (let groupIdx = 0; groupIdx < thingData.thing.frameGroups.length; groupIdx++) {
              const fg = thingData.thing.frameGroups[groupIdx]
              if (!fg) continue

              const groupType = groupIdx as FrameGroupType
              const extractedPixels = extractSpritesFromSheet(ctx, fg, offsetY)
              const totalSprites = getFrameGroupTotalSprites(fg)

              const newInlineSprites = extractedPixels.map((pixels) => ({
                id: 0,
                pixels: pixels ?? null
              }))
              newSpritesMap.set(groupType, newInlineSprites)

              // Update spriteIndex
              const afterFg = getThingFrameGroup(afterThing, groupType)
              if (afterFg) {
                const newSpriteIndex = new Array(totalSprites)
                for (let i = 0; i < totalSprites; i++) {
                  if (extractedPixels[i]) {
                    const compressed = compressPixels(extractedPixels[i], transparent)
                    newSpriteIndex[i] = spriteStore.addSprite(compressed)
                  } else {
                    newSpriteIndex[i] = 0
                  }
                }
                afterFg.spriteIndex = newSpriteIndex
              }

              const fgSheetSize = getFrameGroupSpriteSheetSize(fg)
              offsetY += fgSheetSize.height
            }
          }

          // Register undo
          const editorStore = useEditorStore.getState()
          editorStore.pushUndo({
            type: 'update-thing',
            timestamp: Date.now(),
            description: `Import sprite sheet (${mode === 'total' ? 'all groups' : 'current group'})`,
            before: [
              { id: beforeThing.id, category: beforeThing.category, thingType: beforeThing }
            ],
            after: [{ id: afterThing.id, category: afterThing.category, thingType: afterThing }]
          })

          // Update editor store
          editorStore.setEditingThingData({
            ...thingData,
            thing: afterThing,
            sprites: newSpritesMap
          })
          editorStore.setEditingChanged(true)

          // Update app store
          const appStore = useAppStore.getState()
          appStore.updateThing(thingData.thing.category, thingData.thing.id, afterThing)
          appStore.setProjectChanged(true)

          // Update sprite count
          const maxSpriteId = Math.max(
            appStore.spriteCount ?? 0,
            ...Array.from(spriteStore.sprites.keys())
          )
          appStore.setSpriteCount(maxSpriteId)

          // Update menu state
          if (window.api?.menu) {
            window.api.menu.updateState({ clientChanged: true })
          }

          appStore.addLog(
            'info',
            `Imported sprite sheet: ${imgWidth}x${imgHeight} (${mode === 'total' ? 'all groups' : frameGroupType === FrameGroupType.DEFAULT ? 'idle' : 'walking'})`
          )
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    },
    [thingData, frameGroup, frameGroupType, groupCount, transparent]
  )

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Appearance Section */}
      <SectionHeader title={t('labels.appearance')} />
      <div
        className={`space-y-2 px-2 py-2 ${isDragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
        onDragOver={handleSpriteSheetDragOver}
        onDragLeave={handleSpriteSheetDragLeave}
        onDrop={handleSpriteSheetDrop}
      >
        {/* Sprite preview */}
        <div className="flex justify-center">
          <SpriteRenderer
            thingData={thingData}
            frameGroupType={frameGroupType}
            frame={currentFrame}
            patternX={showDirections ? direction : 0}
            zoom={zoom}
            minSize={64}
            showCheckerboard
            onZoomChange={setZoom}
          />
        </div>

        {/* Direction buttons */}
        {showDirections && frameGroup && frameGroup.patternX >= 2 && (
          <div className="flex items-center gap-1" data-testid="direction-buttons">
            <span className="mr-1 text-[10px] text-text-secondary">{t('labels.direction')}:</span>
            {([Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST] as const)
              .filter((_, i) => i < (frameGroup?.patternX ?? 0))
              .map((dir) => (
                <button
                  key={dir}
                  type="button"
                  className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${
                    direction === dir
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                  }`}
                  onClick={() => setDirection(dir)}
                  data-testid={`direction-${['n', 'e', 's', 'w'][dir]}`}
                >
                  {['N', 'E', 'S', 'W'][dir]}
                </button>
              ))}
          </div>
        )}

        {/* Zoom slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary">{t('labels.zoom')}:</span>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="h-3 flex-1"
            data-testid="zoom-slider"
          />
          <span className="w-8 text-[10px] text-text-secondary">{zoom}x</span>
        </div>

        {/* Frame Group selector - outfits with multiple groups */}
        {isOutfit && groupCount > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary">{t('labels.group')}:</span>
            <select
              value={frameGroupType}
              onChange={(e) =>
                handleFrameGroupChange(parseInt(e.target.value, 10) as FrameGroupType)
              }
              className="rounded border border-border bg-bg-primary px-1 py-0.5 text-[10px] text-text-primary"
              data-testid="texture-frame-group"
            >
              <option value={FrameGroupType.DEFAULT}>{t('thingType.idle')}</option>
              <option value={FrameGroupType.WALKING}>{t('thingType.walking')}</option>
            </select>
          </div>
        )}

        {/* Frame slider - animated things */}
        {frameGroup && frameGroup.frames > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary">{t('labels.frame')}:</span>
            <input
              type="range"
              min="0"
              max={frameGroup.frames - 1}
              step="1"
              value={currentFrame}
              onChange={(e) => setCurrentFrame(parseInt(e.target.value, 10))}
              className="h-3 flex-1"
              data-testid="frame-slider"
            />
            <span className="w-12 text-right text-[10px] text-text-secondary">
              {currentFrame + 1}/{frameGroup.frames}
            </span>
          </div>
        )}

        {/* Toggle options */}
        <div className="flex items-center gap-4">
          <CheckboxField
            label={t('controls.showCropSize')}
            checked={showCropSize}
            onChange={setShowCropSize}
          />
          <CheckboxField label={t('controls.showGrid')} checked={showGrid} onChange={setShowGrid} />
        </div>
      </div>

      {/* Patterns Section */}
      {frameGroup && (
        <>
          <SectionHeader title={t('labels.patterns')} />
          <div className="grid grid-cols-2 gap-x-2 px-2 py-1">
            <NumericField
              label={t('thingType.width')}
              value={frameGroup.width}
              onChange={(v) => updateFrameGroup(frameGroupType, { width: v })}
              min={1}
              max={8}
            />
            <NumericField
              label={t('thingType.height')}
              value={frameGroup.height}
              onChange={(v) => updateFrameGroup(frameGroupType, { height: v })}
              min={1}
              max={8}
            />
            <NumericField
              label={t('thingType.cropSize')}
              value={frameGroup.exactSize}
              onChange={(v) => updateFrameGroup(frameGroupType, { exactSize: v })}
              min={0}
              max={1000}
            />
            <NumericField
              label={t('thingType.layers')}
              value={frameGroup.layers}
              onChange={(v) => updateFrameGroup(frameGroupType, { layers: v })}
              min={1}
              max={8}
            />
            <NumericField
              label={t('thingType.patternX')}
              value={frameGroup.patternX}
              onChange={(v) => updateFrameGroup(frameGroupType, { patternX: v })}
              min={1}
              max={8}
            />
            <NumericField
              label={t('thingType.patternY')}
              value={frameGroup.patternY}
              onChange={(v) => updateFrameGroup(frameGroupType, { patternY: v })}
              min={1}
              max={8}
            />
            {clientVersion >= 755 && (
              <NumericField
                label={t('thingType.patternZ')}
                value={frameGroup.patternZ}
                onChange={(v) => updateFrameGroup(frameGroupType, { patternZ: v })}
                min={1}
                max={8}
              />
            )}
            <NumericField
              label={t('thingType.animations')}
              value={frameGroup.frames}
              onChange={(v) => updateFrameGroup(frameGroupType, { frames: v })}
              min={1}
              max={1000}
            />
          </div>
        </>
      )}

      {/* Animation Section - when frames > 1 */}
      {frameGroup && frameGroup.frames > 1 && (
        <>
          <SectionHeader title={t('labels.animation')} />
          <div className="space-y-0.5 px-2 py-1">
            <SelectField
              label={t('labels.animationMode')}
              value={frameGroup.animationMode}
              options={ANIMATION_MODES}
              onChange={(v) => updateFrameGroup(frameGroupType, { animationMode: v as 0 | 1 })}
            />
            <SelectField
              label={t('labels.frameStrategy')}
              value={frameGroup.loopCount < 0 ? 1 : 0}
              options={FRAME_STRATEGIES}
              onChange={(v) => updateFrameGroup(frameGroupType, { loopCount: v === 1 ? -1 : 0 })}
            />
            {frameGroup.loopCount >= 0 && (
              <NumericField
                label={t('labels.loopCount')}
                value={frameGroup.loopCount}
                onChange={(v) => updateFrameGroup(frameGroupType, { loopCount: v })}
                min={0}
                max={1000}
              />
            )}
            <NumericField
              label={t('labels.startFrame')}
              value={frameGroup.startFrame}
              onChange={(v) => updateFrameGroup(frameGroupType, { startFrame: v })}
              min={-1}
              max={frameGroup.frames - 1}
            />
          </div>
        </>
      )}

      {/* Has Bones Section */}
      {clientVersion >= 780 && (
        <>
          <SectionHeader title={t('thingType.hasBones')} />
          <GroupCheckBox
            label={t('thingType.hasBones')}
            checked={thing.hasBones}
            onToggle={(v) => updateProperty({ hasBones: v })}
          >
            <NumericField
              label={t('thingType.offsetX')}
              value={thing.bonesOffsetX[direction] ?? 0}
              onChange={(v) => {
                const offsets = [...thing.bonesOffsetX]
                offsets[direction] = v
                updateProperty({ bonesOffsetX: offsets })
              }}
              min={clientVersion >= 755 ? -1000 : 0}
              max={1000}
            />
            <NumericField
              label={t('thingType.offsetY')}
              value={thing.bonesOffsetY[direction] ?? 0}
              onChange={(v) => {
                const offsets = [...thing.bonesOffsetY]
                offsets[direction] = v
                updateProperty({ bonesOffsetY: offsets })
              }}
              min={clientVersion >= 755 ? -1000 : 0}
              max={1000}
            />
          </GroupCheckBox>
        </>
      )}

      <div className="h-4" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Properties
// ---------------------------------------------------------------------------

function PropertiesTabContent({
  thingData,
  clientInfo
}: {
  thingData: ThingData
  clientInfo: ClientInfo | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const thing = thingData.thing
  const category = thing.category
  const clientVersion = getClientVersion(clientInfo)
  const updateProperty = usePropertyUpdater()

  const isItem = category === ThingCategory.ITEM
  const isOutfit = category === ThingCategory.OUTFIT
  const isEffect = category === ThingCategory.EFFECT

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Render Order - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('labels.properties')} />
          <RenderOrderSection
            thing={thing}
            onUpdate={updateProperty}
            clientVersion={clientVersion}
          />
        </>
      )}

      {/* Light */}
      <SectionHeader title={t('thingType.hasLight')} />
      <GroupCheckBox
        label={t('thingType.hasLight')}
        checked={thing.hasLight}
        onToggle={(v) => updateProperty({ hasLight: v })}
      >
        <NumericField
          label={t('thingType.lightIntensity')}
          value={thing.lightLevel}
          onChange={(v) => updateProperty({ lightLevel: v })}
          min={0}
          max={255}
        />
        <NumericField
          label={t('thingType.lightColor')}
          value={thing.lightColor}
          onChange={(v) => updateProperty({ lightColor: v })}
          min={0}
          max={215}
        />
      </GroupCheckBox>

      {/* Offset */}
      <SectionHeader title={t('thingType.hasOffset')} />
      <GroupCheckBox
        label={t('thingType.hasOffset')}
        checked={thing.hasOffset}
        onToggle={(v) => updateProperty({ hasOffset: v })}
      >
        <NumericField
          label={t('thingType.offsetX')}
          value={thing.offsetX}
          onChange={(v) => updateProperty({ offsetX: v })}
          min={clientVersion >= 755 ? -256 : 0}
          max={clientVersion >= 755 ? 256 : 8}
        />
        <NumericField
          label={t('thingType.offsetY')}
          value={thing.offsetY}
          onChange={(v) => updateProperty({ offsetY: v })}
          min={clientVersion >= 755 ? -256 : 0}
          max={clientVersion >= 755 ? 256 : 8}
        />
      </GroupCheckBox>

      {/* Elevation - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('thingType.hasElevation')} />
          <GroupCheckBox
            label={t('thingType.hasElevation')}
            checked={thing.hasElevation}
            onToggle={(v) => updateProperty({ hasElevation: v })}
          >
            <NumericField
              label={t('thingType.elevation')}
              value={thing.elevation}
              onChange={(v) => updateProperty({ elevation: v })}
              min={0}
              max={32}
            />
          </GroupCheckBox>
        </>
      )}

      {/* Minimap - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('thingType.automap')} />
          <GroupCheckBox
            label={t('thingType.automap')}
            checked={thing.miniMap}
            onToggle={(v) => updateProperty({ miniMap: v })}
          >
            <NumericField
              label={t('thingType.automapColor')}
              value={thing.miniMapColor}
              onChange={(v) => updateProperty({ miniMapColor: v })}
              min={0}
              max={215}
            />
          </GroupCheckBox>
        </>
      )}

      {/* Write/Read - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('thingType.writeRead')} />
          <div className="space-y-0.5 px-2 py-1">
            <div className="flex items-center gap-4">
              <CheckboxField
                label={t('thingType.writable')}
                checked={thing.writable}
                onChange={(v) => updateProperty({ writable: v })}
              />
              {thing.writable && (
                <NumericField
                  label={t('thingType.maxLength')}
                  value={thing.maxReadWriteChars}
                  onChange={(v) => updateProperty({ maxReadWriteChars: v })}
                  min={0}
                  max={65535}
                />
              )}
            </div>
            <div className="flex items-center gap-4">
              <CheckboxField
                label={t('thingType.writableOnce')}
                checked={thing.writableOnce}
                onChange={(v) => updateProperty({ writableOnce: v })}
              />
              {thing.writableOnce && (
                <NumericField
                  label={t('thingType.maxLength')}
                  value={thing.maxReadChars}
                  onChange={(v) => updateProperty({ maxReadChars: v })}
                  min={0}
                  max={65535}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Equipment/Cloth - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('thingType.cloth')} />
          <GroupCheckBox
            label={t('thingType.cloth')}
            checked={thing.cloth}
            onToggle={(v) => updateProperty({ cloth: v, clothSlot: v ? thing.clothSlot : 0 })}
          >
            <SelectField
              label={t('thingType.clothSlot')}
              value={thing.clothSlot}
              options={CLOTH_SLOTS}
              onChange={(v) => updateProperty({ clothSlot: v })}
            />
          </GroupCheckBox>
        </>
      )}

      {/* Market - ITEMS only, v940+ */}
      {isItem && clientVersion >= 940 && (
        <>
          <SectionHeader title={t('thingType.market.label')} />
          <GroupCheckBox
            label={t('thingType.market.label')}
            checked={thing.isMarketItem}
            onToggle={(v) => updateProperty({ isMarketItem: v })}
          >
            <TextField
              label={t('labels.name')}
              value={thing.marketName}
              onChange={(v) => updateProperty({ marketName: v })}
            />
            <SelectField
              label={t('thingType.category')}
              value={thing.marketCategory}
              options={MARKET_CATEGORIES}
              onChange={(v) => updateProperty({ marketCategory: v })}
            />
            <NumericField
              label={t('thingType.tradeAs')}
              value={thing.marketTradeAs}
              onChange={(v) => updateProperty({ marketTradeAs: v })}
              min={0}
              max={0xffffff}
            />
            <NumericField
              label={t('thingType.showAs')}
              value={thing.marketShowAs}
              onChange={(v) => updateProperty({ marketShowAs: v })}
              min={0}
              max={0xffffff}
            />
            <NumericField
              label={t('thingType.vocation')}
              value={thing.marketRestrictProfession}
              onChange={(v) => updateProperty({ marketRestrictProfession: v })}
              min={0}
              max={0xffffff}
            />
            <NumericField
              label={t('thingType.level')}
              value={thing.marketRestrictLevel}
              onChange={(v) => updateProperty({ marketRestrictLevel: v })}
              min={0}
              max={0xffffff}
            />
          </GroupCheckBox>
        </>
      )}

      {/* Default Action - ITEMS only, v1021+ */}
      {isItem && clientVersion >= 1021 && (
        <>
          <SectionHeader title={t('thingType.hasAction')} />
          <GroupCheckBox
            label={t('thingType.hasAction')}
            checked={thing.hasDefaultAction}
            onToggle={(v) => updateProperty({ hasDefaultAction: v })}
          >
            <SelectField
              label={t('thingType.actionType')}
              value={thing.defaultAction}
              options={DEFAULT_ACTIONS}
              onChange={(v) => updateProperty({ defaultAction: v })}
            />
          </GroupCheckBox>
        </>
      )}

      {/* Lens Help */}
      <SectionHeader title={t('thingType.lensHelp.label')} />
      <GroupCheckBox
        label={t('thingType.lensHelp.label')}
        checked={thing.isLensHelp}
        onToggle={(v) => updateProperty({ isLensHelp: v })}
      >
        <SelectField
          label={t('labels.type')}
          value={thing.lensHelp}
          options={LENS_HELP_TYPES}
          onChange={(v) => updateProperty({ lensHelp: v })}
        />
      </GroupCheckBox>

      {/* Flags - ITEMS only */}
      {isItem && (
        <>
          <SectionHeader title={t('labels.flags')} />
          <FlagsSection thing={thing} onUpdate={updateProperty} clientVersion={clientVersion} />
        </>
      )}

      {/* Outfit-specific flags */}
      {isOutfit && (
        <>
          <SectionHeader title={t('labels.flags')} />
          <OutfitFlagsSection thing={thing} onUpdate={updateProperty} />
        </>
      )}

      {/* Effect-specific flags */}
      {isEffect && (
        <EffectFlagsSection thing={thing} onUpdate={updateProperty} clientVersion={clientVersion} />
      )}

      {/* Bottom padding for scroll comfort */}
      <div className="h-4" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Attributes
// ---------------------------------------------------------------------------

function AttributesTabContent({
  thingData,
  clientInfo
}: {
  thingData: ThingData
  clientInfo: ClientInfo | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const thing = thingData.thing
  const isItem = thing.category === ThingCategory.ITEM
  const otbLoaded = clientInfo?.otbLoaded ?? false
  const setEditingThingData = useEditorStore((s) => s.setEditingThingData)
  const pushUndo = useEditorStore((s) => s.pushUndo)

  const handleAttributesChange = useCallback(
    (attrs: Record<string, string> | null) => {
      const newThingData: ThingData = {
        ...thingData,
        xmlAttributes: attrs
      }
      pushUndo({
        type: 'update-thing',
        timestamp: Date.now(),
        description: 'edit attributes',
        before: [
          {
            id: thingData.thing.id,
            category: thingData.thing.category as ThingCategory,
            thingType: thingData.thing
          }
        ],
        after: [
          {
            id: thingData.thing.id,
            category: thingData.thing.category as ThingCategory,
            thingType: thingData.thing
          }
        ]
      })
      setEditingThingData(newThingData)
    },
    [thingData, setEditingThingData, pushUndo]
  )

  if (!isItem) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-xs text-text-secondary">
          {t('attributes.label')} - {t('labels.items')}
        </span>
      </div>
    )
  }

  if (!otbLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-xs text-text-secondary">
          Load server items (OTB) to edit attributes
        </span>
      </div>
    )
  }

  const attributeServer = clientInfo?.features.attributeServer ?? 'tfs1.4'

  return (
    <div className="flex-1 overflow-hidden">
      <AttributesEditor
        xmlAttributes={thingData.xmlAttributes}
        onChange={handleAttributesChange}
        initialServer={attributeServer}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar helper
// ---------------------------------------------------------------------------

function tabClass(active: boolean, disabled?: boolean): string {
  if (disabled) {
    return 'px-3 py-1.5 text-[11px] font-medium text-text-secondary/40 cursor-not-allowed'
  }
  return active
    ? 'px-3 py-1.5 text-[11px] font-medium text-accent border-b-2 border-accent'
    : 'px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary'
}

// ---------------------------------------------------------------------------
// ThingTypeEditor (exported main component)
// ---------------------------------------------------------------------------

export function ThingTypeEditor(): React.JSX.Element {
  const { t } = useTranslation()
  const thingData = useEditorStore(selectEditingThingData)
  const editingChanged = useEditorStore((s) => s.editingChanged)
  const setEditingThingData = useEditorStore((s) => s.setEditingThingData)
  const togglePanel = useAppStore((s) => s.togglePanel)
  const setEditingChanged = useEditorStore((s) => s.setEditingChanged)
  const clientInfo = useAppStore((s) => s.clientInfo)
  const updateThing = useAppStore((s) => s.updateThing)
  const [activeTab, setActiveTab] = useState<EditorTab>('texture')

  const handleSave = useCallback(() => {
    if (!thingData || !editingChanged) return

    if (thingData.thing.category === ThingCategory.ITEM) {
      setEditableXmlAttributes(thingData.thing.id, thingData.xmlAttributes)
    }

    updateThing(thingData.thing.category, thingData.thing.id, thingData.thing)
    setEditingChanged(false)
  }, [thingData, editingChanged, updateThing, setEditingChanged])

  const handleClose = useCallback(() => {
    setEditingThingData(null)
  }, [setEditingThingData])

  if (!thingData) {
    return (
      <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 items-center border-b border-border px-2">
          <span className="flex-1 text-xs font-medium text-text-secondary">{t('labels.edit')}</span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title={t('labels.hideItemPanel')}
            onClick={() => togglePanel('editor')}
          >
            <IconClose size={14} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-text-secondary">{t('labels.edit')}</span>
        </div>
      </div>
    )
  }

  const thing = thingData.thing
  const attributesDisabled = false

  const categoryLabel =
    thing.category === ThingCategory.ITEM
      ? t('labels.item')
      : thing.category === ThingCategory.OUTFIT
        ? t('labels.outfit')
        : thing.category === ThingCategory.EFFECT
          ? t('labels.effect')
          : thing.category === ThingCategory.MISSILE
            ? t('labels.missile')
            : 'Unknown'

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center border-b border-border bg-bg-secondary px-2">
        <span className="flex-1 text-xs font-medium text-text-primary">
          {categoryLabel} #{thing.id}
        </span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('labels.hideItemPanel')}
          onClick={() => togglePanel('editor')}
        >
          <IconClose size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border bg-bg-secondary">
        <button
          type="button"
          className={tabClass(activeTab === 'texture')}
          onClick={() => setActiveTab('texture')}
          data-testid="editor-tab-texture"
        >
          {t('labels.texture')}
        </button>
        <button
          type="button"
          className={tabClass(activeTab === 'properties')}
          onClick={() => setActiveTab('properties')}
          data-testid="editor-tab-properties"
        >
          {t('labels.properties')}
        </button>
        <button
          type="button"
          className={tabClass(activeTab === 'attributes', attributesDisabled)}
          onClick={() => !attributesDisabled && setActiveTab('attributes')}
          data-testid="editor-tab-attributes"
        >
          {t('attributes.label')}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'texture' && (
        <TextureTabContent thingData={thingData} clientInfo={clientInfo} />
      )}
      {activeTab === 'properties' && (
        <PropertiesTabContent thingData={thingData} clientInfo={clientInfo} />
      )}
      {activeTab === 'attributes' && (
        <AttributesTabContent thingData={thingData} clientInfo={clientInfo} />
      )}

      {/* Footer: Save / Close */}
      <div
        className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-bg-secondary px-3 py-1.5"
        data-testid="editor-footer"
      >
        <button
          type="button"
          disabled={!editingChanged}
          onClick={handleSave}
          className={`rounded border px-3 py-1 text-[11px] font-medium ${
            editingChanged
              ? 'border-accent bg-accent text-white hover:bg-accent/80'
              : 'border-border bg-bg-tertiary text-text-secondary/40 cursor-not-allowed'
          }`}
          data-testid="editor-save-btn"
        >
          {t('labels.save')}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="rounded border border-border bg-bg-tertiary px-3 py-1 text-[11px] font-medium text-text-secondary hover:bg-bg-tertiary/80 hover:text-text-primary"
          data-testid="editor-close-btn"
        >
          {t('labels.close')}
        </button>
      </div>
    </div>
  )
}
