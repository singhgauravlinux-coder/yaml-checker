# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app
ENV npm_config_update_notifier=false

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

# Set to /yaml/ (trailing slash) to serve the app under a sub-path.
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}

RUN npm run build


# ---------- runtime ----------
# Unprivileged variant: runs as uid 101 and listens on 8080, so no root and no
# NET_BIND_SERVICE capability are needed.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="plumb" \
      org.opencontainers.image.description="Browser-based YAML editor and linter" \
      org.opencontainers.image.licenses="MIT"

USER root
# Pin the worker count: the image's autotune script rewrites nginx.conf at start-up,
# which a read-only root filesystem forbids. Two workers is plenty for static files.
RUN sed -i 's/^worker_processes.*/worker_processes  2;/' /etc/nginx/nginx.conf \
    && mkdir -p /etc/nginx/snippets
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN nginx -t
USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
