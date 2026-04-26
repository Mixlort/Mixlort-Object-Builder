/**
 * Preferences dialog for application settings.
 * Ported from legacy PreferencesWindow.mxml.
 *
 * 5 tabs: General, Custom Client, Sprite Sheet, Things, Items.
 * Loads settings on open, saves on confirm via IPC.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Modal,
  DialogButton,
  FieldGroup,
  SelectField,
  CheckboxField,
  NumberInputField,
  RadioField
} from '../../components/Modal'
import { useTranslation } from 'react-i18next'
import type { ObjectBuilderSettings } from '../../../../shared/settings'
import { createObjectBuilderSettings } from '../../../../shared/settings'

type TabId = 'general' | 'customClient' | 'spriteSheet' | 'things' | 'items'

const TAB_KEYS: Record<TabId, string> = {
  general: 'labels.general',
  customClient: 'labels.customClient',
  spriteSheet: 'labels.spriteSheet',
  things: 'labels.things',
  items: 'labels.items'
}

const TAB_IDS: TabId[] = ['general', 'customClient', 'spriteSheet', 'things', 'items']

interface PreferencesDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (settings: ObjectBuilderSettings) => void
  otbLoaded?: boolean
}

export function PreferencesDialog({
  open,
  onClose,
  onConfirm,
  otbLoaded = false
}: PreferencesDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [settings, setSettings] = useState<ObjectBuilderSettings>(createObjectBuilderSettings)

  // Reset tab on open (render-time state adjustment)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setActiveTab('general')
  }
  if (open !== prevOpen) {
    setPrevOpen(open)
  }

  // Load settings when dialog opens (async side effect)
  useEffect(() => {
    if (!open) return

    if (window.api?.settings) {
      window.api.settings.load().then((loaded) => {
        setSettings(loaded)
      })
    }
  }, [open])

  const updateSetting = useCallback(
    <K extends keyof ObjectBuilderSettings>(key: K, value: ObjectBuilderSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const themeOptions = useMemo(
    () => [
      { value: 'system', label: t('labels.system') },
      { value: 'light', label: t('labels.light') },
      { value: 'dark', label: t('labels.dark') }
    ],
    [t]
  )

  const languageOptions = useMemo(
    () => [
      { value: 'en_US', label: 'English (US)' },
      { value: 'es_ES', label: 'Español' },
      { value: 'pt_BR', label: 'Português (BR)' }
    ],
    []
  )

  const clipboardActionOptions = useMemo(
    () => [
      { value: '0', label: t('labels.clipboardObject') },
      { value: '1', label: t('labels.clipboardPatterns') },
      { value: '2', label: t('labels.clipboardProperties') }
    ],
    [t]
  )

  const handleConfirm = useCallback(() => {
    onConfirm(settings)
    onClose()
  }, [settings, onConfirm, onClose])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <Modal
      title={t('menu.preferences')}
      open={open}
      onClose={handleClose}
      width={550}
      footer={
        <>
          <span className="mr-auto text-xs text-text-secondary">
            {t('labels.restartMayBeRequired')}
          </span>
          <DialogButton label={t('labels.cancel')} onClick={handleClose} />
          <DialogButton label={t('labels.confirm')} onClick={handleConfirm} primary />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tabId
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => setActiveTab(tabId)}
            >
              {t(TAB_KEYS[tabId])}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'general' && (
          <GeneralTab
            settings={settings}
            onUpdate={updateSetting}
            themeOptions={themeOptions}
            languageOptions={languageOptions}
            clipboardActionOptions={clipboardActionOptions}
          />
        )}
        {activeTab === 'customClient' && (
          <CustomClientTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'spriteSheet' && (
          <SpriteSheetTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'things' && <ThingsTab settings={settings} onUpdate={updateSetting} />}
        {activeTab === 'items' && (
          <ItemsTab settings={settings} onUpdate={updateSetting} otbLoaded={otbLoaded} />
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Tab components
// ---------------------------------------------------------------------------

interface TabProps {
  settings: ObjectBuilderSettings
  onUpdate: <K extends keyof ObjectBuilderSettings>(key: K, value: ObjectBuilderSettings[K]) => void
}

function GeneralTab({
  settings,
  onUpdate,
  themeOptions,
  languageOptions,
  clipboardActionOptions
}: TabProps & {
  themeOptions: Array<{ value: string; label: string }>
  languageOptions: Array<{ value: string; label: string }>
  clipboardActionOptions: Array<{ value: string; label: string }>
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label={t('labels.appearance')}>
        <SelectField
          label={t('labels.theme')}
          value={settings.theme}
          onChange={(v) => onUpdate('theme', v as 'system' | 'light' | 'dark')}
          options={themeOptions}
        />
      </FieldGroup>

      <FieldGroup label={t('labels.language')}>
        <SelectField
          label={t('labels.language')}
          value={settings.language}
          onChange={(v) => onUpdate('language', v)}
          options={languageOptions}
        />
      </FieldGroup>

      <FieldGroup label={t('labels.edition')}>
        <CheckboxField
          label={t('controls.autosaveChanges')}
          checked={settings.autosaveThingChanges}
          onChange={(v) => onUpdate('autosaveThingChanges', v)}
        />
      </FieldGroup>

      <FieldGroup label={t('labels.clipboardAction')}>
        <div className="flex flex-col gap-2">
          <SelectField
            label={t('labels.action')}
            value={String(settings.thingListClipboardAction)}
            onChange={(v) => onUpdate('thingListClipboardAction', Number(v))}
            options={clipboardActionOptions}
          />
          <CheckboxField
            label={t('labels.deleteAfterPaste')}
            checked={settings.deleteAfterPaste}
            onChange={(v) => onUpdate('deleteAfterPaste', v)}
          />
        </div>
      </FieldGroup>

      <FieldGroup label={t('labels.listAmount')}>
        <div className="flex flex-col gap-2">
          <NumberInputField
            label={t('labels.objects')}
            value={settings.objectsListAmount}
            onChange={(v) => onUpdate('objectsListAmount', v)}
            min={100}
            max={5000}
            step={50}
          />
          <NumberInputField
            label={t('labels.sprites')}
            value={settings.spritesListAmount}
            onChange={(v) => onUpdate('spritesListAmount', v)}
            min={100}
            max={50000}
            step={50}
          />
        </div>
      </FieldGroup>
    </div>
  )
}

function CustomClientTab({ settings, onUpdate }: TabProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label={t('controls.openNew')}>
        <div className="flex flex-col gap-2">
          <CheckboxField
            label={t('controls.extendedAlwaysSelected')}
            checked={settings.extended}
            onChange={(v) => onUpdate('extended', v)}
          />
          <CheckboxField
            label={t('controls.transparencyAlwaysSelected')}
            checked={settings.transparency}
            onChange={(v) => onUpdate('transparency', v)}
          />
        </div>
      </FieldGroup>
    </div>
  )
}

function SpriteSheetTab({ settings, onUpdate }: TabProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label={t('controls.saveObjectProperties')}>
        <div className="flex flex-col gap-2">
          <RadioField
            label={t('labels.none')}
            name="savingSpriteSheet"
            value="0"
            checked={settings.savingSpriteSheet === 0}
            onChange={() => onUpdate('savingSpriteSheet', 0)}
          />
          <RadioField
            label={t('controls.onlyPatterns')}
            name="savingSpriteSheet"
            value="1"
            checked={settings.savingSpriteSheet === 1}
            onChange={() => onUpdate('savingSpriteSheet', 1)}
          />
          <RadioField
            label={t('controls.allProperties')}
            name="savingSpriteSheet"
            value="2"
            checked={settings.savingSpriteSheet === 2}
            onChange={() => onUpdate('savingSpriteSheet', 2)}
          />
        </div>
      </FieldGroup>
    </div>
  )
}

function ThingsTab({ settings, onUpdate }: TabProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label={t('labels.defaultDurations')}>
        <div className="flex flex-col gap-2">
          <NumberInputField
            label={t('labels.items')}
            value={settings.itemsDuration}
            onChange={(v) => onUpdate('itemsDuration', v)}
            min={0}
            max={1000}
          />
          <NumberInputField
            label={t('labels.outfits')}
            value={settings.outfitsDuration}
            onChange={(v) => onUpdate('outfitsDuration', v)}
            min={0}
            max={1000}
          />
          <NumberInputField
            label={t('labels.effects')}
            value={settings.effectsDuration}
            onChange={(v) => onUpdate('effectsDuration', v)}
            min={0}
            max={1000}
          />
          <NumberInputField
            label={t('labels.missiles')}
            value={settings.missilesDuration}
            onChange={(v) => onUpdate('missilesDuration', v)}
            min={0}
            max={1000}
          />
        </div>
      </FieldGroup>
    </div>
  )
}

function ItemsTab({
  settings,
  onUpdate,
  otbLoaded
}: TabProps & { otbLoaded: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label={t('labels.general')}>
        <CheckboxField
          label={t('thingType.autoCreateMissingServerItems')}
          checked={settings.syncOtbOnAdd}
          onChange={(v) => onUpdate('syncOtbOnAdd', v)}
          disabled={!otbLoaded}
        />
      </FieldGroup>
    </div>
  )
}
