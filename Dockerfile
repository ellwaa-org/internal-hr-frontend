# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Internal HR System (Vite + React) — production image
#
# Build:
#   docker build -t internal-hr:latest .
#
# Run:
#   docker run --rm -p 8080:80 \
#     -e API_PROXY_TARGET=https://hr-api.example.com \
#     internal-hr:latest
#
# Coolify: set env API_PROXY_TARGET (optional — defaults to staging API).
#          Expose port 80. Built-in wget healthcheck hits /healthz.
#
# Compose (local):
#   docker compose up --build
#
# Compose (deploy):
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# ---------------------------------------------------------------------------

############################
# 1) Install dependencies  #
############################
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

############################
# 2) Build static assets   #
############################
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Vite bakes VITE_* into the client at build time.
# Keep /api so the browser stays same-origin; nginx proxies to the real API.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_ENV=production

RUN npm run build \
 && test -f dist/index.html

############################
# 3) Serve with nginx      #
############################
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="Internal HR System" \
      org.opencontainers.image.description="Ellwaa Internal HR frontend" \
      org.opencontainers.image.source="https://github.com/ellwaa/internal-hr"

# Only substitute this var in the nginx template (leave $uri / $host alone)
ENV NGINX_ENVSUBST_FILTER=API_PROXY_TARGET
# Default for platforms (Coolify) that don't inject compose env automatically.
# Override in the host/UI for production: API_PROXY_TARGET=https://hr-api.ellwaa.com
ENV API_PROXY_TARGET=https://hr-api-staging.ellwaa.com

# Remove default site; use our templated config
RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/18-validate-env.envsh /docker-entrypoint.d/18-validate-env.envsh
# Guard against CRLF from Windows checkouts; *.envsh must be executable to be sourced
RUN sed -i 's/\r$//' /docker-entrypoint.d/18-validate-env.envsh \
 && chmod +x /docker-entrypoint.d/18-validate-env.envsh

COPY --from=build /app/dist /usr/share/nginx/html

# nginx image already drops worker privileges; keep master entrypoint as designed
EXPOSE 80

STOPSIGNAL SIGQUIT

# start-period gives Coolify / orchestrators time before first failure
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
