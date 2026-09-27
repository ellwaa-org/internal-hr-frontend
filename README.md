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
| `VITE_API_URL` | Frontend, inlined at build time | Complete API base including `/api`. Use `/api` for local Vite development, or `https://hr-api.ellwaa.com/api` for Docker/Coolify. |
| `API_PROXY_TARGET` | Vite only | Upstream HR API origin, such as `https://hr-api.ellwaa.com`. |
| `PORT` | nginx runtime | Listening port, default `3000`. |

Copy `.env.example` to `.env` for local Vite. Copy `.env.docker.example` to `.env.docker` for Compose.

## Docker and Coolify

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

App: [http://localhost:3000](http://localhost:3000). Health check: `GET /healthz`.

For Coolify, use the Dockerfile build pack and expose port `3000`. Set `VITE_API_URL=https://hr-api.ellwaa.com/api` at build time and `PORT=3000` at runtime.

Production nginx serves static files. The browser calls the API directly, so the API must allow the website origin through CORS. Rebuild the frontend after changing `VITE_API_URL`.

## Scripts

```bash
npm run dev      # Vite
npm run build    # Typecheck and production bundle
npm run preview  # Serve the production bundle
npm run lint
```
