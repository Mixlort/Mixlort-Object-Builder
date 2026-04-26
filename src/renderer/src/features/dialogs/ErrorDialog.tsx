/**
 * Error dialog for displaying error messages.
 * Ported from legacy ErrorWindow.mxml.
 *
 * Supports multiple messages, selectable text, and log file access.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, DialogButton } from '../../components/Modal'

export interface ErrorDialogProps {
  open: boolean
  onClose: () => void
  messages: string[]
}

export function ErrorDialog({ open, onClose, messages }: ErrorDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Modal
      title={t('labels.error')}
      open={open}
      onClose={onClose}
      width={550}
      footer={
        <>
          <DialogButton label={t('labels.ok')} onClick={onClose} primary />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-xs text-text-secondary">{t('labels.noErrors')}</p>
        ) : (
          <textarea
            className="min-h-[200px] w-full resize-y rounded border border-border bg-bg-secondary p-3 font-mono text-xs text-error outline-none focus:border-accent"
            value={messages.join('\n\n')}
            readOnly
          />
        )}
      </div>
    </Modal>
  )
}
