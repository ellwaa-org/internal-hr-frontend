import { setToken } from '@/lib/api'
import { translateErrorMessage } from '@/lib/errors'

export type SsoCallback = {
  accessToken: string | null
  ssoError: string | null
}

let consumed: SsoCallback | null = null

export function decodeSsoQueryValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function stripSsoParamsFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('accessToken')
  url.searchParams.delete('ssoError')
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  const search = url.searchParams.toString()
  const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function consumeSsoCallback(): SsoCallback {
  if (consumed) return consumed

  const params = new URLSearchParams(window.location.search)
  const accessToken = params.get('accessToken')
  const rawError = params.get('ssoError')

  if (accessToken || rawError) {
    stripSsoParamsFromUrl()
  }

  if (accessToken) {
    setToken(accessToken)
  }

  consumed = {
    accessToken,
    ssoError: rawError
      ? translateErrorMessage(decodeSsoQueryValue(rawError))
      : null,
  }
  return consumed
}
