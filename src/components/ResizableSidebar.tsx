import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 420

/**
 * Hülle um die Seitenleiste mit Drag-Griff am rechten Rand zum Verstellen der
 * Breite (analog Strukturen-App). Während des Drags wird die Breite direkt am
 * DOM gesetzt (kein Re-Render der Inhalte), erst beim Loslassen über onCommit
 * persistiert.
 */
export function ResizableSidebar({
  width,
  onCommit,
  children,
}: {
  width: number
  onCommit: (width: number) => void
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  )

  const clamp = (w: number) =>
    Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, w))

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current
    if (!wrap) return
    e.preventDefault()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: wrap.getBoundingClientRect().width,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !wrapRef.current) return
    const next = clamp(drag.startWidth + (e.clientX - drag.startX))
    wrapRef.current.style.width = `${next}px`
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Pointer-Capture kann bereits verloren sein.
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (wrapRef.current) {
      onCommit(clamp(wrapRef.current.getBoundingClientRect().width))
    }
    dragRef.current = null
  }

  return (
    <div
      ref={wrapRef}
      style={{ width: `${width}px` }}
      className="relative flex shrink-0"
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite der Seitenleiste anpassen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
        className="group absolute top-0 right-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
      >
        <span
          aria-hidden="true"
          className="group-hover:bg-accent group-active:bg-accent pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors"
        />
      </div>
    </div>
  )
}
