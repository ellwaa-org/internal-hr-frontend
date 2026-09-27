# Internal HR System

Arabic web panel for **ADMIN** and **HR** at اللواء للخدمات القانونية. Employees use the mobile app. Both talk to the same HR API.

This repository contains the web frontend only.

## Sign in

Opening the website displays the employee-code/password login form immediately. Enter an existing ADMIN or HR account to access the panel.

The app sends credentials to `POST /api/auth/login`, stores the returned HR access token, and checks `GET /api/auth/profile` using `Authorization: Bearer {accessToken}`. EMPLOYEE accounts cannot access this panel. Signing out clears the stored token and returns to the login form.

A saved session is checked when the app opens. Invalid or expired sessions return to the login form. The HR API must be reachable for login and data operations.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Browser requests to `/api` are forwarded by Vite to `API_PROXY_TARGET`. This variable is server-side only; do not prefix it with `VITE_`.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Frontend, inlined at build time | Use `/api` for local Vite and Docker/Coolify. |
| `API_PROXY_TARGET` | Vite / nginx runtime | Upstream HR API origin, such as `https://hr-api.ellwaa.com`, without `/api`. |
| `PORT` | nginx runtime | Listening port, default `3000`. |

Copy `.env.example` to `.env` for local Vite. Copy `.env.docker.example` to `.env.docker` for Compose.

## Docker and Coolify

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

App: [http://localhost:3000](http://localhost:3000). Health check: `GET /healthz`.

For Coolify, use the Dockerfile build pack and expose port `3000`. Set `VITE_API_URL=/api` at build time, and `PORT=3000` and `API_PROXY_TARGET=https://hr-api.ellwaa.com` at runtime.

Production nginx forwards `/api/` requests to the HR API, preserving the path, request body, query string, and authorization header. Other routes serve the frontend. This keeps browser API calls on the website origin. Rebuild and redeploy after changing `VITE_API_URL` or upgrading the nginx template; restart/redeploy after changing `API_PROXY_TARGET`.

An nginx HTML `405` on login indicates that an old static-only deployment is handling the API POST. A `502` or `503` after proxying indicates an upstream connectivity or availability problem; check the HR API container and its domain routing.

## Scripts

```bash
npm run dev      # Vite
npm run build    # Typecheck and production bundle
npm run preview  # Serve the production bundle
npm run lint
```
