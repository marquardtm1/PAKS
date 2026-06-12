'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import type { SchemaRow } from '@/lib/schemas'
import { OutlineNav } from './outline-nav'
import { SchemaList } from './schema-list'

const MIN_TOP_HEIGHT = 120
const MIN_BOTTOM_HEIGHT = 160
const DEFAULT_SPLIT_RATIO = 0.4
const SPLIT_RATIO_KEY = 'sidebar:split-ratio'

export function Sidebar({
  schemas,
  accessibleSet,
  previewUrlByFilename,
  selectedSchemaSlug,
  activeCategory,
  sort,
  query,
  onQueryChange,
  searchInputRef,
  onNavigate,
  isAnonymous,
  availableCategories,
}: {
  schemas: SchemaRow[]
  accessibleSet: Set<string>
  previewUrlByFilename: Record<string, string>
  selectedSchemaSlug: string | null
  activeCategory: string | null
  sort: string
  query: string
  onQueryChange: (next: string) => void
  searchInputRef: Ref<HTMLInputElement>
  onNavigate?: () => void
  isAnonymous: boolean
  availableCategories: Set<string>
}) {
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const topBlockRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState<number>(DEFAULT_SPLIT_RATIO)
  // Drag-Daten in einem Ref, damit pointermove keinen Re-Render auslöst.
  // Höhe des Containers wird beim Drag-Start gesnapshotted und auf das
  // ganze Move-Fenster angewendet.
  const splitDragRef = useRef<{
    pointerId: number
    startY: number
    startTopHeight: number
    containerHeight: number
  } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SPLIT_RATIO_KEY)
      if (raw == null) return
      const n = Number.parseFloat(raw)
      if (Number.isNaN(n) || n <= 0 || n >= 1) return
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplitRatio(n)
    } catch {
      // localStorage kann in Privacy-Modi werfen — Default beibehalten.
    }
  }, [])

  const onSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = splitContainerRef.current
    const top = topBlockRef.current
    if (!container || !top) return
    event.preventDefault()
    splitDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTopHeight: top.getBoundingClientRect().height,
      containerHeight: container.getBoundingClientRect().height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
  }

  const onSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = splitDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dy = event.clientY - drag.startY
    const maxTop = Math.max(
      MIN_TOP_HEIGHT,
      drag.containerHeight - MIN_BOTTOM_HEIGHT,
    )
    const next = Math.max(
      MIN_TOP_HEIGHT,
      Math.min(maxTop, drag.startTopHeight + dy),
    )
    if (topBlockRef.current) {
      topBlockRef.current.style.flexBasis = `${next}px`
    }
  }

  const onSplitPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = splitDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer-Capture kann bereits verloren sein (z.B. Pointer-Cancel).
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (topBlockRef.current && drag.containerHeight > 0) {
      const finalHeight = topBlockRef.current.getBoundingClientRect().height
      const ratio = Math.max(
        0.05,
        Math.min(0.95, finalHeight / drag.containerHeight),
      )
      setSplitRatio(ratio)
      try {
        localStorage.setItem(SPLIT_RATIO_KEY, ratio.toFixed(4))
      } catch {
        // Persistierung darf nicht crashen.
      }
    }
    splitDragRef.current = null
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <SearchInput
          ref={searchInputRef}
          value={query}
          onChange={onQueryChange}
        />
      </div>
      <div
        ref={splitContainerRef}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={topBlockRef}
          style={{ flexBasis: `${splitRatio * 100}%` }}
          className="min-h-[120px] shrink-0 grow-0 overflow-y-auto"
        >
          <OutlineNav
            activeCategory={activeCategory}
            isAnonymous={isAnonymous}
            availableCategories={availableCategories}
          />
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Aufteilung von Kategorien und Schema-Liste anpassen"
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerUp}
          style={{ touchAction: 'none' }}
          className="group relative h-1.5 shrink-0 cursor-row-resize"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200 transition-colors group-hover:bg-blue-500 group-active:bg-blue-500 dark:bg-slate-800"
          />
        </div>
        <div className="flex min-h-[160px] flex-1 flex-col overflow-hidden">
          <SchemaList
            schemas={schemas}
            accessibleSet={accessibleSet}
            previewUrlByFilename={previewUrlByFilename}
            selectedSchemaSlug={selectedSchemaSlug}
            activeCategory={activeCategory}
            sort={sort}
            query={query}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </div>
  )
}

function SearchInput({
  ref,
  value,
  onChange,
}: {
  ref: Ref<HTMLInputElement>
  value: string
  onChange: (next: string) => void
}) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    // ESC im fokussierten Suchfeld betrifft nur das Feld — kein Durchschlagen
    // auf den globalen ZoomImage-ESC-Handler. Nach dem blur() landet ein
    // zweites ESC ohne Ziel und kann regulär den Zoom resetten.
    event.preventDefault()
    event.stopPropagation()
    onChange('')
    event.currentTarget.blur()
  }

  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Schema suchen…"
        aria-label="Schema suchen"
        autoComplete="off"
        spellCheck={false}
        className="block w-full rounded-md border border-slate-300 bg-white py-2 pr-9 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Suche löschen"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
