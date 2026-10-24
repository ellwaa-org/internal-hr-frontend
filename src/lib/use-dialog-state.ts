import { useState } from 'react'

/**
 * Keeps the last non-null dialog payload available while Radix plays the close animation.
 * `open` tracks the live condition; `data` lags until the next open.
 */
export function useDialogState<T>(active: T | null | undefined): { open: boolean; data: T | null } {
  const [cached, setCached] = useState<T | null>(active ?? null)
  if (active != null && active !== cached) setCached(active)
  return {
    open: Boolean(active),
    data: active ?? cached,
  }
}
