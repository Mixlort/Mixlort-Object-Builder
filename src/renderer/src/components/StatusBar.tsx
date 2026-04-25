/**
 * Application status bar displaying project information.
 * Shows project name, version, category counts, and sprite count.
 *
 * Ported from legacy ObjectBuilder.mxml status area + FilesInfoPanel.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAppStore,
  selectProject,
  selectClientInfo,
  selectCurrentCategory,
  selectSpriteCount,
  selectIsProjectLoaded
} from '../stores'

function StatusItem({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="text-text-secondary">{children}</span>
}

function StatusSep(): React.JSX.Element {
  return <span className="text-text-muted">|</span>
}

export function StatusBar(): React.JSX.Element {
  const { t } = useTranslation()
  const project = useAppStore(selectProject)
  const clientInfo = useAppStore(selectClientInfo)
  const isLoaded = useAppStore(selectIsProjectLoaded)
  const category = useAppStore(selectCurrentCategory)
  const spriteCount = useAppStore(selectSpriteCount)

  return (
    <div className="flex h-7 shrink-0 items-center gap-2.5 bg-bg-tertiary px-4 text-[11px]">
      {isLoaded ? (
        <>
          <StatusItem>
            <span className="font-medium text-text-primary">
              {project.fileName || t('app.untitled')}
            </span>
            {project.changed && <span className="ml-0.5 text-warning">*</span>}
          </StatusItem>
          {clientInfo && (
            <>
              <StatusSep />
              <StatusItem>v{clientInfo.clientVersionStr}</StatusItem>
              <StatusSep />
              <StatusItem>
                {t('labels.items')}: {clientInfo.maxItemId - clientInfo.minItemId + 1}
              </StatusItem>
              <StatusItem>
                {t('labels.outfits')}: {clientInfo.maxOutfitId - clientInfo.minOutfitId + 1}
              </StatusItem>
              <StatusItem>
                {t('labels.effects')}: {clientInfo.maxEffectId - clientInfo.minEffectId + 1}
              </StatusItem>
              <StatusItem>
                {t('labels.missiles')}: {clientInfo.maxMissileId - clientInfo.minMissileId + 1}
              </StatusItem>
              <StatusSep />
              <StatusItem>
                {t('labels.sprites')}: {spriteCount}
              </StatusItem>
              {clientInfo.readOnly && (
                <>
                  <StatusSep />
                  <StatusItem>PXG read-only</StatusItem>
                </>
              )}
            </>
          )}
          <span className="ml-auto text-[11px] font-medium capitalize text-accent">{category}</span>
        </>
      ) : (
        <span className="text-text-muted">{t('app.noProjectLoaded')}</span>
      )}
    </div>
  )
}
