# Stage 1 — base
FROM node:20-slim AS base
RUN npm install -g pnpm@10
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
COPY scripts/package.json scripts/package.json
RUN pnpm install --frozen-lockfile

# Stage 3 — builder: compile API server and frontend
FROM deps AS builder
COPY . .
ARG BUILD_TARGET=linux/amd64
ENV BUILD_TARGET=${BUILD_TARGET}
# Bake git metadata into the image so the runner can show branch/hash and
# check for updates without needing a .git directory at runtime.
ARG GIT_HASH=unknown
ARG GIT_BRANCH=unknown
ARG GIT_REMOTE=""
RUN printf '{"hash":"%s","branch":"%s","remote":"%s"}' \
    "${GIT_HASH}" "${GIT_BRANCH}" "${GIT_REMOTE}" > /tmp/git-meta.json
RUN pnpm --filter @workspace/api-server run build
RUN BASE_PATH=/ pnpm --filter @workspace/fermentos run build

# Stage 4 — runner: lean production image
FROM node:20-slim AS runner
# pg_dump refuses to dump a server newer than itself, and Debian bookworm ships
# postgresql-client 15 while the compose stack runs postgres 16 — which silently
# broke every scheduled backup. Pull the matching major from PGDG instead, and
# keep PG_MAJOR in step with the postgres image tag in docker-compose.yml.
ARG PG_MAJOR=16
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
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

COPY --from=builder /tmp/git-meta.json /app/git-meta.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN addgroup --system fermentos && adduser --system --ingroup fermentos fermentos
RUN chown -R fermentos:fermentos /app /entrypoint.sh
USER fermentos

EXPOSE 8080
CMD ["/entrypoint.sh"]
