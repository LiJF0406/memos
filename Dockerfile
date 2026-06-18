# Stage 1: Build frontend
FROM node:24-alpine AS frontend
WORKDIR /web-build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11 --activate

# Copy frontend dependency files
COPY web/package.json web/pnpm-lock.yaml ./

# Install dependencies (cached layer)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy frontend source and build
COPY web/ ./
RUN pnpm release

# Stage 2: Build backend (with embedded frontend)
FROM golang:1.26.2-alpine AS backend
WORKDIR /backend-build

RUN apk add --no-cache git ca-certificates

# Copy go mod files and download dependencies (cached layer)
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source code
COPY . .

# Fix Windows CRLF line endings in shell scripts (Alpine's sh can't handle \r)
RUN sed -i 's/\r$//' scripts/entrypoint.sh

# Copy frontend dist from frontend stage into the embed path
COPY --from=frontend /server/router/frontend/dist ./server/router/frontend/dist

ARG TARGETOS TARGETARCH VERSION=dev COMMIT=unknown
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build \
      -trimpath \
      -ldflags="-s -w -X github.com/usememos/memos/internal/version.Version=${VERSION} -X github.com/usememos/memos/internal/version.Commit=${COMMIT} -extldflags '-static'" \
      -tags netgo,osusergo \
      -o memos \
      ./cmd/memos

# Stage 3: Minimal runtime
FROM alpine:3.21

RUN apk add --no-cache tzdata ca-certificates su-exec && \
    addgroup -g 10001 -S nonroot && \
    adduser -u 10001 -S -G nonroot -h /var/opt/memos nonroot && \
    mkdir -p /var/opt/memos /usr/local/memos && \
    chown -R nonroot:nonroot /var/opt/memos

COPY --from=backend /backend-build/memos /usr/local/memos/memos
COPY --from=backend --chmod=755 /backend-build/scripts/entrypoint.sh /usr/local/memos/entrypoint.sh

USER root
WORKDIR /var/opt/memos
VOLUME /var/opt/memos

ENV TZ="UTC" \
    MEMOS_PORT="5230"

EXPOSE 5230

ENTRYPOINT ["/usr/local/memos/entrypoint.sh", "/usr/local/memos/memos"]
