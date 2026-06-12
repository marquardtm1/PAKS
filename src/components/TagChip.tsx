import type { Chip } from '@/lib/tags'

/**
 * Ein Tag-Chip. Gruppen-Chips tragen die Gruppenfarbe (dynamisch → Inline-Style),
 * freie Tags sind neutral (Token-Klassen).
 */
export function TagChip({ chip }: { chip: Chip }) {
  if (chip.colorHex) {
    return (
      <span
        className="bg-tag-bg rounded-[3px] border px-1.5 py-0.5 text-[10px]"
        style={{ borderColor: `${chip.colorHex}66`, color: chip.colorHex }}
      >
        {chip.label}
      </span>
    )
  }
  return (
    <span className="bg-tag-bg text-text-muted border-border rounded-[3px] border px-1.5 py-0.5 text-[10px]">
      {chip.label}
    </span>
  )
}
