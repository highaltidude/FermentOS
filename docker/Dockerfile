# Stage 1 — base
FROM node:20-slim AS base
RUN npm install -g pnpm@9
WORKDIR /app

# Stage 2 — deps: install all workspace dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/db/package.json lib/db/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/fermentos/package.json artifacts/fermentos/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY scripts/package.json scripts/package.json
RUN pnpm install --frozen-lockfile

# Stage 3 — builder: compile API server and frontend
FROM deps AS builder
COPY . .
ARG BUILD_TARGET=linux/amd64
ENV BUILD_TARGET=${BUILD_TARGET}
RUN pnpm --filter @workspace/api-server run build
RUN BASE_PATH=/ pnpm --filter @workspace/fermentos run build

# Stage 4 — runner: lean production image
FROM node:20-slim AS runner
RUN npm install -g pnpm@9
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/data

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN addgroup --system fermentos && adduser --system --ingroup fermentos fermentos
RUN chown -R fermentos:fermentos /app /entrypoint.sh
USER fermentos

EXPOSE 8080
CMD ["/entrypoint.sh"]
