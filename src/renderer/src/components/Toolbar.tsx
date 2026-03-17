/**
 * Main application toolbar with action buttons.
 * Ported from legacy ob/components/Toolbar.as + ToolbarSkin.mxml.
 *
 * Toolbar buttons dispatch MenuAction identifiers matching the native menu
 * system, allowing both toolbar and menu to trigger the same handlers.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  MENU_FILE_NEW,
  MENU_FILE_OPEN,
  MENU_FILE_COMPILE,
  MENU_FILE_COMPILE_AS,
  MENU_TOOLS_OBJECT_VIEWER,
  MENU_TOOLS_SLICER,
  MENU_TOOLS_ANIMATION_EDITOR,
  MENU_WINDOW_LOG,
  type MenuAction
} from '../../../shared/menu-actions'
import { useAppStore, selectIsProjectLoaded } from '../stores'
import {
  IconNewFile,
  IconOpen,
  IconSave,
  IconSaveAs,
  IconViewer,
  IconSlicer,
  IconAnimation,
  IconLog
} from './Icons'

// ---------------------------------------------------------------------------
// Toolbar button primitives
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  icon: React.ReactNode
  title: string
  disabled?: boolean
  onClick: () => void
}

function ToolbarButton({
  icon,
  title,
  disabled = false,
  onClick
}: ToolbarButtonProps): React.JSX.Element {
  return (
    <button
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-all duration-150 hover:bg-bg-hover hover:text-text-primary active:bg-border disabled:opacity-38 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

function ToolbarSeparator(): React.JSX.Element {
  return <div className="mx-1 h-5 w-px bg-border" />
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------

interface ToolbarProps {
  onAction?: (action: MenuAction) => void
}

export function Toolbar({ onAction }: ToolbarProps): React.JSX.Element {
  const { t } = useTranslation()
  const isLoaded = useAppStore(selectIsProjectLoaded)

  const dispatch = (action: MenuAction): void => onAction?.(action)

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-0.5 bg-bg-secondary px-3"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {/* File operations */}
      <ToolbarButton
        icon={<IconNewFile size={16} />}
        title={`${t('menu.new')} (Ctrl+N)`}
        onClick={() => dispatch(MENU_FILE_NEW)}
      />
      <ToolbarButton
        icon={<IconOpen size={16} />}
        title={`${t('menu.open')} (Ctrl+O)`}
        onClick={() => dispatch(MENU_FILE_OPEN)}
      />
      <ToolbarButton
        icon={<IconSave size={16} />}
        title={`${t('menu.compile')} (Ctrl+S)`}
        disabled={!isLoaded}
        onClick={() => dispatch(MENU_FILE_COMPILE)}
      />
      <ToolbarButton
        icon={<IconSaveAs size={16} />}
        title={`${t('menu.compileAs')} (Ctrl+Shift+S)`}
        disabled={!isLoaded}
        onClick={() => dispatch(MENU_FILE_COMPILE_AS)}
      />

      <ToolbarSeparator />

      {/* Tool launchers */}
      <ToolbarButton
        icon={<IconViewer size={16} />}
        title={t('labels.objectViewer')}
        onClick={() => dispatch(MENU_TOOLS_OBJECT_VIEWER)}
      />
      <ToolbarButton
        icon={<IconSlicer size={16} />}
        title={t('labels.sprites')}
        onClick={() => dispatch(MENU_TOOLS_SLICER)}
      />
      <ToolbarButton
        icon={<IconAnimation size={16} />}
        title={t('labels.animationEditor')}
        onClick={() => dispatch(MENU_TOOLS_ANIMATION_EDITOR)}
      />

      <ToolbarSeparator />

      {/* Utilities */}
      <ToolbarButton
        icon={<IconLog size={16} />}
        title={`${t('controls.logWindow')} (Ctrl+L)`}
        onClick={() => dispatch(MENU_WINDOW_LOG)}
      />
    </div>
  )
}
