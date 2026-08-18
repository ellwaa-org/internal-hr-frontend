export type DayPeriod = 'AM' | 'PM'

export type Time12Parts = {
  hour12: number
  minute: number
  period: DayPeriod
}

const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Convert 24h hour (0–23) to 12h parts. */
export function hour24ToParts(hour24: number, minute: number): Time12Parts {
  const period: DayPeriod = hour24 >= 12 ? 'PM' : 'AM'
  const mod = hour24 % 12
  return {
    hour12: mod === 0 ? 12 : mod,
    minute,
    period,
  }
}

/** Convert 12h parts to `HH:MM:SS` (24h) for the API. */
export function partsToTime24({ hour12, minute, period }: Time12Parts): string {
  let hour24 = hour12 % 12
  if (period === 'PM') hour24 += 12
  return `${pad2(hour24)}:${pad2(minute)}:00`
}

export function parseTimeToParts(value: string | null | undefined): Time12Parts {
  if (!value) return { hour12: 9, minute: 0, period: 'AM' }
  const match = TIME_ONLY_RE.exec(value.trim())
  if (match) {
    return hour24ToParts(Number(match[1]), Number(match[2]))
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return hour24ToParts(date.getHours(), date.getMinutes())
  }
  return { hour12: 9, minute: 0, period: 'AM' }
}

function periodLabel(period: DayPeriod): string {
  return period === 'PM' ? 'مساءً' : 'صباحاً'
}

function formatHourMinute(hour24: number, minute: number): string {
  const { hour12, period } = hour24ToParts(hour24, minute)
  return `${hour12}:${pad2(minute)} ${periodLabel(period)}`
}

/** Format a time-only (`HH:MM[:SS]`) or datetime string as `9:00 صباحاً`. */
export function formatTime12(value?: string | null): string {
  if (!value) return '—'
  const match = TIME_ONLY_RE.exec(value.trim())
  if (match) {
    return formatHourMinute(Number(match[1]), Number(match[2]))
  }
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return formatHourMinute(date.getHours(), date.getMinutes())
  } catch {
    return value
  }
}

/** Local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayIsoDate(): string {
  return toIsoDate(new Date())
}

/** Parse `YYYY-MM-DD` (or datetime) into a local Date at midnight. */
export function parseIsoDate(value: string): Date {
  const dateOnly = value.length <= 10 ? value : value.slice(0, 10)
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Shift an ISO date by `days` (can be negative). */
export function addDaysIso(value: string, days: number): string {
  const date = parseIsoDate(value)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** First day of the month for an ISO date as `YYYY-MM-DD`. */
export function startOfMonthIso(value: string): string {
  const date = parseIsoDate(value)
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** Format a date-only or datetime value for Arabic UI with 12h صباحاً/مساءً time. */
export function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    const dateOnly = value.length <= 10 ? `${value}T00:00:00` : value
    return new Date(dateOnly).toLocaleDateString('ar-EG', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

/** Split a date into weekday + day/month/year for day navigators. */
export function formatDayHeading(value: string): { weekday: string; rest: string } {
  try {
    const date = parseIsoDate(value)
    return {
      weekday: date.toLocaleDateString('ar-EG', { weekday: 'long' }),
      rest: date.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }
  } catch {
    return { weekday: value, rest: '' }
  }
}

export function formatDateTime12(value?: string | null): string {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const datePart = date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    return `${datePart} · ${formatHourMinute(date.getHours(), date.getMinutes())}`
  } catch {
    return value
  }
}

/** `YYYY-MM-DDTHH:mm` in local time, for `<input type="datetime-local">`. */
export function toDateTimeLocalInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${toIsoDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** Convert a datetime-local value to an ISO string for the API. */
export function fromDateTimeLocalInput(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}
