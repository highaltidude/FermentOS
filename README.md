# FermentOS

A self-hosted web app for home brewers to manage recipes, log brew sessions, track fermentation, and monitor ingredient inventory. Designed to run on a small always-on host on your home network — a Raspberry Pi, mini PC, NAS, or any Debian-based Linux box.

## Screenshots

![Brewery Overview Dashboard](docs/screenshots/dashboard.jpg)
*Dashboard — at-a-glance brewery overview with active fermentations and recent sessions*

| Recipes | Brew Log |
| :---: | :---: |
| ![Recipes](docs/screenshots/recipes.jpg) | ![Brew Log](docs/screenshots/brew-sessions.jpg) |
| Browse and search your recipe book | Track every batch from grain to glass |

![Inventory](docs/screenshots/inventory.jpg)
*Inventory — keep tabs on malts, hops, yeast, and adjuncts with expiration tracking*

![Settings](docs/screenshots/settings.jpg)
*Settings — manage beer styles, inventory enforcement, scheduled SFTP backups, in-app updates, and host reboots*

## Brew session lifecycle

Brew sessions move through six statuses. `scheduled` is a *pre-brew* state — the
session has been drafted but no fermentables have hit the kettle yet — so it
sits outside the stage progression bar on the session detail page:

```
scheduled  ──▶  brewing  ──▶  fermenting  ──▶  conditioning  ──▶  packaged  ──▶  complete
(pre-brew)      └─────────────── tracked stage timeline ──────────────────────────────────┘
```

When a session is `scheduled`, the `brewDate` field stores the **intended**
brew day and the detail page shows a **Start brew** button instead of the
stage bar. Clicking *Start brew* flips the status to `brewing`, sets
`brewDate` to today (the actual start), and copies the originally planned
date into a new `plannedDate` field so you can compare intent vs reality
later. Sessions started directly in `brewing` (the default for one-shot
logging) leave `plannedDate` null.

## Features

- **Recipe Manager** — Create and store beer recipes with full ingredient lists, gravity targets, ABV, IBU, and color
- **Brew Log** — Log brew sessions, track status from grain to glass (`scheduled` → brewing → fermenting → conditioning → packaged → complete)
- **Response & Stage History** — Every brew session records a timestamped log each time the status changes, always visible on the session page
- **Tasting Notes & Photo** — Attach a photo, star rating, and tasting notes to any session
- **Fermentation Tracker** — Record temperature, gravity, and pH readings over time with an interactive chart
- **Ingredient Inventory** — Track your malts, hops, yeast, and adjuncts with quantities, suppliers, and expiry dates
- **Beer Styles** — Define your own style list (Settings) used as a dropdown when creating recipes
- **Dashboard** — At-a-glance view of active fermentations and recent sessions

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Package Manager**: pnpm (monorepo workspace)

---

## Self-Host Installation

### Requirements

- Any Debian-based 64-bit Linux host (Raspberry Pi OS, Ubuntu, Debian, etc.)
- Raspberry Pi 3B+ or newer (Pi 4 recommended) works great, but a mini PC, NAS, or VM works just as well
- At least 8 GB SD card
- Internet connection

### Quick install

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

### Useful commands after install

```bash
sudo systemctl status fermentos         # check service status
sudo journalctl -u fermentos -f         # tail logs
sudo systemctl restart fermentos        # restart the app
```

### Updating

The easiest way to update is from the app itself: **Settings → System → App Update → Update now**. It pulls the latest commit, runs migrations, rebuilds, and restarts the services automatically, with a live progress bar.

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

### Accessing on your local network

The installer prints your host's IP when it finishes. You can also find it any time with:

```bash
hostname -I
```

Visit `http://<host-ip>:3000` from any device on the same network. For a stable address, assign your host a static IP in your router's DHCP settings.

---

### Manual installation (optional)

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

## API Reference

All endpoints are prefixed with `/api`. Replace `<host>` with your host's address (e.g. `http://192.168.1.239:8080`).

No authentication is required — the API is designed for trusted local network use.

---

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Counts of active brews, total recipes, and inventory items |
| GET | `/api/dashboard/active-brews` | List of currently active brew sessions |

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
  "time": 60,
  "notes": "Optional"
}
```
`type`: `malt` | `hop` | `yeast` | `adjunct` | `water_agent` | `other`
`use`: `mash` | `boil` | `whirlpool` | `dry_hop` | `other`

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

**POST /api/brew-sessions** body:
```json
{
  "recipeId": 1,
  "recipeName": "Pacific IPA",
  "status": "brewing",
  "brewDate": "2024-03-15",
  "batchSizeGallons": 5.5,
  "originalGravityActual": 1.064,
  "finalGravityActual": null,
  "abvActual": null,
  "rating": null,
  "notes": "Optional"
}
```
`status`: `scheduled` | `brewing` | `fermenting` | `conditioning` | `packaged` | `complete`

When you create a session in `scheduled` state, `brewDate` holds your *intended* brew day. The detail page shows a **Start brew** button instead of the stage progression bar; clicking it sets `status` to `brewing`, overwrites `brewDate` with today's date, and saves the original intended date in the new optional `plannedDate` field. This keeps duration math anchored on when the brew actually started, not on when you first drafted the session. Sessions created in any other status leave `plannedDate` null.

**POST /api/brew-sessions/:id/readings** body:
```json
{
  "recordedAt": "2024-03-16T10:00:00Z",
  "temperature": 68.5,
  "gravity": 1.045,
  "ph": 4.2
}
```

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

### Static Assets

Uploaded session photos are served at:
```
GET /api/uploads/sessions/<filename>
```

---

## Development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/fermentos run dev   # Frontend on :23975
```

---

## License

MIT
