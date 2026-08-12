# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Internal HR System (Vite + React) — production image
#
# Build:   docker build -t internal-hr .
# Run:     docker run --rm -p 8080:80 \
#            -e API_PROXY_TARGET=https://hr-api-staging.ellwaa.com \
#            internal-hr
# Compose: docker compose up --build
# ---------------------------------------------------------------------------

############################
# 1) Install dependencies  #
############################
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only lockfiles first for better layer caching
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

RUN npm run build

############################
# 3) Serve with nginx      #
############################
FROM nginx:1.27-alpine AS runtime

# Only substitute this var in the nginx template (leave $uri / $host alone)
ENV NGINX_ENVSUBST_FILTER=API_PROXY_TARGET
ENV API_PROXY_TARGET=https://hr-api-staging.ellwaa.com

# Remove default site; use our templated config
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Static build output
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
