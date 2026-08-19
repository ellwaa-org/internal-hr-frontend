# syntax=docker/dockerfile:1

# =============================================================================
# Internal HR (Vite + React) — Coolify / Docker production image
#
# Coolify (must match):
#   Build Pack ........ Dockerfile
#   Port Exposes ...... 3000
#   Healthcheck Path .. /healthz
#   Env (runtime) ..... PORT=3000
#                       API_PROXY_TARGET=https://hr-api-staging.ellwaa.com
#   Do not set VITE_API_PROXY_TARGET (would leak the host into the JS bundle).
#
# Local:
#   docker compose up --build
#   open http://localhost:3000
# =============================================================================

############################
# 1) Dependencies
############################
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

############################
# 2) Build
############################
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_ENV=production

RUN npm run build && test -f dist/index.html

############################
# 3) Runtime (nginx on 3000 — Coolify default)
############################
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl \
 && rm -f /etc/nginx/conf.d/default.conf

# Substitute only these names in the nginx template (keep $uri / $host)
ENV NGINX_ENVSUBST_FILTER=^(API_PROXY_TARGET|PORT)$

# Runtime defaults (Coolify Environment Variables override these).
# API_PROXY_TARGET is a public origin, not a secret — needed so /healthz works
# when Coolify has not injected env yet. Never use a VITE_ name here.
ENV PORT=3000
ENV API_PROXY_TARGET=https://hr-api-staging.ellwaa.com

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/18-validate-env.envsh /docker-entrypoint.d/18-validate-env.envsh
RUN sed -i 's/\r$//' /docker-entrypoint.d/18-validate-env.envsh \
 && chmod +x /docker-entrypoint.d/18-validate-env.envsh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
