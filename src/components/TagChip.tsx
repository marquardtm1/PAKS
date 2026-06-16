import type { Chip } from '@/lib/tags'

/**
 * Ein Tag-Chip. Gruppen-Chips tragen die Gruppenfarbe (dynamisch → Inline-Style),
 * freie Tags sind neutral (Token-Klassen).
 *
 * `truncate`: einzeilige Kürzung mit Ellipsis (für die feste Tag-Zone der Grid-
 * Kacheln, damit ein langer Tag die Zeile nicht sprengt). Voller Text per title.
 */
export function TagChip({ chip, truncate = false }: { chip: Chip; truncate?: boolean }) {
  const base = 'bg-tag-bg rounded-[3px] border px-1.5 py-0.5 text-[10px]'
  const trunc = truncate ? ' inline-block max-w-[7rem] truncate align-middle' : ''
  if (chip.colorHex) {
    return (
      <span
        className={base + trunc}
        style={{ borderColor: `${chip.colorHex}66`, color: chip.colorHex }}
        title={truncate ? chip.label : undefined}
      >
        {chip.label}
      </span>
    )
  }
  return (
    <span
      className={`${base} text-text-muted border-border${trunc}`}
      title={truncate ? chip.label : undefined}
    >
      {chip.label}
    </span>
  )
}
