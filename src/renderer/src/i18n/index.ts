/**
 * i18n configuration for Object Builder.
 *
 * Uses i18next + react-i18next for internationalization.
 * Translations are loaded from JSON files in locales/ directory.
 *
 * Supported languages:
 * - en_US (English)
 * - es_ES (Spanish)
 * - pt_BR (Portuguese - Brazil)
 *
 * The language setting is persisted in ObjectBuilderSettings.language
 * and synced with Electron settings via IPC.
 *
 * Legacy equivalence:
 * - AS3 ResourceManager + strings.properties -> i18next + JSON
 * - Resources.getString(key, ...args) -> t(key, { 0: arg0, 1: arg1 })
 * - @Resource(key='x', bundle='strings') -> useTranslation() + t('x')
 * - Resources.locale = 'pt_BR' -> i18n.changeLanguage('pt_BR')
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en_US from './locales/en_US.json'
import es_ES from './locales/es_ES.json'
import pt_BR from './locales/pt_BR.json'

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'es_ES', label: 'Español' },
  { code: 'pt_BR', label: 'Português (BR)' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: SupportedLanguage = 'pt_BR'

// ---------------------------------------------------------------------------
// i18next initialization
// ---------------------------------------------------------------------------

i18n.use(initReactI18next).init({
  resources: {
    en_US: { translation: en_US },
    es_ES: { translation: es_ES },
    pt_BR: { translation: pt_BR }
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,

  interpolation: {
    // React already escapes values, no need for i18next to do it
    escapeValue: false
  }
})

export default i18n
