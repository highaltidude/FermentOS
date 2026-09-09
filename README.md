# FermentOS

## What is FermentOS

> Self-hosted homebrewing management for the serious brewer.

FermentOS keeps your whole brewery in one place — recipes, batches, ingredients,
and equipment — running entirely on hardware you own. Put it on a Raspberry Pi,
a mini PC, a NAS, or a spare VM on your home network, then open it from any
browser or your phone. There is no cloud account, no subscription, and your
brewing data never leaves the house.

If you use an iSpindel hydrometer, FermentOS reads gravity and temperature from
it automatically for the whole ferment, charts the progress, and messages your
phone when a batch needs attention.

**Who is it for**

- Homebrewers who want to own their data outright
- Anyone already running Home Assistant or a home server
- Brewers who have outgrown a spreadsheet

**Highlights**

- Recipes, brew sessions, ingredients, and equipment in one place
- Automatic gravity and temperature logging from an iSpindel
- Alerts to your phone when a ferment goes off the rails
- Installs to your home screen like an app
- Home Assistant integration, backups, and one-click updates

**New here?** Start with [Getting started](#getting-started) — it takes you from
install to a tracked first batch.

## Screenshots

![Brewery Overview Dashboard](docs/screenshots/dashboard.jpg)
*Dashboard — at-a-glance brewery overview with active fermentations and recent sessions*

| Recipes | Brew Log |
| :---: | :---: |
| ![Recipes](docs/screenshots/recipes.jpg) | ![Brew Log](docs/screenshots/brew-sessions.jpg) |
| Browse and search your recipe book | Track every batch from grain to glass |

![Ingredients](docs/screenshots/inventory.jpg)
*Ingredients — keep tabs on malts, hops, yeast, and adjuncts with expiration tracking*

![iSpindel Integration](docs/screenshots/iSpindel_Integration.PNG)

*iSpindel Integration — live gravity and temperature tracking with fermentation insights*

![Settings](docs/screenshots/settings.jpg)
*Settings — manage beer styles, unit system, ingredient enforcement, scheduled SFTP backups, API access, in-app updates, and host reboots*

## Features

- **Recipe manager** — Store your recipes with full ingredient lists and step-by-step instructions, plus gravity targets, ABV, IBU, and color
- **Brew log** — Track every batch from grain to glass through four stages: Brew Day → Fermenting → Conditioning → Packaged
- **Stage history** — Every stage change is timestamped and kept, so you can see exactly when a batch moved and how long each stage took
- **Fermentation tracker** — Temperature, gravity, and pH over time on an interactive chart, filled in automatically if you have an iSpindel
- **Alerts to your phone** — FermentOS watches every active batch and messages you when the temperature drifts, fermentation stalls, or a sensor goes quiet — even with the app closed. See [Get alerts on your phone](#get-alerts-on-your-phone)
- **Install on your phone** — Add FermentOS to your home screen and it opens full-screen like a native app. See [Install it on your phone](#install-it-on-your-phone)
- **Tasting and rating** — Score a finished batch on appearance and aroma, flavor and balance, and mouthfeel and carbonation (1–5 each) plus an overall 1–10, tag off-flavors, note whether you would brew it again, and attach a photo. Scores roll up to an average on the recipe, so each recipe carries the record of every batch brewed from it
- **Ingredients** — Malts, hops, yeast, and adjuncts with quantities, suppliers, and expiry dates. Optionally block a brew day when you are short of something
- **Auto-advance to Conditioning** — Move a batch on automatically once fermentation looks finished, so a forgotten status does not leave it sitting in Fermenting for weeks
- **iSpindel integration** — Live gravity, temperature, battery, and tilt from iSpindel Wi-Fi hydrometers. Devices register themselves on their first reading and appear on the brew session page once assigned
- **Home Assistant integration** — A REST endpoint plus a settings panel that writes the `configuration.yaml` block and Lovelace card for you
- **Beer styles** — Keep your own style list, used as the dropdown when creating recipes
- **Units** — Imperial, metric, or both. Controls the units offered in the ingredient form; existing entries keep what they were saved with
- **Dashboard** — What is fermenting right now and what you brewed recently, at a glance
- **Calculators** — ABV and attenuation from OG and FG today; water chemistry, recipe scaling, and batch cost are planned
- **System health** — Live CPU, memory, disk, and network for the host, refreshed every 5 seconds, with historical trend charts
- **Backups** — Local backups and scheduled SFTP export, restore from a file or from history, and a coverage audit that checks every database table is actually accounted for
- **Updates and rollback** — Update from inside the app with a live progress bar, read the release notes in place, and roll back to a previous deploy in one click (bare-metal installs; Docker updates by rebuilding the image)
- **API tokens** — Optionally lock the API so only clients you approve can reach it, with per-token read or write scopes. The browser UI keeps working either way

---

## Getting started

Install FermentOS, brew something, get alerts on your phone, and put the app
on your home screen. Each section stands on its own — skip anything that does
not apply to you.

### Install FermentOS

#### Requirements

- Any Debian-based 64-bit Linux host (Raspberry Pi OS, Ubuntu, Debian, etc.)
- Raspberry Pi 3B+ or newer (Pi 4 recommended) works great, but a mini PC, NAS, or VM works just as well
- At least 8 GB SD card
- Internet connection

#### Quick install

Clone the repo and run the installer:

```bash
git clone https://github.com/highaltidude/FermentOS.git
cd FermentOS
bash install.sh
```

During the install you'll be prompted for the **web port** the app should listen on (default `3000`). Pick any free port between 1–65535; this is the port you'll open in the browser. To skip the prompt (e.g. for unattended installs), set `FERMENTOS_PORT` first: `FERMENTOS_PORT=8080 bash install.sh`.

The script will:
- Install Node.js, pnpm, and PostgreSQL (if not already installed)
- Create the database and generate a random secure password
- Create your `.env` file automatically (including the port you chose)
- Install dependencies, run migrations, and build the app
- Register and start the systemd service so it survives reboots

When it finishes, it prints the URL to open in your browser (e.g. `http://192.168.1.42:3000`).

#### Docker Installation

Recommended for NAS, mini PC, VM, or anyone already running Docker.

```bash
git clone https://github.com/highaltidude/FermentOS.git
cd FermentOS
bash docker-install.sh
```

The script will prompt for a web port (default 3000), generate secure random credentials, write `.env`, and start the stack. Open the URL it prints when done.

- Data is persisted in a Docker volume (`postgres_data`); uploaded photos are stored in `./data/uploads`
- To update: `git pull && bash docker-install.sh`
- The in-app update/rollback system (Settings → System → Updates) is a bare-metal/systemd feature — Docker installs update by pulling and rebuilding the image instead

**Non-interactive / unattended install:**
```bash
FERMENTOS_PORT=7070 bash docker-install.sh
```

**Raspberry Pi / ARM:**
```bash
docker compose build --build-arg BUILD_TARGET=linux/arm64
docker compose up -d
```

#### Accessing on your local network

The installer prints your host's IP when it finishes. You can also find it any time with:

```bash
hostname -I
```

Visit `http://<host-ip>:3000` from any device on the same network. For a stable address, assign your host a static IP in your router's DHCP settings.

---

### Your first brew

Once FermentOS is running, this is the shortest path to a batch you can watch
ferment. It takes about ten minutes.

**1. Add a beer style**

Go to **Settings → Brewing → Beer Styles** and add the styles you actually
brew. Recipes pick their style from this list, so adding one or two first saves
a detour later.

**2. Create a recipe**

**Recipes → New Recipe.** Give it a name, pick the style, and set your batch
size. Add the grain bill, hops, and yeast, and optionally the mash and boil
steps.

Set the **fermentation temperature range** while you are here. It is optional,
but it is what lets FermentOS tell you later that a batch is running hot — see
step 6.

**3. Stock your ingredients** *(optional)*

**Ingredients** is where malts, hops, yeast, and adjuncts live, with quantities,
suppliers, and expiry dates. You can skip this entirely and come back to it.

It becomes required only if you turn on **Settings → Brewing → Ingredient
Enforcement**, which stops you starting a brew day when you are short of
something and tells you exactly what is missing.

**4. Start a brew session**

**Brew Log → New Session.** Choose your recipe from the dropdown and FermentOS
fills in the name, batch size, and fermentation temperature range for you.

You do not need a recipe to log a batch — a **name and a brew date are the only
required fields**, so a spur-of-the-moment brew can be recorded now and tidied
up later. If you skip the recipe, set the fermentation temperature range on the
session itself if you want temperature alerts.

The session starts at **Brew Day**.

**5. Attach an iSpindel** *(optional)*

If you have one, drop it in the fermenter and assign it to this session — see
[Connect an iSpindel](#connect-an-ispindel). From then on every reading it
sends is logged against this batch automatically.

No iSpindel? Add readings by hand on the session page. Everything below still
works, just with the readings you enter yourself.

**6. Watch it ferment**

Move the session to **Fermenting** using the stage bar at the top of the page.
You now get:

- a chart of gravity and temperature over time
- **fermentation insights** — attenuation so far, how fast it is moving, and whether it looks finished
- a live telemetry card, if a sensor is assigned

This is also the point where alerts start earning their keep. Set them up once
and your phone tells you about a stall or a temperature swing without you
opening anything — see [Get alerts on your phone](#get-alerts-on-your-phone).

**7. Package it and rate it**

When fermentation finishes, advance to **Conditioning**, then **Packaged**.
(FermentOS can make the Conditioning step for you — see **Settings → Brewing →
Fermentation Temperature → Auto-advance to Conditioning**.)

On a packaged batch you can fill in the tasting scorecard: appearance and aroma,
flavor and balance, mouthfeel and carbonation, an overall score out of ten, any
off-flavors, and whether you would brew it again. Those scores roll up to an
average on the recipe, so over time each recipe carries the record of every
batch you have made from it.

---

### Get alerts on your phone

FermentOS checks every active batch every five minutes and can message you when
something needs attention:

| Alert | Fires when |
|-------|-----------|
| Temperature out of range | A reading falls outside the batch's fermentation temperature range |
| Fermentation stalled | Gravity has not moved for 24 hours |
| Sensor offline | Your iSpindel has stopped reporting |
| Sensor battery low | The iSpindel battery drops below 20% |

Both delivery methods are **outbound** — FermentOS makes the request, nothing
connects in to it. That is what makes this work on an ordinary home network with
no certificates, no reverse proxy, and no VPN on your phone.

#### Using ntfy (easiest)

[ntfy](https://ntfy.sh) is a free push-notification app. Nothing to sign up for.

1. Install **ntfy** from the App Store or Play Store
2. Pick a topic name nobody could guess — treat it like a password, because anyone who knows it can read your alerts. Something like `fermentos-a8f3k2q1` rather than `brewing`
3. In the app, subscribe to that topic
4. In FermentOS, go to **Settings → Brewing → Notifications**, set **Channel** to **ntfy**, and paste the same topic
5. Click **Save**, then **Send test**

Your phone should buzz within a second or two.

#### Using a webhook

Set **Channel** to **Webhook** and paste a URL instead. FermentOS sends a JSON
POST, which works directly with Discord and Slack incoming webhooks, or with
n8n, Make, Node-RED, and anything else that accepts one. The payload shape is in
[Webhooks & alert payloads](#webhooks--alert-payloads).

#### Two things worth knowing

**Save before you test.** The test button sends using your *saved* settings, not
what is currently on screen. If you change the topic and hit Send test straight
away, you are testing the old one.

**Temperature alerts need a temperature range.** If neither the session nor its
recipe has a fermentation temperature range set, FermentOS has nothing to
compare a reading against, and temperature alerts will never fire. The other
three alerts still work fine. Set the range on the session, or on the recipe so
future batches inherit it.

You can also tune how jumpy temperature alerts are with **Settings → Brewing →
Fermentation Temperature → Temperature Alert Threshold**. It is the number of consecutive
out-of-range readings needed before you get told, so opening the fermenter for a
minute does not wake you at 3am. **Re-notify at most every** controls how often
a problem that is still ongoing nags you again.

---

### Install it on your phone

FermentOS can live on your home screen and open full-screen, without a browser
bar, like a normal app.

**On iPhone or iPad:** open FermentOS in Safari, tap **Share**, then
**Add to Home Screen**. That is it — it launches standalone, with the right icon.

**On Android:** open FermentOS in Chrome, tap the **⋮** menu, then
**Add to Home screen**. You get an icon and it opens quickly, though Chrome
reserves its proper "Install app" prompt for sites served over HTTPS.

**What you do not get yet:** offline access and web push notifications. Both
require HTTPS, which a plain home-network install does not have. This is why
phone alerts go through ntfy or a webhook instead — those work over plain HTTP
today. If you want to put FermentOS behind HTTPS, see issues
[#144](https://github.com/highaltidude/FermentOS/issues/144),
[#145](https://github.com/highaltidude/FermentOS/issues/145), and
[#146](https://github.com/highaltidude/FermentOS/issues/146).

Repeat visits are quick either way: the app's assets are cached by your browser,
so day-to-day use is not waiting on the Pi.

---

### Connect an iSpindel

The iSpindel is an open-source Wi-Fi hydrometer that sends gravity, temperature, battery, and tilt angle readings over HTTP. FermentOS includes a native ingest endpoint so the iSpindel posts directly to your local server — no cloud account or relay required.

#### 1. Enable the integration

In FermentOS, go to **Settings → System → Integrations → iSpindel Integration** and confirm the toggle is on. The panel shows the exact POST URL to use.

#### 2. Configure your iSpindel

Open the iSpindel's built-in web UI (connect it to your network in hotspot mode first, then visit `http://192.168.4.1`):

| Field | Value |
|-------|-------|
| Server Address | your FermentOS host IP (e.g. `192.168.1.100`) |
| Port | `80` |
| URL | `/api/integrations/ispindel` |
| Protocol | HTTP |

Leave all other fields at their defaults. The iSpindel's **Name** field becomes the `deviceKey` used to identify it in FermentOS.

#### 3. First reading

On the next wake cycle the iSpindel will POST to FermentOS. If no device with that `deviceKey` exists yet, one is **auto-created** — you will see it appear in the Integrations panel immediately after the first reading.

#### 4. Assign to a brew session

In the Integrations panel (or on the brew session page), select an active brew from the **Assign to brew…** dropdown. From that point on, every incoming reading is also mirrored into the session's fermentation chart and a live telemetry card appears at the top of the brew session page.

#### 5. Optional: secure with a token

Set a **Security Token** in the Integrations panel. Then open the iSpindel web UI and enter the same value in its **Token** field. FermentOS will reject readings that don't include the matching token.

> **Note:** The ingest endpoint (`POST /api/integrations/ispindel`) and the status endpoint (`GET /api/integrations/ispindel/status`) are always exempt from API key lockdown so the iSpindel device can reach them without a bearer token.

#### Simulate a reading (development)

Expand the **Developer: Simulate iSpindel Reading** section in the Integrations panel and click **Send Reading** — useful for testing before your device arrives or while debugging.

---

### Everyday use

Brew sessions move through four stages, in order:

```
Brew Day  ──▶  Fermenting  ──▶  Conditioning  ──▶  Packaged
```

Every new session starts at **Brew Day**. The stage bar at the top of the
session page moves a batch forward — or back, if you jumped the gun — in one
click, and every change is written to a timestamped history you can see further
down the page. The brew date records the day grain actually hit the kettle,
which is not always the day you got round to logging it.

Day to day, that means:

- **Dashboard** shows what is fermenting now and what you finished recently
- **Brew Log** is the full history of every batch
- **Recipes** carries the average score of every batch brewed from it, so your best recipes surface themselves over time
- **Ingredients** tracks what you have and flags what is about to expire

Only Brew Day, Fermenting, and Conditioning batches are monitored for alerts.
Once a batch is **Packaged** it is finished, and a stale probe reading will
never wake you up about it.

---

# Advanced

*Everything from here on is optional. The sections above cover normal use — this
part is for integrating FermentOS with other systems, running it in anger, or
building against its API.*

---

## Updating & rollback

The easiest way to update is from the app itself: **Settings → System → App Update → Update now**. It pulls the latest commit, runs migrations, rebuilds, and restarts the services automatically, with a live progress bar. Release notes are shown in-app, and every deploy is recorded in a history log with a one-click rollback if something goes wrong.

To update manually from the command line instead:

```bash
cd FermentOS
bash update.sh
```

Or step by step:

```bash
cd FermentOS
git pull
pnpm install
source .env && pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/fermentos run build
sudo systemctl restart fermentos
```

### Useful commands

```bash
sudo systemctl status fermentos         # check service status
sudo journalctl -u fermentos -f         # tail logs
sudo systemctl restart fermentos        # restart the app
```

---

## Backups & restore

Managed from **Settings → System → Backups**.

FermentOS takes a `pg_dump` of the whole database. You can run one on demand,
download it, or schedule daily or weekly runs that push to an SFTP server, keep
a copy on the local disk, or both. Restores work from an uploaded file or from
any backup still in local history.

Two things worth setting up before you need them:

- **Back up before updating.** `backupBeforeUpdate` takes a snapshot
  automatically before an in-app update runs, so a bad deploy is recoverable.
- **Check the coverage audit.** It compares the tables actually in your database
  against the list FermentOS knows about, and reports a percentage. Anything
  unclassified shows up as missing coverage, which is the signal that a new
  table shipped without being accounted for. You can optionally block in-app
  updates while coverage is below 100%.

Restoring is destructive — it wipes and replays the public schema. The endpoint
reference is under [Backups](#backups) in the API section.

---

## Home Assistant

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ha/status` | Status for every enabled sensor device — always exempt from API token lockdown |

If you already run Home Assistant, you can build notification automations on
this endpoint instead of using FermentOS's own notifications. Note the
`alerts` array here currently carries **`device_offline` and `battery_low`
only** — temperature thresholds are evaluated per brew session and are not
applied to this device-oriented endpoint, so a temperature automation needs
to compare `latestReading.temperature` against your own threshold in HA. For
temperature and stalled-fermentation alerts out of the box, use the built-in
notifications (Settings → Brewing → Notifications) instead.

Response is an array, one entry per device:
```json
[
  {
    "deviceId": 1,
    "deviceName": "Fermenter 1",
    "deviceKey": "ispindel-001",
    "connectionStatus": "connected",
    "assignedBrewSessionId": 12,
    "assignedBrewName": "Pacific IPA",
    "lastSeenAt": "2024-03-16T10:00:00Z",
    "latestReading": { "gravity": 1.045, "temperature": 68.5, "battery": 3.9 },
    "insights": { "attenuationPercent": 42.5, "fermentationStatus": "slowing" },
    "alerts": []
  }
]
```
`connectionStatus`: `connected` | `warning` | `offline` | `unknown`. Settings → System → Integrations → Home Assistant generates a ready-to-paste `configuration.yaml` REST sensor block and a Lovelace markdown card for this endpoint, so you rarely need to hand-write the YAML.
---

## Webhooks & alert payloads

**GET/PUT `/api/settings/notifications`**

```json
{
  "channel": "none",
  "ntfyServer": "https://ntfy.sh",
  "ntfyTopic": "",
  "webhookUrl": "",
  "types": ["temp_out_of_range", "gravity_stalled", "device_offline", "battery_low"],
  "repeatHours": 6
}
```

`channel`: `none` | `ntfy` | `webhook`. `repeatHours` is 1–168.

**POST `/api/settings/notifications/test`** → `{ "ok": boolean, "error": string | null }`

Sends a test notification on the configured channel. Returns `200` with
`ok: false` when delivery fails — a misconfigured endpoint is an expected
outcome to display, not a request error.

Webhook payload shape:

```json
{
  "source": "fermentos",
  "title": "Pacific Haze IPA: Temperature out of range",
  "message": "Temperature 74.2°F is above maximum 70°F",
  "priority": "high",
  "triggeredAt": "2026-09-08T03:11:52.235Z",
  "brewSessionId": 7,
  "recipeName": "Pacific Haze IPA",
  "alertType": "temp_out_of_range"
}
```
---

## Security & API tokens

By default no authentication is required — the API is designed for trusted local network use.

You can optionally enable **API token lockdown** under **Settings → Security → API Access**. When enabled, all external clients (scripts, Home Assistant, integrations) must supply a token. Browser requests from the FermentOS UI itself continue to work without a token (same-origin requests are always allowed).

**Generating a token:** Settings → Security → API Access → enter a name → choose a scope → Create Token. Copy the token immediately — it is only shown once.

- **Scope**: tokens are `read` or `write` (default `write`). A `read`-scoped token gets `403` on any `POST`/`PUT`/`PATCH`/`DELETE` request.

**Using a token:**
```
Authorization: Bearer <token>
```

**Always-exempt endpoints** (reachable with no token, even under lockdown):
- `GET /healthz`
- `GET /api/admin/repair-script`, `GET /api/admin/sudoers-line` — recovery scripts, must stay reachable from a plain `curl` on the host even if you lock yourself out
- `GET /api/ha/status` — read-only Home Assistant polling target
- `POST /api/integrations/ispindel`, `GET /api/integrations/ispindel/status` — the iSpindel device itself can't send a bearer token

Note: `/api/admin/auth/*` (the token-management endpoints themselves) are **not** exempt, even under lockdown — otherwise an external caller could mint itself a token or disable the lock entirely.

**Home Assistant example:**
```yaml
sensor:
  - platform: rest
    name: "FermentOS Active Brews"
    resource: http://192.168.1.239:8080/api/ha/status
    headers:
      Authorization: "Bearer <token>"
    value_template: "{{ value_json | length }}"
    scan_interval: 300
```
(See the dedicated **Home Assistant** section above for the full response shape, or generate a ready-to-paste config from Settings → System → Integrations → Home Assistant.)

---

## Manual installation

<details>
<summary>Click to expand manual step-by-step instructions</summary>

**1. Update the system**
```bash
sudo apt update && sudo apt upgrade -y
```

**2. Install Node.js v20**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**3. Install pnpm and serve**
```bash
npm install -g pnpm serve
```

**4. Install PostgreSQL and create the database**
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql <<EOF
CREATE USER fermentos WITH PASSWORD 'your_password_here';
CREATE DATABASE fermentos OWNER fermentos;
GRANT ALL PRIVILEGES ON DATABASE fermentos TO fermentos;
EOF
```

**5. Configure environment**
```bash
cp .env.example .env
nano .env   # fill in DATABASE_URL and SESSION_SECRET
```

**6. Install, migrate, build**
```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/fermentos run build
```

**7. Start**
```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs &
serve -s artifacts/fermentos/dist/public -l 3000
```

</details>

---

## Tech stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS 4, routed with [wouter](https://github.com/molefrog/wouter), data fetching via [TanStack Query](https://tanstack.com/query), UI primitives from [Radix UI](https://www.radix-ui.com/), charts via [Recharts](https://recharts.org/)
- **Backend**: Node.js + Express 5 + TypeScript, scheduled jobs via [node-cron](https://github.com/node-cron/node-cron), SFTP backups via [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client)
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM, validated with Zod (via drizzle-zod)
- **API contract**: A single [OpenAPI spec](lib/api-spec/openapi.yaml) is the source of truth for the HTTP API — [orval](https://orval.dev/) generates a typed React Query client and Zod request-validation schemas from it, so the frontend and backend can't drift out of sync
- **Package Manager**: pnpm (monorepo workspace)

---

## Development

```bash
pnpm install

pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/fermentos run dev    # Frontend on :23975

pnpm run typecheck   # tsc across every workspace package (no ESLint in this repo)
pnpm run test        # vitest, where a package has a test suite
pnpm run build       # typecheck, then build every workspace package
```

Alternatively, `docker compose -f docker-compose.dev.yml up` starts a full dev stack (Postgres + both dev servers, live-reloading against a bind-mounted repo) in one command.

---

## API Reference

All endpoints are prefixed with `/api`. Replace `<host>` with your host's address (e.g. `http://192.168.1.239:8080`).

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Counts of active brews, total recipes, and inventory items |
| GET | `/api/dashboard/active-brews` | List of currently active brew sessions |
| GET | `/api/dashboard/upcoming-brews` | Deprecated compatibility stub — the "scheduled" status no longer exists; always returns `[]` |

---

### Recipes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recipes` | List all recipes |
| POST | `/api/recipes` | Create a recipe |
| GET | `/api/recipes/:id` | Get a recipe with its ingredients |
| PUT | `/api/recipes/:id` | Update a recipe |
| DELETE | `/api/recipes/:id` | Delete a recipe |
| GET | `/api/recipes/styles` | Recipe counts grouped by style |
| GET | `/api/recipes/:id/ingredients` | List ingredients for a recipe |
| POST | `/api/recipes/:id/ingredients` | Add an ingredient |
| PUT | `/api/ingredients/:id` | Update an ingredient |
| DELETE | `/api/ingredients/:id` | Delete an ingredient |

**POST /api/recipes** body:
```json
{
  "name": "Pacific IPA",
  "style": "American IPA",
  "batchSizeGallons": 5.5,
  "originalGravity": 1.065,
  "finalGravity": 1.012,
  "abv": 6.9,
  "ibu": 65,
  "colorSrm": 8,
  "estimatedBrewTimeMinutes": 240,
  "efficiencyPercent": 72,
  "caloriesPerServing": 210,
  "fermentTempMin": 64,
  "fermentTempMax": 70,
  "fermentTempIdeal": 67,
  "notes": "Optional brew notes"
}
```

**POST /api/recipes/:id/ingredients** body:
```json
{
  "name": "Cascade Hops",
  "type": "hop",
  "amount": 2,
  "unit": "oz",
  "use": "boil",
  "timingMinutes": 60,
  "notes": "Optional"
}
```
`type`: `malt` | `hop` | `yeast` | `adjunct` | `water_agent` | `other`
`use`: `mash` | `boil` | `dry_hop` | `whirlpool` | `primary` | `secondary` | `packaging` | `other`

---

### Recipe Steps

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recipes/:id/steps` | List steps for a recipe, ordered by position |
| POST | `/api/recipes/:id/steps` | Add a step (appended to the end if `position` is omitted) |
| PUT | `/api/steps/:id` | Update a step |
| DELETE | `/api/steps/:id` | Delete a step |
| PUT | `/api/recipes/:id/steps/reorder` | Reorder all steps for a recipe |

**POST /api/recipes/:id/steps** body:
```json
{
  "body": "Mash in at 152°F for 60 minutes",
  "phase": "mash",
  "durationMinutes": 60
}
```
`phase`: `mash` | `boil` | `fermentation` | `conditioning` | `packaging` | `other`

**PUT /api/recipes/:id/steps/reorder** body:
```json
{ "stepIds": [12, 9, 14] }
```
Must contain every step ID belonging to the recipe, or the request is rejected.

---

### Brew Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/brew-sessions` | List all brew sessions |
| POST | `/api/brew-sessions` | Create a brew session |
| GET | `/api/brew-sessions/:id` | Get a brew session with status log |
| PUT | `/api/brew-sessions/:id` | Update a brew session |
| DELETE | `/api/brew-sessions/:id` | Delete a brew session |
| GET | `/api/brew-sessions/:id/readings` | List fermentation readings |
| POST | `/api/brew-sessions/:id/readings` | Add a fermentation reading |
| DELETE | `/api/readings/:id` | Delete a fermentation reading |
| DELETE | `/api/status-log/:id` | Delete a status log entry |
| POST | `/api/brew-sessions/:id/photo` | Upload a session photo (multipart/form-data, field: `photo`) |
| DELETE | `/api/brew-sessions/:id/photo` | Remove the session photo |
| PUT | `/api/brew-sessions/:id/rating` | Save the tasting scorecard |
| DELETE | `/api/brew-sessions/:id/rating` | Clear the tasting scorecard |

**POST /api/brew-sessions** body:
```json
{
  "recipeId": 1,
  "recipeName": "Pacific IPA",
  "status": "brew_day",
  "brewDate": "2024-03-15",
  "plannedDate": null,
  "packagedDate": null,
  "batchSizeGallons": 5.5,
  "originalGravityActual": 1.064,
  "finalGravityActual": null,
  "abvActual": null,
  "fermentTempMin": 64,
  "fermentTempMax": 70,
  "fermentTempIdeal": 67,
  "notes": "Optional"
}
```
`status`: `brew_day` | `fermenting` | `conditioning` | `packaged`

**POST /api/brew-sessions/:id/readings** body:
```json
{
  "readingAt": "2024-03-16T10:00:00Z",
  "temperatureFahrenheit": 68.5,
  "gravity": 1.045,
  "ph": 4.2
}
```
`readingAt` is required (ISO 8601 datetime); everything else is optional.

**PUT /api/brew-sessions/:id/rating** body:
```json
{
  "appearanceAromaScore": 4,
  "flavorBalanceScore": 5,
  "mouthfeelScore": 4,
  "overallScore": 9,
  "offFlavors": [],
  "brewAgain": "as_is",
  "tastingNotes": "Optional"
}
```
Every field is optional. The three sub-scores are 1–5 and `overallScore` is
1–10; out-of-range values are rejected with a 400. `brewAgain`: `as_is` |
`with_tweaks` | `no`. `offFlavors` accepts any of `diacetyl`,
`acetaldehyde`, `dms`, `phenolic`, `oxidized`, `astringent`, `sour`,
`solvent`, `sulfur`, `light_struck` — an empty array means none were
detected. Saving stamps `ratedAt`, which is what marks a batch as rated.

**DELETE /api/brew-sessions/:id/rating** clears the scorecard. Tasting notes
are kept.

---

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List all inventory items |
| POST | `/api/inventory` | Add an inventory item |
| PUT | `/api/inventory/:id` | Update an inventory item |
| DELETE | `/api/inventory/:id` | Delete an inventory item |

**POST /api/inventory** body:
```json
{
  "name": "Cascade Hops",
  "type": "hop",
  "amount": 8,
  "unit": "oz",
  "supplier": "MoreBeer",
  "purchasedDate": "2024-03-01",
  "expiryDate": "2025-03-01",
  "notes": "Optional"
}
```
`type`: `malt` | `hop` | `yeast` | `adjunct` | `water_agent` | `other`

---

### Equipment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/equipment` | List all equipment |
| POST | `/api/equipment` | Add a piece of equipment |
| PUT | `/api/equipment/:id` | Update equipment |
| DELETE | `/api/equipment/:id` | Delete equipment |

**POST /api/equipment** body:
```json
{
  "name": "10 Gallon Kettle",
  "category": "kettle",
  "brand": "Ss Brewtech",
  "model": "Brew Kettle 10G",
  "condition": "good",
  "purchasedDate": "2023-01-15",
  "purchasePrice": "199.99",
  "serialNumber": "Optional",
  "notes": "Optional"
}
```
`condition`: `new` | `good` | `fair` | `poor`

---

### Settings — Beer Styles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/styles` | List all beer styles |
| POST | `/api/settings/styles` | Add a beer style |
| DELETE | `/api/settings/styles/:id` | Delete a beer style |

**POST /api/settings/styles** body:
```json
{ "name": "American IPA", "sortOrder": 1 }
```

---

### Settings — Unit System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/unit-system` | Get the current unit system preference |
| PUT | `/api/settings/unit-system` | Set the unit system preference |

**GET /api/settings/unit-system** response:
```json
{ "system": "imperial" }
```

**PUT /api/settings/unit-system** body:
```json
{ "system": "metric" }
```
`system`: `imperial` | `metric` | `both`

Unit lists by system:
- `imperial` — lbs, oz, gal, qt, pt, fl oz, tsp, tbsp, pkg, each
- `metric` — kg, g, L, mL, tsp, tbsp, pkg, each
- `both` — all of the above combined

The preference is stored in the database and defaults to `imperial` on a fresh install. Changing it only affects the dropdown options shown in the inventory form — existing inventory items keep whatever unit was stored when they were created.

---

### Settings — Other Preferences

Each of these follows the same `GET`/`PUT` pattern, returning and accepting the shown body shape.

| Endpoint | Body | Notes |
|----------|------|-------|
| `/api/settings/inventory-enforcement` | `{ "enabled": boolean }` | Blocks starting a brew day if required ingredients aren't in stock |
| `/api/settings/reading-retention` | `{ "days": 0 \| 90 \| 180 \| 365 \| 730 \| null }` | Auto-deletes fermentation readings older than N days; `0`/`null` keeps forever |
| `/api/settings/brewery-name` | `{ "name": string \| null }` | Shown in the UI header |
| `/api/settings/default-readings-shown` | `{ "count": 5 \| 10 \| 25 \| 50 \| 100 }` | Default number of readings shown on a fresh fermentation chart |
| `/api/settings/ferment-temp-unit` | `{ "unit": "F" \| "C" }` | Unit used for fermentation temperature thresholds/readings |
| `/api/settings/temp-alert-readings` | `{ "count": 2..10 }` | Consecutive out-of-range readings required before a temperature alert fires |
| `/api/settings/auto-conditioning` | `{ "enabled": boolean }` | Auto-advance a brew session to Conditioning once fermentation looks complete |

---

### Sensors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sensors/devices` | List all registered sensor devices with latest reading, assignment, and connection status |
| POST | `/api/sensors/devices` | Manually register a device |
| GET | `/api/sensors/devices/:id` | Get a single device |
| PUT | `/api/sensors/devices/:id` | Rename a device |
| DELETE | `/api/sensors/devices/:id` | Delete a device and all its readings |
| POST | `/api/sensors/devices/:id/assign` | Assign a device to a brew session |
| DELETE | `/api/sensors/devices/:id/assign` | Unassign a device from its current brew session |
| GET | `/api/sensors/devices/:id/readings` | List raw readings for a device |
| GET | `/api/brew-sessions/:id/sensor-telemetry` | Live telemetry for a brew: device info, latest reading, fermentation insights, alerts |

---

### iSpindel Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/integrations/ispindel` | iSpindel ingest — receives the device's JSON payload; no auth token required |
| GET | `/api/integrations/ispindel/settings` | Get integration settings (enabled flag, token) |
| PUT | `/api/integrations/ispindel/settings` | Update integration settings |
| POST | `/api/integrations/ispindel/simulate` | Send a synthetic reading for development/testing |
| GET | `/api/integrations/ispindel/status` | HA-friendly status endpoint — returns latest reading from each device |
| GET | `/api/integrations/ispindel/devices/:deviceId/readings` | Paginated raw readings for a device — query params `limit`, `offset`, `sort` (`asc`/`desc`), `start`, `end`, `brewId` |

---

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/stats` | Live host stats: CPU, memory, disk, network, temperature |
| GET | `/api/system/health-history?hours=` | Historical health samples for trend charts. `hours` defaults to 24, max 336 (14 days) |

Backs the Settings → System → Health panel, which auto-refreshes every 5 seconds.

---

### Backups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backup/config` | Get backup configuration (SFTP credentials are masked) and last-run status |
| PUT | `/api/backup/config` | Update backup configuration |
| POST | `/api/backup/test` | Test the configured SFTP connection |
| POST | `/api/backup/run` | Run a backup now — body `{ "target": "sftp" \| "local" }` (default `sftp`) |
| POST | `/api/backup/restore` | Restore from an uploaded `pg_dump` file (multipart/form-data, field `backup`) — **destructive**, wipes and replays the public schema |
| GET | `/api/backup/download` | Download a fresh backup |
| GET | `/api/backup/local-files` | List local backup files |
| GET | `/api/backup/local-files/:filename/download` | Download a specific local backup file |
| DELETE | `/api/backup/local-files/:filename` | Delete a local backup file |
| POST | `/api/backup/local-files/:filename/restore` | Restore from a specific local backup file |
| GET | `/api/backup/audit` | Coverage report — which database tables are backed up, excluded, or missing a classification, as a `coveragePercent` |

**PUT /api/backup/config** body:
```json
{
  "schedule": "daily",
  "retentionDays": 14,
  "backupBeforeUpdate": "local",
  "localPath": "/opt/fermentos/backups",
  "sftp": {
    "host": "backup.example.com",
    "port": 22,
    "username": "fermentos",
    "password": "optional — omit to keep the existing password",
    "remotePath": "/backups",
    "prefix": "fermentos"
  }
}
```
`schedule`: `none` | `daily` | `weekly`. `retentionDays` is clamped to 0–60 (`0` keeps forever). `backupBeforeUpdate` controls whether an in-app update takes a backup first (`none` | `local` | `sftp`).

---

### Admin — Software Update

Bare-metal/systemd installs only (Docker updates by rebuilding the image).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/version` | Current commit hash/branch/message, whether an update is available, and update-lock state |
| POST | `/api/admin/update` | Start an in-app update (pull, install, migrate, build, restart) |
| GET | `/api/admin/update-log` | Tail the running update's log |
| GET | `/api/admin/release-notes` | GitHub release notes, annotated with whether each release is newer than what's currently running |
| GET | `/api/admin/update-history` | Last 10 deploys, newest first, flagging which one is currently running |
| POST | `/api/admin/rollback` | Roll back to a prior deploy — body `{ "hash": "<7-40 char git SHA>" }` |
| POST | `/api/admin/restart-service` | Restart just the app service (~15s) |
| POST | `/api/admin/reboot` | Reboot the host (~30-90s) |
| POST | `/api/admin/update-lock/clear` | Force-clear a stuck update/rollback lock |
| GET | `/api/admin/repair-script` | A copy-pasteable `sudo bash` script that fixes missing sudoers permissions — always exempt from auth |
| GET | `/api/admin/sudoers-line` | The raw sudoers line the repair script installs — always exempt from auth |

---

### Admin — API Tokens

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/auth/status` | Whether token lockdown is enabled, plus the list of existing tokens (no secret values) |
| PUT | `/api/admin/auth/status` | Enable/disable lockdown — body `{ "required": boolean }` (requires at least one token to enable) |
| POST | `/api/admin/auth/tokens` | Create a token — body `{ "name": string, "scope"?: "read" \| "write" }`. The plaintext token is only returned once, in this response |
| DELETE | `/api/admin/auth/tokens/:id` | Delete a token (auto-disables lockdown if it was the last one) |

---

### Static Assets

Uploaded session photos are served at:
```
GET /api/uploads/sessions/<filename>
```

---

## License

MIT
