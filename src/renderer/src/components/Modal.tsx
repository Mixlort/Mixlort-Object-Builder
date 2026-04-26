/**
 * Reusable modal dialog component — Material Design style.
 * Renders a centered overlay with backdrop, title bar, and content area.
 * Closes on Escape key or backdrop click (optional).
 */

import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClose } from './Icons'

interface ModalProps {
  title?: string
  open: boolean
  onClose: () => void
  width?: number
  children: React.ReactNode
  footer?: React.ReactNode
  closeOnBackdrop?: boolean
  bodyScrollable?: boolean
}

export function Modal({
  title = '',
  open,
  onClose,
  width = 480,
  children,
  footer,
  closeOnBackdrop = true,
  bodyScrollable = true
}: ModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Focus trap: focus the dialog when opened
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[90vh] flex-col rounded-2xl bg-bg-secondary"
        style={{ width, boxShadow: 'var(--shadow-dialog)' }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Title bar — Material Design dialog header */}
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-medium text-text-primary">{title}</h2>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            onClick={onClose}
            title={t('labels.close')}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 px-6 py-3 ${bodyScrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {children}
        </div>

        {/* Footer — Material Design dialog actions */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared dialog sub-components — Material Design style
// ---------------------------------------------------------------------------

interface DialogButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}

export function DialogButton({
  label,
  onClick,
  disabled = false,
  primary = false
}: DialogButtonProps): React.JSX.Element {
  const base =
    'h-9 px-6 rounded-full text-sm font-medium tracking-wide transition-all duration-150 disabled:opacity-38 disabled:cursor-not-allowed cursor-pointer'
  const style = primary
    ? `${base} bg-accent text-bg-primary hover:brightness-110 active:brightness-90`
    : `${base} text-accent hover:bg-accent-subtle active:bg-accent-subtle/30`

  return (
    <button className={style} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}

interface FieldGroupProps {
  label: string
  children: React.ReactNode
  compact?: boolean
}

export function FieldGroup({
  label,
  children,
  compact = false
}: FieldGroupProps): React.JSX.Element {
  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-2'}>
      <span
        className={
          compact
            ? 'text-[11px] font-medium uppercase tracking-wider text-text-secondary'
            : 'text-xs font-medium uppercase tracking-wider text-text-secondary'
        }
      >
        {label}
      </span>
      <div className={compact ? 'rounded-xl border border-border p-2.5' : 'rounded-xl border border-border p-3'}>
        {children}
      </div>
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  compact?: boolean
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  compact = false
}: SelectFieldProps): React.JSX.Element {
  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
      <label
        className={
          compact
            ? 'min-w-[94px] text-[11px] text-text-secondary'
            : 'min-w-[100px] text-xs text-text-secondary'
        }
      >
        {label}
      </label>
      <select
        className={
          compact
            ? 'h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg-input px-3 text-[11px] text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-38 disabled:cursor-not-allowed'
            : 'min-w-0 flex-1 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-38 disabled:cursor-not-allowed'
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  compact?: boolean
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled = false,
  compact = false
}: CheckboxFieldProps): React.JSX.Element {
  return (
    <label
      className={`flex cursor-pointer items-center rounded-lg text-text-primary transition-colors hover:bg-bg-hover ${compact ? 'gap-2 px-0.5 py-0.5 text-[11px]' : 'gap-2.5 px-1 py-1 text-xs'} ${disabled ? 'cursor-not-allowed opacity-38' : ''}`}
    >
      <input
        type="checkbox"
        className={compact ? 'h-4 w-4 accent-accent' : 'h-[18px] w-[18px] accent-accent'}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  )
}

interface TextInputFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
}

export function TextInputField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  readOnly = false
}: TextInputFieldProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <label className="min-w-[100px] text-xs text-text-secondary">{label}</label>
      <input
        type="text"
        className="flex-1 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent read-only:text-text-secondary disabled:opacity-38 disabled:cursor-not-allowed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
      />
    </div>
  )
}

interface BrowseFieldProps {
  label: string
  value: string
  onBrowse: () => void
  placeholder?: string
  compact?: boolean
}

export function BrowseField({
  label,
  value,
  onBrowse,
  placeholder = 'Select folder...',
  compact = false
}: BrowseFieldProps): React.JSX.Element {
  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
      <label
        className={
          compact
            ? 'min-w-[94px] text-[11px] text-text-secondary'
            : 'min-w-[100px] text-xs text-text-secondary'
        }
      >
        {label}
      </label>
      <input
        type="text"
        className={
          compact
            ? 'h-10 flex-1 rounded-lg border border-border bg-bg-input px-3 text-[11px] text-text-secondary outline-none'
            : 'flex-1 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-secondary outline-none'
        }
        value={value}
        readOnly
        placeholder={placeholder}
      />
      <button
        className={
          compact
            ? 'h-10 shrink-0 rounded-full border border-border px-4 text-[11px] font-medium text-text-primary transition-colors hover:bg-bg-hover active:bg-bg-tertiary'
            : 'shrink-0 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-hover active:bg-bg-tertiary'
        }
        onClick={onBrowse}
      >
        Browse
      </button>
    </div>
  )
}

interface InfoRowProps {
  label: string
  value: string | number
  compact?: boolean
}

export function InfoRow({ label, value, compact = false }: InfoRowProps): React.JSX.Element {
  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
      <span
        className={
          compact
            ? 'min-w-[94px] text-[11px] text-text-secondary'
            : 'min-w-[100px] text-xs text-text-secondary'
        }
      >
        {label}
      </span>
      <span className={compact ? 'text-[11px] font-medium text-text-primary' : 'text-xs font-medium text-text-primary'}>
        {value}
      </span>
    </div>
  )
}

interface NumberInputFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}

export function NumberInputField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false
}: NumberInputFieldProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <label className="min-w-[100px] text-xs text-text-secondary">{label}</label>
      <input
        type="number"
        className="w-24 rounded-lg border border-border bg-bg-input px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-38 disabled:cursor-not-allowed"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  )
}

interface RadioFieldProps {
  label: string
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  disabled?: boolean
}

export function RadioField({
  label,
  name,
  value,
  checked,
  onChange,
  disabled = false
}: RadioFieldProps): React.JSX.Element {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-xs text-text-primary transition-colors hover:bg-bg-hover ${disabled ? 'cursor-not-allowed opacity-38' : ''}`}
    >
      <input
        type="radio"
        className="h-[18px] w-[18px] accent-accent"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  )
}
