import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// Initialize i18n so that useTranslation() works in component tests
import i18n from '../i18n'

beforeEach(async (context) => {
  const fileName = context.task.file?.name ?? ''
  const language =
    fileName.endsWith('SpritePanel.test.tsx') || fileName.endsWith('ThingListPanel.test.tsx')
      ? 'pt_BR'
      : 'en_US'
  await i18n.changeLanguage(language)
})

// Polyfill ResizeObserver for jsdom (used by ThingListPanel virtual scroll)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}
