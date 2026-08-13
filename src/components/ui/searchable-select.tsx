import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SearchableSelectOption = {
  value: string
  label: string
  /** Extra text used only for filtering (e.g. employee code). */
  keywords?: string
}

type SearchableSelectProps = {
  value?: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'اختر…',
  searchPlaceholder = 'بحث بالاسم…',
  emptyText = 'لا توجد نتائج',
  className,
  disabled,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const haystack = `${o.label} ${o.keywords ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) return
      if (event.target instanceof Node && !root.contains(event.target)) {
        close()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(focusTimer)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (open) close()
          else setOpen(true)
        }}
        className={cn(
          'inline-flex h-10 w-full min-w-[220px] cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-border bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:bg-[#fafafa] focus-visible:border-neutral-900 focus-visible:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55',
          open && 'border-neutral-900 shadow-[0_0_0_2px_rgba(17,17,17,0.12)]',
        )}
      >
        <span className={cn('truncate text-start', !selected && 'text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          className="mt-1.5 overflow-hidden rounded-xl border border-border bg-white shadow-popover"
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={searchPlaceholder}
              className="h-8 w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-neutral-400"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="m-0 max-h-60 list-none overflow-auto p-1.5"
          >
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-[13px] text-muted">{emptyText}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value
                return (
                  <li key={option.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm text-foreground outline-none hover:bg-hover focus-visible:bg-hover',
                        isSelected && 'bg-hover',
                      )}
                      onClick={() => {
                        onValueChange(option.value)
                        close()
                      }}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
