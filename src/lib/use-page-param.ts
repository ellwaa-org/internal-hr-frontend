import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

function parsePageParam(value: string | null): number {
  if (value == null || value === '') return 1
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return 1
  return n
}

export function usePageParam(key = 'page') {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePageParam(searchParams.get(key))

  const setPage = useCallback(
    (next: number | ((prev: number) => number)) => {
      setSearchParams((prev) => {
        const current = parsePageParam(prev.get(key))
        const resolved = typeof next === 'function' ? next(current) : next
        const value = Number.isFinite(resolved) ? Math.max(1, Math.trunc(resolved)) : 1
        if (value === current) return prev
        const params = new URLSearchParams(prev)
        if (value <= 1) params.delete(key)
        else params.set(key, String(value))
        return params
      })
    },
    [key, setSearchParams],
  )

  return [page, setPage] as const
}
