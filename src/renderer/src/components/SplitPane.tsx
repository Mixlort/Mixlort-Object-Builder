/**
 * Horizontal split pane layout with up to four panels (farLeft, left, center, right).
 * Left, right, and optional farLeft panels are resizable via drag handles.
 * Center panel fills remaining space.
 *
 * Ported from legacy HDividedBox (Flex) layout.
 */

import React, { useCallback, useEffect, useRef } from 'react'

interface SplitPaneProps {
  // Far-left panel (optional, e.g. PreviewPanel)
  farLeft?: React.ReactNode
  farLeftWidth?: number
  farLeftMinWidth?: number
  farLeftMaxWidth?: number
  showFarLeft?: boolean
  onFarLeftWidthChange?: (width: number) => void
  // Left panel
  left: React.ReactNode
  center: React.ReactNode
  right: React.ReactNode
  leftWidth: number
  rightWidth: number
  leftMinWidth?: number
  leftMaxWidth?: number
  rightMinWidth?: number
  rightMaxWidth?: number
  showLeft?: boolean
  showRight?: boolean
  onLeftWidthChange?: (width: number) => void
  onRightWidthChange?: (width: number) => void
}

interface DragState {
  side: 'farLeft' | 'left' | 'right'
  startX: number
  startWidth: number
}

export function SplitPane({
  farLeft,
  farLeftWidth = 220,
  farLeftMinWidth = 190,
  farLeftMaxWidth = 700,
  showFarLeft = false,
  onFarLeftWidthChange,
  left,
  center,
  right,
  leftWidth,
  rightWidth,
  leftMinWidth = 190,
  leftMaxWidth = 700,
  rightMinWidth = 190,
  rightMaxWidth = 700,
  showLeft = true,
  showRight = true,
  onLeftWidthChange,
  onRightWidthChange
}: SplitPaneProps): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)

  const handleMouseDown = useCallback(
    (side: 'farLeft' | 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault()
      let startWidth: number
      if (side === 'farLeft') {
        startWidth = farLeftWidth
      } else if (side === 'left') {
        startWidth = leftWidth
      } else {
        startWidth = rightWidth
      }
      dragRef.current = {
        side,
        startX: e.clientX,
        startWidth
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [farLeftWidth, leftWidth, rightWidth]
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const delta = e.clientX - drag.startX
      if (drag.side === 'farLeft') {
        const w = Math.max(farLeftMinWidth, Math.min(farLeftMaxWidth, drag.startWidth + delta))
        onFarLeftWidthChange?.(w)
      } else if (drag.side === 'left') {
        const w = Math.max(leftMinWidth, Math.min(leftMaxWidth, drag.startWidth + delta))
        onLeftWidthChange?.(w)
      } else {
        const w = Math.max(rightMinWidth, Math.min(rightMaxWidth, drag.startWidth - delta))
        onRightWidthChange?.(w)
      }
    }

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [
    farLeftMinWidth,
    farLeftMaxWidth,
    leftMinWidth,
    leftMaxWidth,
    rightMinWidth,
    rightMaxWidth,
    onFarLeftWidthChange,
    onLeftWidthChange,
    onRightWidthChange
  ])

  return (
    <div className="flex h-full overflow-hidden">
      {showFarLeft && farLeft && (
        <>
          <div
            className="h-full shrink-0 overflow-hidden"
            style={{ width: farLeftWidth }}
            data-testid="split-far-left"
          >
            {farLeft}
          </div>
          <div
            className="h-full w-1 shrink-0 cursor-col-resize bg-border-subtle transition-colors hover:bg-accent"
            onMouseDown={(e) => handleMouseDown('farLeft', e)}
            data-testid="split-handle-far-left"
          />
        </>
      )}

      {showLeft && (
        <>
          <div
            className="h-full shrink-0 overflow-hidden"
            style={{ width: leftWidth }}
            data-testid="split-left"
          >
            {left}
          </div>
          <div
            className="h-full w-1 shrink-0 cursor-col-resize bg-border-subtle transition-colors hover:bg-accent"
            onMouseDown={(e) => handleMouseDown('left', e)}
            data-testid="split-handle-left"
          />
        </>
      )}

      <div className="h-full min-w-0 flex-1 overflow-hidden" data-testid="split-center">
        {center}
      </div>

      {showRight && (
        <>
          <div
            className="h-full w-1 shrink-0 cursor-col-resize bg-border-subtle transition-colors hover:bg-accent"
            onMouseDown={(e) => handleMouseDown('right', e)}
            data-testid="split-handle-right"
          />
          <div
            className="h-full shrink-0 overflow-hidden"
            style={{ width: rightWidth }}
            data-testid="split-right"
          >
            {right}
          </div>
        </>
      )}
    </div>
  )
}
