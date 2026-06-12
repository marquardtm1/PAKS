import { useEffect, useRef, useState } from 'react'

/**
 * Inline editierbarer Text: lokaler Entwurf, Commit bei Blur oder Enter, Esc
 * verwirft. Verhindert Kaskaden-Updates während des Tippens. Geteilt von
 * Settings-Modal und Sidebar.
 *
 * - autoSize: Breite wächst mit dem Inhalt (für kompakte Wert-Pills).
 * - autoFocus: bei Einstieg fokussieren + Text markieren (Sidebar-Edit-Modus).
 * - onExit: nach Blur/Esc aufgerufen, damit der Aufrufer den Edit-Modus verlässt.
 */
export function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  autoSize = false,
  autoFocus = false,
  onExit,
  style,
}: {
  value: string
  onCommit: (next: string) => void
  className?: string
  placeholder?: string
  autoSize?: boolean
  autoFocus?: boolean
  onExit?: () => void
  style?: React.CSSProperties
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.select()
  }, [autoFocus])

  function commit() {
    const v = draft.trim()
    if (v && v !== value) onCommit(v)
    else setDraft(value)
  }

  return (
    <input
      ref={ref}
      autoFocus={autoFocus}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        commit()
        onExit?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      placeholder={placeholder}
      className={className}
      style={{ ...style, ...(autoSize ? { width: `${Math.max(4, draft.length + 1)}ch` } : null) }}
    />
  )
}
