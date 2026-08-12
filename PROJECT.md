# FermentOS architecture notes

Notes for anyone working on the FermentOS codebase itself. For what the app
does and how to install/run it, see [README.md](README.md).

## Monorepo layout

A pnpm workspace; each package manages its own dependencies.

```
lib/
  db/               Drizzle ORM schema, migrations, and DB client
  api-spec/         OpenAPI 3.1 spec + Orval codegen config
  api-zod/          Zod schemas generated from the OpenAPI spec
  api-client-react/ React Query hooks generated from the OpenAPI spec
artifacts/
  api-server/       Express 5 backend
  fermentos/        React 19 + Vite frontend (the app itself)
scripts/            Repo-maintenance scripts (see scripts/README.md)
```

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval, generated from the OpenAPI spec in `lib/api-spec`
- **Build**: esbuild (CJS bundle) for the API server, Vite for the frontend

## Key commands

- `pnpm run typecheck` — typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate the API
  client hooks and Zod schemas from the OpenAPI spec. Run this after
  changing `lib/api-spec/openapi.yaml`, before implementing the
  corresponding route.
- `pnpm --filter @workspace/db run push` — push schema changes to the dev
  database (Drizzle's "push" workflow — no migration files)
- `pnpm --filter @workspace/api-server run dev` — run the API server locally
- `pnpm --filter @workspace/fermentos run dev` — run the frontend locally

## App config flags

Stored in the `app_config` table (`lib/db/src/schema/settings.ts`):

- **`api_auth_required`** — when `"true"`, non-browser API clients must send
  an `X-API-Token` header matching a row in `api_tokens`. Browser requests
  with a valid `Origin`/`Referer` are exempt. See
  `artifacts/api-server/src/middlewares/apiAuth.ts`.
- **`inventory_enforcement_required`** — when `"true"`,
  `POST /api/brew-sessions` with a `recipeId` verifies all recipe
  ingredients exist in `inventory` (matched by name + type + unit,
  case-insensitive) and deducts them FIFO by `purchased_date`. Returns 409
  with a `shortages[]` list if anything is missing. Service:
  `artifacts/api-server/src/services/inventoryEnforcement.ts`. Toggle:
  `GET`/`PUT /api/settings/inventory-enforcement`. UI: Settings → Brewing.

The Settings page is split into two tabs: **Brewing** (Beer Styles,
Inventory Enforcement) and **System** (Database Backup, App Update, API
Access, System Stats).

The backup config (`backup_config` in `app_config`) carries: SFTP
credentials, `schedule` (none/daily/weekly, SFTP only), `localPath`
(default `~/fermentos-backups`), `retentionDays` (0 = forever, 1–30 prunes
files matching `${prefix}_*.sql` after each successful backup, applies to
both SFTP and local destinations), and `backupBeforeUpdate`
(none/sftp/local — runs a backup before `POST /api/admin/update` and aborts
the update with a 500 if the backup fails). `POST /api/backup/run` accepts
`{ target: "sftp" | "local" }`.

## Recipe steps

Recipes have step-by-step brewing instructions stored in the
`recipe_steps` table (`lib/db/src/schema/recipes.ts`): `id`, `recipeId`
(cascade delete), `position` (1-based ordering), `phase` (optional enum:
mash/boil/fermentation/conditioning/packaging/other), `body` (free-form
text), `durationMinutes` (optional).

REST endpoints mirror the ingredients pattern: `GET`/`POST /recipes/:id/steps`,
`PUT`/`DELETE /steps/:id`, plus `PUT /recipes/:id/steps/reorder`, which
takes `{ stepIds: number[] }` and validates the IDs exactly match the
recipe's current step set. `POST` defaults `position` to "append at end"
when omitted. `GET /recipes/:id` includes `steps[]`, sorted by position.

On the frontend, `NewRecipe.tsx` collects pending steps and posts them
after the recipe is created (rolled back on failure alongside
ingredients); `RecipeDetail.tsx` has a Brewing Steps card with an inline
`AddStepForm` and per-row edit/delete via a `StepRow` component.

## Host lifecycle scripts

Three bash scripts at the repo root manage a self-hosted install:

- **`install.sh`** — first-time install: Node/pnpm, PostgreSQL, `.env`,
  build, and the `fermentos.service` systemd unit.
- **`update.sh`** — runs `git pull`, `pnpm install`, `pnpm db push`, build,
  then `sudo systemctl restart fermentos`. Logs to `update.log`. Triggered
  from Settings → System → "App Update" via `POST /api/admin/update`
  (spawned detached). If `backupBeforeUpdate` is set, the route runs
  `runBackup(target)` first and aborts with a 500 if it fails, so an update
  is never applied without a known-good backup.
- **`restore.sh <backup.sql>`** — restores a plain-SQL `pg_dump` file (the
  kind "Download SQL Dump" produces). Wipes the public schema and applies
  the dump in a single transaction, so a corrupt file leaves the existing
  database untouched. The same single-transaction restore is exposed
  in-app at `POST /api/backup/restore` (multer upload) and surfaced as a
  "Restore from Backup" section in Settings → System → Database Backup.
  Both paths reject custom-format `pg_dump` files (the `PGDMP` magic
  bytes).
