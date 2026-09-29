import { getSsoConfig, ssoCallback, ssoRefresh, ssoLogout } from '@/lib/api'

/**
 * Central SSO (Account Manager IdP) client for the HR satellite.
 *
 * Flow (same pattern as the LOHO satellite):
 *  1. `startSsoLogin()` sends the browser to the IdP authorize endpoint with a
 *     random `state` (kept in sessionStorage).
 *  2. The IdP redirects back to /auth/callback?code&state.
 *  3. `completeSsoLogin()` POSTs the code to OUR backend
 *     (/api/auth/sso/callback), which exchanges it confidentially and returns
 *     the HR session.
 */

const STATE_KEY = 'hr-sso-state'
const RETURN_TO_KEY = 'hr-sso-return-to'
export const SSO_CALLBACK_PATH = '/auth/callback'
const TOKENS_KEY = 'hr-sso-tokens'
/** Set after a deliberate sign-out so silent auto-login doesn't loop. */
const AUTO_DISABLED_KEY = 'hr-sso-auto-disabled'

export interface SsoConfig {
  enabled: boolean
  issuer: string
  authorizeUrl: string
  clientId: string
  systemCode: string
}

let cachedConfig: SsoConfig | null = null

export async function loadSsoConfig(): Promise<SsoConfig> {
  if (cachedConfig) return cachedConfig
  try {
    const body = (await getSsoConfig()) as { data: Partial<SsoConfig> }
    cachedConfig = {
      enabled: Boolean(body?.data?.enabled),
      issuer: String(body?.data?.issuer ?? ''),
      authorizeUrl: String(body?.data?.authorizeUrl ?? ''),
      clientId: String(body?.data?.clientId ?? ''),
      systemCode: String(body?.data?.systemCode ?? 'HR'),
    }
  } catch {
    cachedConfig = { enabled: false, issuer: '', authorizeUrl: '', clientId: '', systemCode: 'HR' }
  }
  return cachedConfig
}

export function isSsoAutoDisabled(): boolean {
  try {
    return sessionStorage.getItem(AUTO_DISABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setSsoAutoDisabled(): void {
  try {
    sessionStorage.setItem(AUTO_DISABLED_KEY, '1')
  } catch {
    /* private mode */
  }
}

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function ssoRedirectUri(): string {
  return `${window.location.origin}${SSO_CALLBACK_PATH}`
}

export function startSsoLogin(returnTo?: string): void {
  const state = randomState()
  try {
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(RETURN_TO_KEY, returnTo ?? '/')
  } catch {
    /* private mode */
  }
  const authorize = new URL(cachedConfig?.authorizeUrl ?? '')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', cachedConfig?.clientId ?? '')
  authorize.searchParams.set('redirect_uri', ssoRedirectUri())
  authorize.searchParams.set('scope', 'openid profile email')
  authorize.searchParams.set('state', state)
  window.location.assign(authorize.toString())
}

function consumeSsoState(): string | null {
  try {
    return sessionStorage.getItem(STATE_KEY)
  } catch {
    return null
  }
}

function clearSsoState(): void {
  try {
    sessionStorage.removeItem(STATE_KEY)
  } catch {
    /* ignore */
  }
}

function consumeSsoReturnTo(): string {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
  } catch {
    /* ignore */
  }
  if (!stored || !stored.startsWith('/') || stored.startsWith('//')) return '/'
  if (stored.startsWith(SSO_CALLBACK_PATH)) return '/'
  return stored
}

export interface StoredTokens {
  accessToken: string
  refreshToken: string | null
}

function readStore(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function getSsoTokens(): StoredTokens | null {
  const raw = readStore(localStorage, TOKENS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    if (parsed?.accessToken) {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken ?? null }
    }
  } catch {
    /* fallthrough */
  }
  return null
}

export function storeSsoTokens(tokens: StoredTokens): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  } catch {
    /* ignore */
  }
}

export function clearSsoTokens(): void {
  try {
    localStorage.removeItem(TOKENS_KEY)
  } catch {
    /* ignore */
  }
}

export interface SsoLoginResult {
  accessToken: string
  refreshToken: string | null
  user: { id: number; employeeCode: string; role: string; fullName: string }
}

export async function completeSsoLogin(code: string): Promise<SsoLoginResult> {
  const body = (await ssoCallback(code, ssoRedirectUri())) as {
    data: SsoLoginResult
  }
  storeSsoTokens({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken ?? null })
  return body.data
}

let refreshInFlight: Promise<string | null> | null = null

/** Single-flight silent refresh; resolves the new access token or null. */
export async function silentRefresh(): Promise<string | null> {
  const tokens = getSsoTokens()
  if (!tokens?.refreshToken) return null
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    try {
      const body = (await ssoRefresh(tokens.refreshToken as string)) as {
        data: { accessToken: string; refreshToken?: string }
      }
      storeSsoTokens({
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken ?? tokens.refreshToken,
      })
      return body.data.accessToken
    } catch {
      clearSsoTokens()
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export async function ssoSignOut(): Promise<void> {
  const tokens = getSsoTokens()
  setSsoAutoDisabled()
  try {
    if (tokens?.refreshToken) {
      await ssoLogout(tokens.refreshToken)
    }
  } catch {
    /* best effort — IdP revocation */
  } finally {
    clearSsoTokens()
  }
}

export { consumeSsoState, clearSsoState, consumeSsoReturnTo }