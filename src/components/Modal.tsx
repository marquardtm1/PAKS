import { useEffect, type ReactNode } from 'react'

/**
 * Generischer Modal-Rahmen: abgedunkeltes Overlay, Panel mit Kopfzeile +
 * Schließen-Button, Esc und Klick auf den Hintergrund schließen. In der Shell
 * ist immer höchstens ein Modal offen.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 540,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  maxWidth?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-surface border-border flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--radius-modal)] border"
        style={{ maxWidth }}
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-text-muted hover:text-text px-1.5 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="border-border flex justify-end gap-2 border-t px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Einheitlicher Button für Modal-Footer & -Aktionen. */
export function ModalButton({
  variant = 'default',
  onClick,
  children,
  style,
  disabled = false,
}: {
  variant?: 'default' | 'primary'
  onClick?: () => void
  children: ReactNode
  style?: React.CSSProperties
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? undefined : style}
      className={[
        'inline-flex items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors',
        disabled
          ? 'bg-surface-2 border-border text-text-muted cursor-default opacity-60'
          : variant === 'primary'
            ? 'bg-accent border-accent hover:bg-accent-hover text-white'
            : 'bg-surface-2 border-border text-text hover:border-accent',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
