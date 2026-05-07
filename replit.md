# FermentOS

Self-hosted homelab brewery management app — manage recipes, log brew sessions, track fermentation, and monitor ingredient inventory. Designed for Raspberry Pi / Debian home servers.

## Run & Operate

- **Dev**: managed via Replit workflows (api-server + fermentos web)
- **DB push**: `pnpm --filter @workspace/db run push`
- **Codegen**: `pnpm --filter @workspace/api-spec run codegen`
- **Typecheck**: `pnpm run typecheck`
- **Required env vars**: `DATABASE_URL`, `PORT` (set per-workflow), `SESSION_SECRET`, `API_KEY` (optional)

## Stack

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui (artifacts/fermentos)
- **Backend**: Fastify-style Express + Pino logging (artifacts/api-server)
- **DB**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API contract**: OpenAPI 3.0 → Orval codegen → React Query hooks (`lib/api-spec`, `lib/api-client-react`)
- **Validation**: Zod schemas generated from OpenAPI spec

## Where things live

- `lib/db/src/schema/` — Drizzle table definitions (source of truth for DB shape)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — Orval-generated hooks + Zod schemas (do not edit manually)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/fermentos/src/pages/` — React page components
- `artifacts/api-server/src/lib/dataMigrations.ts` — Idempotent startup data migrations

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives both server Zod validation and client React Query hooks via Orval codegen. Never drift the spec from the implementation.
- **Text enum columns**: `status` fields use `text(col, { enum })` — TypeScript-only constraint, no DB CHECK. Data migrations handle legacy value conversion.
- **Startup migrations**: `migrateLegacyStatuses()` runs on every boot (idempotent SQL) to self-heal stale deployments without requiring manual migration steps.
- **Path-based routing**: All services route through a shared reverse proxy at `localhost:80`. Never call service ports directly in code or curl.
- **OpenAPI title locked**: `info.title` must stay `"Api"` — Orval uses it to derive generated filenames (`api.ts`, `api.schemas.ts`).

## Product

- **Recipe Manager**: full ingredient lists, gravity/ABV/IBU/color targets, brew time, efficiency, calories
- **Brew Log**: 4-stage lifecycle (brew_day → fermenting → conditioning → packaged) with timestamped stage history
- **Fermentation Tracker**: temperature, gravity, pH readings over time with interactive chart
- **Ingredients**: malt/hop/yeast/adjunct inventory with quantities, suppliers, expiry, unit enforcement
- **Dashboard**: active brews (with live temp/gravity), recent sessions
- **Tasting Notes & Photo**: star rating, tasting notes, compressed photo upload with lightbox
- **Settings**: beer styles, unit system, ingredient enforcement, SFTP backup, API key, in-app updates

## User preferences

- Keep UI compact and information-dense (small font, tight spacing)
- Self-hosted first: no external auth, no cloud dependencies
- `proposeFollowUpTasks` already called for "Remove Replit files from GitHub repo" — do NOT call again

## Gotchas

- Always run codegen after editing `openapi.yaml`
- Always run `db push` after editing schema files
- `pnpm run dev` at workspace root does not work — use `restart_workflow` instead
- Vite dev server must have `server.allowedHosts: true` (proxied iframe environment)
- Status enum is TypeScript-only; old values in the DB are harmless but must be cleaned via `dataMigrations.ts`

## Pointers

- Skill: `.local/skills/pnpm-workspace/SKILL.md`
- Skill: `.local/skills/react-vite/SKILL.md`
- OpenAPI ref: `.local/skills/pnpm-workspace/references/openapi.md`
- Server ref: `.local/skills/pnpm-workspace/references/server.md`
- DB ref: `.local/skills/pnpm-workspace/references/db.md`
