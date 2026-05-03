# FermentOS

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## FermentOS app config flags

Stored in `app_config` (`lib/db/src/schema/settings.ts`):

- `api_auth_required` — when `"true"`, non-browser API clients must send `X-API-Token` matching a row in `api_tokens`. Browser requests with valid `Origin`/`Referer` are exempt. See `artifacts/api-server/src/middlewares/apiAuth.ts`.
- `inventory_enforcement_required` — when `"true"`, `POST /api/brew-sessions` with a `recipeId` verifies all recipe ingredients exist in `inventory` (matched by name + type + unit, case-insensitive) and deducts them FIFO by `purchased_date`. Returns 409 with a `shortages[]` list if anything is missing. Service: `artifacts/api-server/src/services/inventoryEnforcement.ts`. Toggle: `GET`/`PUT /api/settings/inventory-enforcement`. UI: Settings → Brewing tab.

The Settings page is split into two tabs: **Brewing** (Beer Styles, Inventory Enforcement) and **System** (Database Backup, App Update, API Access, System Stats).

The backup config (`backup_config` in `app_config`) carries: SFTP credentials, `schedule` (none/daily/weekly, SFTP only), `localPath` (default `~/fermentos-backups`), `retentionDays` (0 = forever, 1–30 prunes files matching `${prefix}_*.sql` after each successful backup, applies to both SFTP and local destinations), and `backupBeforeUpdate` (none/sftp/local — runs a backup before `POST /api/admin/update` and aborts the update with a 500 if the backup fails). `POST /api/backup/run` accepts `{ target: "sftp" | "local" }`. The previous sidebar UpdatePanel was removed; updates now live in Settings → System → "App Update".

## Recipe steps

Recipes have step-by-step brewing instructions stored in the `recipe_steps` table (`lib/db/src/schema/recipes.ts`): `id`, `recipeId` (cascade delete), `position` (1-based ordering), `phase` (optional enum: mash/boil/fermentation/conditioning/packaging/other), `body` (text, free-form), `durationMinutes` (optional). REST endpoints mirror the ingredients pattern — `GET/POST /recipes/:id/steps`, `PUT/DELETE /steps/:id`, plus `PUT /recipes/:id/steps/reorder` which takes `{ stepIds: number[] }` and validates the IDs exactly match the recipe's current step set. POST defaults `position` to "append at end" when omitted. `GET /recipes/:id` includes `steps[]` (sorted by position). UI: NewRecipe.tsx collects pending steps and posts them after recipe create (rolled back on failure alongside ingredients); RecipeDetail.tsx has a Brewing Steps card with inline AddStepForm and per-row edit/delete via a `StepRow` component.

## FermentOS host ops scripts

Three bash scripts at the repo root manage the host lifecycle:

- `install.sh` — first-time install: Node/pnpm, PostgreSQL, `.env`, build, and `fermentos.service` systemd unit.
- `update.sh` — runs `git pull`, `pnpm install`, `pnpm db push`, build, then `sudo systemctl restart fermentos`. Logs to `update.log`. Triggered by Settings → System → "App Update" via `POST /api/admin/update` (spawned detached). When `backupBeforeUpdate` is set, the route runs `runBackup(target)` first and aborts with 500 if it fails so the update is never applied without a known-good backup.
- `restore.sh <backup.sql>` — restores a `pg_dump` plain-SQL file (the kind `Download SQL Dump` produces). Wipes the public schema and applies the dump in a single transaction so a corrupt file leaves the existing DB untouched. The same single-transaction restore is exposed in-app at `POST /api/backup/restore` (multer upload) and surfaced as a "Restore from Backup" section in Settings → System → Database Backup. Both paths reject custom-format pg_dump files (PGDMP magic).
