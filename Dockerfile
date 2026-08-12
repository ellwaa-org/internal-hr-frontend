# syntax=docker/dockerfile:1

# =============================================================================
# Internal HR (Vite + React) — production image for Coolify / Docker
#
# Coolify settings:
#   Build Pack ........ Dockerfile
#   Port Exposes ...... 80
#   Healthcheck Path .. /healthz
#   Env (optional) .... API_PROXY_TARGET=https://hr-api-staging.ellwaa.com
#
# Local:
#   docker compose up --build
#   open http://localhost:8080
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

# Baked into the client at build time. Keep /api (same-origin); nginx proxies it.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_ENV=production

RUN npm run build && test -f dist/index.html

############################
# 3) Runtime (nginx)
############################
FROM nginx:1.27-alpine AS runtime

# curl: Coolify healthchecks often require curl or wget
RUN apk add --no-cache curl \
 && rm -f /etc/nginx/conf.d/default.conf

# Only substitute API_PROXY_TARGET in the nginx template ($uri / $host stay intact)
ENV NGINX_ENVSUBST_FILTER=API_PROXY_TARGET

# Default API origin when Coolify/UI does not set the variable (or sets it empty)
ENV API_PROXY_TARGET=https://hr-api-staging.ellwaa.com

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/18-validate-env.envsh /docker-entrypoint.d/18-validate-env.envsh
RUN sed -i 's/\r$//' /docker-entrypoint.d/18-validate-env.envsh \
 && chmod +x /docker-entrypoint.d/18-validate-env.envsh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD curl -fsS http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
