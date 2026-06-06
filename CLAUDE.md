# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FermentOS is a self-hosted homebrewing management app. It runs as a single Express process that serves both the REST API and the built React SPA. The backend and frontend are developed as separate workspace packages and brought together only in production.

## Monorepo Structure

pnpm workspace with packages organized into two top-level directories:

- `lib/` — shared libraries consumed by artifacts
  - `lib/db` — Drizzle ORM schema + DB connection (`@workspace/db`)
  - `lib/api-spec` — OpenAPI spec (`openapi.yaml`) + Orval codegen config
  - `lib/api-client-react` — Orval-generated TanStack Query hooks (`@workspace/api-client-react`)
  - `lib/api-zod` — Orval-generated Zod request/response validators (`@workspace/api-zod`)
- `artifacts/` — deployable applications
  - `artifacts/api-server` — Express 5 REST API (`@workspace/api-server`)
  - `artifacts/fermentos` — React 19 + Vite SPA (`@workspace/fermentos`)

## Key Commands

```bash
# Development
pnpm --filter @workspace/api-server run dev   # API server on :8080
pnpm --filter @workspace/fermentos run dev    # Frontend on :23975 (default)

# Typechecking
pnpm run typecheck                            # all packages
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/fermentos run typecheck

# Build
pnpm run build                               # typecheck + build all

# API codegen (run after editing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# DB schema push (dev only — no migrations, pushes schema directly)
pnpm --filter @workspace/db run push

# Tests
pnpm --filter @workspace/db run test         # vitest (lib/db only)
```

## API Change Workflow

The API uses contract-first development. The correct order when adding or changing an endpoint:

1. Edit `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen` — regenerates `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Use the generated Zod schemas from `@workspace/api-zod` for request validation in route handlers
5. The frontend uses generated hooks from `@workspace/api-client-react` automatically

Never hand-write fetch calls or Zod schemas for API endpoints in the frontend — those come from codegen.

## Architecture

### Backend (`artifacts/api-server`)

- **Entry**: `src/index.ts` → `src/app.ts`
- **Routes**: `src/routes/index.ts` registers all sub-routers under `/api`. All routes pass through `apiAuth` middleware first.
- **Auth middleware** (`src/middlewares/apiAuth.ts`): reads `api_auth_required` from `app_config` table (cached 5s). Browser same-origin requests are always allowed. External clients need a `Bearer` token matching a SHA-256 hash stored in `api_tokens`. Some paths are always exempt (iSpindel ingest, HA status, health, repair scripts).
- **Production serving**: `app.ts` serves the built frontend (`artifacts/fermentos/dist/public`) as static files and falls back to `index.html` for non-`/api` routes — the entire app runs as a single Node process.
- **Logging**: pino + pino-http; logger is at `src/lib/logger.ts`
- **Build**: esbuild (see `build.mjs`), outputs to `dist/index.mjs`

### Frontend (`artifacts/fermentos`)

- **Router**: wouter with `base` set to `import.meta.env.BASE_URL` (supports non-root deployment paths)
- **Data fetching**: TanStack Query with `staleTime: 30_000`; all hooks come from `@workspace/api-client-react`
- **UI components**: shadcn/ui components in `src/components/ui/` backed by Radix UI primitives
- **Path alias**: `@/` maps to `src/`

### Database (`lib/db`)

Drizzle ORM with PostgreSQL. Schema is split into files by domain — all exported from `src/schema/index.ts`. The `db` singleton is initialized from `DATABASE_URL` and exported from `src/index.ts`.

Key tables:
- `recipes`, `recipe_ingredients`, `recipe_steps` — recipe book
- `brew_sessions`, `fermentation_readings`, `brew_session_status_log` — brew tracking
- `inventory` — ingredient stock
- `equipment` — equipment registry
- `sensor_devices`, `sensor_readings`, `sensor_device_brew_assignments` — iSpindel / sensor telemetry
- `beer_styles`, `app_config` — settings (key/value store)
- `api_tokens` — hashed API tokens for external auth

Schema changes use `drizzle-kit push` (no migration files; schema is pushed directly to the DB in dev). In production this is run as part of `update.sh`.

### App Config Flags (stored in `app_config` table)

- `api_auth_required` — when `"true"`, external API clients must authenticate
- `inventory_enforcement_required` — when `"true"`, creating a brew session deducts ingredients from inventory FIFO; returns 409 with `shortages[]` if insufficient stock
- `backup_config` — JSON blob with SFTP credentials, schedule, retention, and `backupBeforeUpdate` flag

## Important Patterns

**Zod imports**: use `zod/v4` (not bare `zod`) — `import { z } from "zod/v4"`.

**Schema-derived types**: use `createInsertSchema` from `drizzle-zod` to derive Zod insert schemas from Drizzle table definitions. Route handlers import these from `@workspace/db` rather than duplicating schemas.

**Brew session status lifecycle**: `brew_day → fermenting → conditioning → packaged`. Every status change is recorded in `brew_session_status_log`. Legacy status values are converted on startup via `dataMigrations.ts`.

**iSpindel integration**: the `POST /api/integrations/ispindel` ingest endpoint is always auth-exempt. On first POST, a `sensor_devices` row is auto-created. Readings are mirrored into `fermentation_readings` when a device is assigned to a brew session.

**API token storage**: tokens are shown to the user once at creation. Only the SHA-256 hash is stored in `api_tokens.token_hash`. Token validation is in `apiAuth.ts`.

## Environment

Required env vars (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — session signing secret
- `PORT` — port the server listens on (default 3000)

The frontend Vite dev server reads `PORT` and `BASE_PATH` from environment.

## Git Workflow

- Always work on the `dev` branch
- Never push directly to `main`
- After completing changes, suggest a commit message and wait for the user's approval before committing
- No mention of Claude in created by or notes
- After the user approves, commit to `dev` then remind the user to run:
- Claude is never an author in commits
git checkout main
git pull origin main
git checkout dev
git rebase main
git push origin dev --force-with-lease
