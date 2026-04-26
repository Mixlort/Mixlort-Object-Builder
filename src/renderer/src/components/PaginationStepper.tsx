/**
 * Pagination stepper with 7 controls: first, prev-page, prev, text-input, next, next-page, last.
 *
 * Ported from legacy AS3: otlib/components/AmountNumericStepper.as
 * The legacy stepper had 7 buttons arranged horizontally with a central text input
 * for direct ID entry and page-skip buttons for bulk navigation.
 */

import React, { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export interface PaginationStepperProps {
  /** Current value (e.g., selected thing ID or sprite index) */
  value: number
  /** Minimum allowed value */
  min: number
  /** Maximum allowed value */
  max: number
  /** Page jump size for page-skip buttons */
  pageSize: number
  /** Called when the value changes */
  onChange: (value: number) => void
  /** Whether the entire stepper is disabled */
  disabled?: boolean
}

export function PaginationStepper({
  value,
  min,
  max,
  pageSize,
  onChange,
  disabled = false
}: PaginationStepperProps): React.JSX.Element {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState(String(value))

  // Sync input text when controlled value changes externally
  useEffect(() => {
    setInputValue(String(value))
  }, [value])

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max])

  const handleFirst = useCallback(() => onChange(min), [onChange, min])
  const handlePrevPage = useCallback(
    () => onChange(clamp(value - pageSize)),
    [onChange, value, pageSize, clamp]
  )
  const handlePrev = useCallback(() => onChange(clamp(value - 1)), [onChange, value, clamp])
  const handleNext = useCallback(() => onChange(clamp(value + 1)), [onChange, value, clamp])
  const handleNextPage = useCallback(
    () => onChange(clamp(value + pageSize)),
    [onChange, value, pageSize, clamp]
  )
  const handleLast = useCallback(() => onChange(max), [onChange, max])

  const handleInputSubmit = useCallback(() => {
    const parsed = parseInt(inputValue, 10)
    if (!isNaN(parsed)) {
      onChange(clamp(parsed))
    } else {
      setInputValue(String(value))
    }
  }, [inputValue, onChange, clamp, value])

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        handleInputSubmit()
      }
    },
    [handleInputSubmit]
  )

  const atMin = disabled || value <= min
  const atMax = disabled || value >= max

  const btnClass =
    'flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none shrink-0'

  return (
    <div
      className="flex w-full items-center justify-center gap-0.5"
      data-testid="pagination-stepper"
    >
      <button
        type="button"
        className={btnClass}
        onClick={handleFirst}
        disabled={atMin}
        title={t('labels.first')}
        data-testid="page-first"
      >
        |&lsaquo;
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={handlePrevPage}
        disabled={atMin}
        title={t('labels.previousPage')}
        data-testid="page-prev-page"
      >
        &laquo;
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={handlePrev}
        disabled={atMin}
        title={t('labels.previous')}
        data-testid="page-prev"
      >
        &lsaquo;
      </button>
      <input
        type="number"
        className="mx-1 h-6 w-16 rounded border border-border bg-bg-primary px-1 text-center text-xs text-text-primary outline-none focus:border-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleInputSubmit}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        data-testid="page-input"
      />
      <button
        type="button"
        className={btnClass}
        onClick={handleNext}
        disabled={atMax}
        title={t('labels.next')}
        data-testid="page-next"
      >
        &rsaquo;
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={handleNextPage}
        disabled={atMax}
        title={t('labels.nextPage')}
        data-testid="page-next-page"
      >
        &raquo;
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={handleLast}
        disabled={atMax}
        title={t('labels.last')}
        data-testid="page-last"
      >
        &rsaquo;|
      </button>
    </div>
  )
}
