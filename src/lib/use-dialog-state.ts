import { useRef } from 'react'

/**
 * Keeps the last non-null dialog payload available while Radix plays the close animation.
 * `open` tracks the live condition; `data` lags until the next open.
 */
export function useDialogState<T>(active: T | null | undefined): { open: boolean; data: T | null } {
  const cache = useRef<T | null>(active ?? null)
  if (active) cache.current = active
  return {
    open: Boolean(active),
    data: cache.current,
  }
}
