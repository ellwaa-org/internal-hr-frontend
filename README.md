# Internal HR System

Arabic web panel for **ADMIN** and **HR** at اللواء للخدمات القانونية. Employees use the mobile app. Both talk to the same HR API.

This repo is the web frontend only.

## Who can sign in

Only `ADMIN` and `HR`. An `EMPLOYEE` account can authenticate, but the panel signs them out.

Two login methods on the same screen:

| Method | How | Notes |
| --- | --- | --- |
| Local | Employee code + password | Unchanged. `deviceId` is sent for EMPLOYEE accounts only (the API ignores it for ADMIN/HR). |
| SSO | **تسجيل الدخول عبر SSO** | Opens the API, then the IdP. The API exchanges the OIDC code. This app stores the **HR JWT**, never the IdP token. |

After either login the app calls `GET /api/auth/profile` with `Authorization: Bearer {accessToken}`.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

`API_PROXY_TARGET` is server-side only (Vite proxy). Browser requests go to `/api` and are forwarded to that host. Do not name it `VITE_API_PROXY_TARGET` or the API host is baked into the JS bundle.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Frontend (inlined at build) | API prefix. Default `/api`. SSO start is `{VITE_API_URL}/auth/sso?redirect=true`. |
| `API_PROXY_TARGET` | Vite / nginx only | Upstream HR API, e.g. `https://hr-api-staging.ellwaa.com`. |

Copy `.env.example` → `.env` for local Vite. Copy `.env.docker.example` → `.env.docker` for Compose.

## SSO (backend)

The web app uses the **API callback** flow. Do not point `OIDC_REDIRECT_URI` at this SPA.

On the HR API, set:

```env
OIDC_REDIRECT_URI={API_URL}/api/auth/sso/callback
OIDC_FRONTEND_REDIRECT=https://YOUR_WEB_ORIGIN/auth/sso
```

Allow every origin this panel is served from, including local if you test SSO on Vite:

- `https://YOUR_WEB_ORIGIN/auth/sso`
- `http://127.0.0.1:5173/auth/sso`
- `http://localhost:5173/auth/sso`

If `returnTo` is not allowlisted, the login page stays up and shows an error. Local code/password login still works.

SSO callback route: `/auth/sso`. The API redirects here with `accessToken` or `ssoError`. The token is stripped from the address bar after it is saved.

If SSO is not configured (`503`), the SSO button is hidden.

## Docker

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

App: [http://localhost:3000](http://localhost:3000). Health check: `GET /healthz`.

Coolify: Dockerfile, port `3000`, runtime `API_PROXY_TARGET` (not build-time), optional build-time `VITE_API_URL=/api`.

## Scripts

```bash
npm run dev      # Vite
npm run build    # typecheck + production bundle
npm run preview  # serve the production bundle
npm run lint
```
