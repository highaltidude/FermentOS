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

- **Recipe manager** — Store your recipes with full ingredient lists and step-by-step instructions, plus gravity targets, ABV, IBU, and color. Ingredients and steps are editable in place, and a recipe starts its own brew session in one click
- **Kit import** — Upload the recipe PDF from a MoreBeer kit and FermentOS reads the ingredients, hop schedule, stats and suggested yeasts into a recipe for you to check before it is saved. A sheet that covers the LME, DME and All-Grain kits becomes one recipe with three versions; you pick the version each time you brew, and only that version's ingredients are deducted from stock and called on the boil timer
- **Brew log** — Track every batch from grain to glass through four stages: Brew Day → Fermenting → Conditioning → Packaged, recording whether the finished batch went into a keg or into bottles
- **Boil timer** — A brew-day countdown that pulls the boil length and hop schedule from the recipe, ticks additions off as you go, and beeps at each addition and at flameout. With alerts set up, your phone gets each addition on time even when it is locked. See [Your first brew](#your-first-brew)
- **Dry hop reminders** — Give each dry hop a day of conditioning and the recipe gets a Dry Hop Schedule. When a batch reaches that day, your phone is reminded every 6 hours (adjustable) until you mark the addition as added on the brew page. No sensor needed
- **Stage history** — Every stage change is timestamped and kept, so you can see exactly when a batch moved and how long each stage took
- **Fermentation tracker** — Temperature and gravity over time on an interactive chart, filled in automatically if you have an iSpindel. Readings you enter by hand can also carry pH and notes
- **Alerts to your phone** — FermentOS watches every active batch that has a sensor assigned and messages you when the temperature drifts, fermentation stalls, or a sensor goes quiet — even with the app closed. Temperature is checked against the fermentation range while fermenting and an optional separate conditioning range (for a cold crash or lagering) while conditioning. See [Get alerts on your phone](#get-alerts-on-your-phone)
- **Install on your phone** — Add FermentOS to your home screen and it opens full-screen like a native app. See [Install it on your phone](#install-it-on-your-phone)
- **Optional HTTPS** — Turn it on from Settings (or with one command) to put FermentOS behind HTTPS with its own local certificate authority, for the full app install and the screen staying awake during the boil. iSpindel and Home Assistant stay on plain HTTP. See [Serve FermentOS over HTTPS](#serve-fermentos-over-https-optional)
- **Tasting and rating** — Score a finished batch on appearance and aroma, flavor and balance, and mouthfeel and carbonation (1–5 each) plus an overall 1–10, tag off-flavors, note whether you would brew it again, and attach a photo. Scores roll up to an average on the recipe, so each recipe carries the record of every batch brewed from it
- **Ingredients** — Malts, hops, yeast, and adjuncts with quantities and expiry dates. Compare prices across several suppliers per item, with a preferred supplier shown at a glance. Optionally block a brew day when you are short of something, and deduct what the recipe uses from stock when you start one
- **Equipment** — A register of your kit: category, condition, brand and model, serial number, purchase date and price
- **Auto-advance to Conditioning** — Move a sensor-monitored batch on once it has attenuated and its gravity has stopped moving. It is checked in the background every five minutes, whether or not anyone has the app open, can notify you when it happens, and can be set globally or per batch
- **iSpindel integration** — Live gravity, temperature, battery, and tilt from iSpindel Wi-Fi hydrometers. Devices register themselves on their first reading and appear on the brew session page once assigned
- **Shelly relays** — Switch a heat wrap, fridge or pump with a Shelly 1 (SHSW-1) over your local network, by hand or for a set number of minutes that the relay itself counts down. A temperature add-on probe on the Shelly is read too and can be logged to a brew like an iSpindel. See [Connect a Shelly relay](#connect-a-shelly-relay)
- **Brew Flows** — Automations that switch your Shelly relays: hold a fermenter at temperature from an iSpindel or a Shelly probe, or run a relay on a schedule. Start from a template or build your own from triggers, conditions and actions on a drag-and-drop canvas that shows each step's live state. Relays fail off if a reading goes stale, a relay drops off the network or FermentOS itself stops, and you are notified when that happens. See [Automate with Brew Flows](#automate-with-brew-flows)
- **Home Assistant integration** — A REST endpoint plus a settings panel that writes the `configuration.yaml` block and Lovelace card for you
- **Beer styles** — Keep your own style list, used as the dropdown when creating recipes
- **Units** — Imperial, metric, or both. Controls the units offered in the ingredient form; existing entries keep what they were saved with
- **Dashboard** — What is fermenting right now and what you brewed recently, at a glance
- **Calculators** — ABV and attenuation from OG and FG, and a water chemistry calculator that suggests brewing salt additions to reach a target profile from your own tap water (saved once, prefilled after). Recipe scaling and batch cost are planned
- **System health** — Live CPU, memory, disk, and network for the host, refreshed every 5 seconds, with historical trend charts
- **Reading retention** — Optionally delete old readings from packaged batches each night to keep the database small. Off by default
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

- A 64-bit Linux host. The quick install needs a Debian-based one (Raspberry Pi OS, Ubuntu, Debian) with `sudo`, `git` and `curl`; the Docker install runs anywhere with Docker Engine and the Compose v2 plugin
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
- Install Node.js, pnpm, and PostgreSQL (if not already installed; a Node.js older than 22 is replaced with 24)
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

The script will prompt for a web port (default 3000), generate secure random credentials, write `.env`, and start the stack. It prints `http://localhost:<port>` when done; from another device use the host's IP instead.

- Data is persisted in a Docker volume (`postgres_data`); uploaded photos are stored in `./data/uploads` and local backups in `./data/backups`
- To update: `bash docker-install.sh`. It fetches the latest code for the branch you are on (`main` or `beta`), rebuilds, and restarts. It resets the checkout to match GitHub, so local edits to tracked files are discarded; `.env` and `./data` are kept
- Always start the stack through the script rather than `docker compose up` directly: it creates `.env` and the `./data` directories with the right ownership, and stamps the build with its version
- The in-app update/rollback system (Settings → System → Updates) is a bare-metal/systemd feature — Docker installs update by pulling and rebuilding the image instead

**Non-interactive / unattended install:**
```bash
FERMENTOS_PORT=7070 bash docker-install.sh
```

**Raspberry Pi / ARM:** the same `bash docker-install.sh`. The image builds for whatever architecture the host is.

**Useful commands:**
```bash
docker compose logs -f app   # stream logs
docker compose ps            # check health status
docker compose down          # stop (data preserved)
```

#### Accessing on your local network

The quick installer prints your host's IP when it finishes. You can also find it any time with:

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
a detour later. (You can also type a style by hand on the recipe.)

While you are in **Settings → Brewing**, **Brewery Name** sets the heading on
the Dashboard, and **Fermentation Temperature → Temperature Unit** switches the
temperature ranges and alerts between °F and °C. Readings you type in by hand
are still entered in °F.

**2. Create a recipe**

**Recipes → New Recipe.** Give it a name, pick the style, and set your batch
size. Add the grain bill, hops, and yeast, and optionally the mash and boil
steps.

Brewing a MoreBeer kit? **Recipes → Import** reads the kit's recipe PDF
instead. Download the PDF from the kit's product page (a scan of the printed
sheet will not work — it has no text to read), upload it, and check what was
read before saving:

- **Style** is not printed on the sheet, so pick one.
- Anything the sheet leaves out is flagged at the top — usually an amount, such
  as the clarifier's — and has to be filled in or removed before you can save.
- The sheet suggests several yeasts. Pick the one you will use and it is added
  as an ingredient; the full list stays in the notes.
- Kit names rarely match what you call things. If you track stock, change each
  name to the matching item from **Ingredients** — start typing and pick it from
  the list.

When the sheet covers the LME, DME and All-Grain kits, all three are saved as
**one recipe with three versions**. Shared ingredients appear once; the ones
that differ are marked with the versions they belong to. The recipe page shows
one version at a time, and each ingredient's **Used in** setting can be changed
when you edit it. MoreBeer kits are 5 gallons, which is what the import assumes.

Set the **fermentation temperature range** while you are here. It is optional,
but it is what lets FermentOS tell you later that a batch is running hot — see
step 7.

If the beer spends conditioning at a different temperature — a cold crash, a
lager, warm bottle conditioning — also set the **conditioning temperature
range**. Leave it blank and FermentOS stops checking temperature once the batch
moves to Conditioning.

For the boil timer, set each boil hop's **Use** to **Boil**. A field appears for
the **minutes left in the boil** when it goes in: 60 for bittering, 15 for
flavor, 0 for flameout. Set whirlpool hops to **Whirlpool**; they are called at
flameout. On a recipe you have already saved, click **+ time** (or the
existing **@ 15 min**) next to a boil or whirlpool ingredient to set or change it.
The pencil beside any ingredient edits the rest: name, amount, unit, type, use
and notes.
A boil addition with no time is listed on the boil page under **No time** and
gets no alert; set its time there or on the recipe to schedule it. A boil step with a
duration sets the boil length; without one, FermentOS uses your longest boil
addition, or 60 minutes.

For dry hops, set the **Use** to **Dry hop** and fill in the **day of
conditioning** it goes in: 0 is the day the batch moves to Conditioning, 3 is
three days after. The recipe page lists them in a **Dry Hop Schedule** card
(its **Add dry hop** button fills in the hop type and use for you). Days are
counted from when the batch last entered Conditioning, so a batch you move
there late gets its dry hops late too. A dry hop with no day is listed but gets
no reminder.

**3. Stock your ingredients** *(optional)*

**Ingredients** is where malts, hops, yeast, and adjuncts live, with quantities
and expiry dates. Each item can list several suppliers with their price per
unit. Star the one you usually buy from and it shows on the item's row;
otherwise the cheapest is shown. You can skip this entirely and come back to it.

It becomes required only if you turn on **Settings → Brewing → Ingredient
Enforcement**, which stops you starting a brew day when you are short of
something and tells you exactly what is missing. When the brew does start, the
recipe's ingredients are deducted from stock, oldest purchase first. It applies
only to sessions started from a recipe, and an ingredient matches stock only
when the name, type and unit are all the same — there is no unit conversion.
An ingredient listed more than once — a hop at 45 minutes, at flameout and as a
dry hop — is added up first, so the check is against the total. For a recipe
with several versions, only the version you are brewing is checked and
deducted.

**4. Start a brew session**

Open the recipe and click **Start Brew Session**, or go to **Brew Log → New
Session** and choose the recipe from the dropdown. Either way FermentOS fills in
the name, batch size, and fermentation and conditioning temperature ranges for you.

If the recipe has several versions (an imported kit), you are asked **which
version you are brewing**. That choice decides what is taken from stock and
what the boil timer lists, and it is shown beside the session's name. If you are
short on ingredients for one version, the dialog says what is missing and lets
you switch to another.

You do not need a recipe to log a batch — a **name and a brew date are the only
required fields**, so a spur-of-the-moment brew can be recorded now and tidied
up later. If you skip the recipe, set the fermentation temperature range on the
session itself if you want temperature alerts.

The session starts at **Brew Day** unless you pick another status on the form,
which is how you log a batch that is already fermenting or finished.

**5. Run the boil**

On a Brew Day session, tap **Start Boil** — on the session page, on the
Dashboard, or from the Boil icon described in
[Install it on your phone](#install-it-on-your-phone). Check the boil length,
then **Start boil**. You get:

- a large countdown that keeps running if you close the app, lock the phone, or reload — and shows the same time on every device
- **Add now** and **Next** cards, and a checklist of every boil and whirlpool addition to tick off as they go in
- a beep, vibration (Android), and on-screen message at each addition and at flameout while the page is open
- a message to your phone at each addition and at flameout even when it is locked, if you have set up [alerts](#get-alerts-on-your-phone)

**Pause** holds the clock (a boil-over, a stuck valve), and **Finish** ends the
boil; then record your OG on the session. Keeping the screen awake needs
FermentOS on HTTPS, so on a plain home-network install your phone may lock
during the boil. The timer and the alerts carry on regardless.

**6. Attach an iSpindel** *(optional)*

If you have one, drop it in the fermenter and assign it to this session — see
[Connect an iSpindel](#connect-an-ispindel). From then on every reading it
sends is logged against this batch automatically.

No iSpindel? Add readings by hand on the session page. The chart and the
readings list work from what you enter. Fermentation insights, the live
telemetry card, alerts, and auto-advance all need an assigned sensor.

**7. Watch it ferment**

Move the session to **Fermenting** using the stage bar at the top of the page.
You now get:

- a chart of gravity and temperature over time
- with a sensor assigned, **fermentation insights** — attenuation so far, how fast it is moving, and whether it looks finished — and a live telemetry card

This is also the point where alerts start earning their keep. Set them up once
and your phone tells you about a stall or a temperature swing without you
opening anything — see [Get alerts on your phone](#get-alerts-on-your-phone).

**8. Package it and rate it**

When fermentation finishes, advance to **Conditioning**, then **Packaged**.
(FermentOS can make the Conditioning step for you — see **Settings → Brewing →
Fermentation Temperature → Auto-advance to Conditioning**. It needs an assigned
sensor. FermentOS checks every five minutes in the background, so a batch moves
on once the sensor's gravity has stopped moving even if nobody opens its page,
and you can be notified when it does. Flat gravity only counts as finished once
the beer has attenuated at least 50%, so a slow start or a stall is left in
Fermenting. A single batch can override the global setting from **Edit →
Auto-advance to Conditioning**, and moving a batch back to Fermenting by hand,
from the app, Home Assistant or the API, turns auto-advance off for that batch.)

Marking a batch Packaged asks whether it went into a keg or into bottles, and
the answer is shown on the batch afterwards. You can change it any time from
**Edit → Packaged In**. Any iSpindel assigned to the batch is unassigned at this
point, ready for the next one.

**Rate this Batch** opens the tasting scorecard at any stage, though it is meant
for the finished beer: appearance and aroma,
flavor and balance, mouthfeel and carbonation, an overall score out of ten, any
off-flavors, and whether you would brew it again. Those scores roll up to an
average on the recipe, so over time each recipe carries the record of every
batch you have made from it.

---

### Get alerts on your phone

FermentOS checks every active batch that has a sensor assigned every five
minutes and can message you when something needs attention. A batch with only
hand-entered readings is not monitored; boil alerts and dry hop reminders are
the kinds that need no sensor.

| Alert | Fires when |
|-------|-----------|
| Temperature out of range | A reading falls outside the batch's fermentation temperature range — or, while conditioning, its conditioning range if one is set |
| Fermentation stalled | Gravity has not moved for 24 hours while the batch is Fermenting — sent once per batch |
| Sensor offline | Your iSpindel has stopped reporting |
| Sensor battery low | The iSpindel battery drops below 20% |
| Boil additions | A boil timer is running and a hop addition, or flameout, is due |
| Dry hop reminders | A batch in Conditioning has reached a dry hop's day — repeats until you mark it added |
| Moved to Conditioning | Auto-advance has moved a finished batch on to Conditioning — sent once |

Boil additions are the exception to the five-minute check: each one is sent at
the moment it is due, and anything you have already ticked off on the checklist
is skipped. They have their own **Boil additions** checkbox, on by default.

Dry hop reminders don't stop by themselves. Once a dry hop's day arrives, a
**Dry Hops** card on the brew page shows it as due. You get a reminder straight
away, then again every 6 hours, until you click **Mark added** there; the
reminders stop within five minutes. Two dry hops on the same day share one
message. Moving the batch out of Conditioning also stops them. They have their
own **Dry hop reminders** checkbox (on by default), and a **Remind again every**
setting of their own, separate from the general one.

Moved to Conditioning is sent once, at the moment auto-advance moves a batch, and
has its own **Moved to Conditioning** checkbox (on by default). The batch still
moves with the checkbox off or with no delivery method set up; you just aren't
told.

Both delivery methods are **outbound** — FermentOS makes the request, nothing
connects in to it. That is what makes this work on an ordinary home network with
no certificates, no reverse proxy, and no VPN on your phone.

#### Using ntfy (easiest)

[ntfy](https://ntfy.sh) is a free push-notification app. Nothing to sign up for.

1. Install **ntfy** from the App Store or Play Store
2. Pick a topic name nobody could guess — treat it like a password, because anyone who knows it can read your alerts. Something like `fermentos-a8f3k2q1` rather than `brewing`
3. In the app, subscribe to that topic
4. In FermentOS, go to **Settings → Brewing → Notifications**, set **Channel** to **ntfy**, and paste the same topic. If you run your own ntfy, change **Server** from the default `https://ntfy.sh`
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
alerts still work fine. Set the range on the session, or on the recipe so
future batches inherit it.

Conditioning has its own optional range. While a batch is in Conditioning,
temperature is checked against that instead, and if neither the session nor the
recipe has one, temperature alerts are off for that stage. The brew page's chart
lines follow the same rule and are labelled **Cond.** when they show the
conditioning range.

You can also tune how jumpy temperature alerts are with **Settings → Brewing →
Fermentation Temperature → Temperature Alert Threshold**. It is the number of consecutive
out-of-range readings needed before you get told, so opening the fermenter for a
minute does not wake you at 3am. **Re-notify at most every**, in the
Notifications panel, controls how often
a problem that is still ongoing nags you again. Temperature can have its own,
shorter interval — it is the one alert you can act on the moment you hear it, so
an hourly nudge is useful where an hourly battery warning would just be noise.

The stall alert is the exception: it is sent once per batch and never repeats,
and it stops being checked when you move the batch to Conditioning, where flat
gravity is exactly what you want.

---

### Install it on your phone

FermentOS can live on your home screen and open full-screen, without a browser
bar, like a normal app.

**On iPhone or iPad:** open FermentOS in Safari, tap **Share**, then
**Add to Home Screen**. That is it — it launches standalone, with the right icon.

**On Android:** open FermentOS in Chrome, tap the **⋮** menu, then
**Add to Home screen**. You get an icon and it opens quickly, though Chrome
reserves its proper "Install app" prompt for sites served over HTTPS.

**Jump straight to the boil timer:** open `http://<host-ip>:<port>/boil` and
add *that* page to your home screen as well, named something like "Boil". It
opens the timer for the batch on Brew Day, or lets you pick if there is more than
one. If FermentOS is served over HTTPS and installed as an app, you also get a
**Start Boil** shortcut by long-pressing the app icon (Android) or right-clicking
it (desktop Chrome and Edge). iPhone does not support app-icon shortcuts, so use
the separate Boil icon there.

**What you do not get yet:** offline access and web push notifications
([#145](https://github.com/highaltidude/FermentOS/issues/145),
[#146](https://github.com/highaltidude/FermentOS/issues/146)). Both will need
HTTPS, which is why phone alerts go through ntfy or a webhook — those work over
plain HTTP today. The Chrome install prompt, the Start Boil shortcut, and keeping
the screen awake during the boil already work once FermentOS is on HTTPS; see
[Serve FermentOS over HTTPS](#serve-fermentos-over-https-optional).

Repeat visits are quick either way: the app's assets are cached by your browser,
so day-to-day use is not waiting on the Pi.

---

### Serve FermentOS over HTTPS (optional)

Everything in FermentOS works over plain HTTP, and you can skip this section. Turn
HTTPS on if you want what browsers keep for secure sites:

- Chrome's proper **Install app** prompt, and the long-press **Start Boil** shortcut
- the screen staying awake on the boil timer
- later, offline access and web push ([#145](https://github.com/highaltidude/FermentOS/issues/145), [#146](https://github.com/highaltidude/FermentOS/issues/146))

**Why not a self-signed certificate?** Clicking past the browser warning does not
help: Chrome still refuses to install the app or run a service worker on a page
with a certificate error. What works is a small certificate authority of your
own, which each device trusts once. FermentOS sets one up for you with
[Caddy](https://caddyserver.com): it creates a root certificate that lasts ten
years, issues and renews the site certificate from it automatically, and sits in
front of FermentOS on ports 443 (HTTPS) and 80 (HTTP).

iSpindel and Home Assistant keep using plain HTTP — Caddy passes `/api/...` on
port 80 straight through, so an iSpindel set to port 80 needs no changes (if
yours posts to the app's own port, e.g. 3000, that keeps working too). Your old
`http://<pi-ip>:3000` address also keeps working. Every other page on port 80
redirects to HTTPS.

**1. Turn it on**

Open **Settings → System → Integrations → HTTPS**. The panel walks you through
the rest of this section — turning it on, the root certificate download, and the
steps for each kind of device.

*Installed with `install.sh` (the usual Raspberry Pi install):* pick the Pi's
address, optionally add names such as `fermentos.local`, and click **Turn on
HTTPS**. FermentOS installs Caddy, points it at itself, and shows the addresses
to use; **Turn off** puts everything back. If ports 80 or 443 are taken by
something else it stops and says so — choose other ports under the panel's port
option. If the Pi already runs Caddy with its own configuration, it stops too,
rather than replace that configuration and take your other sites offline.

Installing Caddy needs root, which FermentOS gets through a small helper that
`install.sh` puts in place. On an install from before this was added, the panel
shows a one-time command to run on the Pi first:

```bash
curl -sSL http://<pi-ip>:3000/api/admin/repair-script | sudo bash
```

From a shell instead, run `sudo bash enable-https.sh` in the FermentOS folder.
It does the same thing, issuing the certificate for the Pi's IP and for
`<hostname>.local`; set `FERMENTOS_IP` and `FERMENTOS_NAMES` (space-separated)
to choose them yourself, and `HTTP_PORT` / `HTTPS_PORT` to move off 80/443.

*Installed with Docker (on a Pi or anything else):* the app runs in a container
and can't add a service to your compose setup, so the panel generates the lines
for you and shows when Caddy is up. Add them to `.env` in the FermentOS folder,
then run `docker compose up -d`:

```bash
COMPOSE_PATH_SEPARATOR=:          # lets the next line work on Windows too
COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml
FERMENTOS_IP=192.168.1.50        # this machine's LAN IP
FERMENTOS_NAMES=fermentos.local  # optional extra names, space-separated
```

`COMPOSE_FILE` makes every later `docker compose` command, including
`docker-install.sh` and updates, include Caddy. `HTTP_PORT` / `HTTPS_PORT` move
it off 80/443 if those are taken.

**2. Reserve the IP address.** The certificate names the Pi's IP, so give the Pi
a fixed address in your router's DHCP settings. If the IP ever changes, choose
the new address in Settings and re-apply (or re-run `enable-https.sh`, or update
`FERMENTOS_IP`) — devices keep trusting the same root, so there's nothing to
redo on them. `<hostname>.local` names work on
iPhone, Mac, Windows and Linux, and on Android 12 or later; use the IP on older
Android phones.

**3. Trust the root certificate on each device.** Download it from
`http://<pi-ip>/root.crt`, then:

- **iPhone / iPad:** open the download and allow the profile, install it under
  **Settings → General → VPN & Device Management**, *then* turn it on under
  **Settings → General → About → Certificate Trust Settings**. Skipping that
  last switch is the usual reason it "doesn't work".
- **Android:** **Settings → Security → More security settings → Encryption &
  credentials → Install a certificate → CA certificate**, and pick the
  downloaded file. (Menu names vary a little by phone maker; search Settings for
  "CA certificate".)
- **Windows:** double-click the file → **Install Certificate** → **Local
  Machine** → **Trusted Root Certification Authorities**.
- **Mac:** double-click to add it to Keychain Access, open it, and set
  **When using this certificate** to **Always Trust**.
- **Firefox (desktop):** uses its own list — **Settings → Privacy & Security →
  View Certificates → Authorities → Import**.

Now open `https://<pi-ip>` and install FermentOS from there as described
[above](#install-it-on-your-phone).

**Keep the CA private.** The root's private key lives on the Pi (Docker: the
`caddy_data` volume; native: `/var/lib/caddy`). Anyone holding it could
impersonate *any* website to the devices that trust your root, so never copy it
anywhere shared. To undo everything, click **Turn off** in Settings or run `sudo bash enable-https.sh --disable`
(or remove the `COMPOSE_FILE` line and run `docker compose up -d
--remove-orphans`), and remove the certificate from each device.

**Other ways to get HTTPS**, if they suit you better:

- **Tailscale** — if every device you use already runs Tailscale, `tailscale
  serve` can put FermentOS on your tailnet name with a publicly-trusted
  certificate, so there's no root to install. Devices without Tailscale can't
  reach that address.
- **Chrome flag (one device, for testing)** — `chrome://flags` → *Insecure
  origins treated as secure* → add `http://<pi-ip>:3000`. Chrome on that device
  then treats FermentOS as secure. Handy for a quick try; not something to rely on.

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
| Port | the port you open FermentOS on (e.g. `3000`), or `80` if you [serve it over HTTPS](#serve-fermentos-over-https-optional) |
| URL | `/api/integrations/ispindel` |
| Protocol | HTTP |

Leave all other fields at their defaults. The iSpindel's **Name** field becomes the `deviceKey` used to identify it in FermentOS.

#### 3. First reading

On the next wake cycle the iSpindel will POST to FermentOS. If no device with that `deviceKey` exists yet, one is **auto-created** — you will see it appear in the Integrations panel immediately after the first reading. You can also add one ahead of time with **Register**, and rename or remove a device from the same panel. Opening a device shows its own history: gravity, temperature and battery charts, filterable by time span or by brew.

#### 4. Assign to a brew session

In the Integrations panel, select an active brew from the **Assign to brew…** dropdown; on the brew session page, use **Assign iSpindel**. From that point on, every incoming reading is also mirrored into the session's fermentation chart and a live telemetry card appears on the brew session page. The device is unassigned automatically when the batch is marked Packaged.

#### 5. Optional: secure with a token

Set a **Security Token** in the Integrations panel. Then open the iSpindel web UI and enter the same value in its **Token** field. FermentOS will reject readings that don't include the matching token.

> **Note:** The ingest endpoint (`POST /api/integrations/ispindel`) and the status endpoint (`GET /api/integrations/ispindel/status`) are always exempt from API key lockdown so the iSpindel device can reach them without a bearer token.

#### Simulate a reading (development)

Expand the **Developer: Simulate iSpindel Reading** section in the Integrations panel and click **Send Reading** — useful for testing before your device arrives or while debugging.

### Connect a Shelly relay

A [Shelly 1](https://www.shelly.com/) (model SHSW-1) is a small Wi-Fi relay that can switch a heat wrap, a fermentation fridge or a pump. FermentOS talks to it directly over your home network using its local HTTP API — no Shelly cloud account needed. If you fit the Shelly temperature add-on with a DS18B20 probe, FermentOS reads that too.

> **Safety first.** A Shelly 1 switches mains voltage. Have it wired by someone qualified, inside a proper enclosure, and keep the device's own fuse or breaker in place. FermentOS adds software safeguards; it is not a substitute for a thermal cut-out on a heater.

#### 1. Put the Shelly on your network

Set the Shelly up with the Shelly app or its own hotspot (`http://192.168.33.1`) so it joins your Wi-Fi, then find its IP address in the app or your router's device list. Giving it a fixed (reserved) IP address in your router saves you updating FermentOS if it changes.

#### 2. Add it to FermentOS

Go to **Settings → System → Integrations → Shelly Relays** and click **Add relay**. Enter its IP address and click **Check device** — FermentOS confirms it found a Shelly, whether the relay is on, and whether a probe is fitted. Give it a name and click **Add relay**.

If you turned on *Restricted Login* in the Shelly's settings, enter the same username and password. They are stored on your FermentOS server and never sent back to the browser.

#### 3. Make it fail safe

Click the shield icon next to the relay. This sets the Shelly to come back **off** after a power cut, instead of restoring whatever state it was in.

#### 4. Switch it

Use **Turn on / Turn off**, or set **or run for … min** and click **Start timer** to turn it on for a fixed time. Timed runs are counted down by the Shelly itself, so the relay still switches off on time even if FermentOS restarts or the network drops.

The list refreshes every ten seconds. A red dot means FermentOS couldn't reach the relay on its last three tries — check it is powered and on Wi-Fi, and that its IP address hasn't changed.

#### 5. Log the probe to a brew *(optional)*

Once FermentOS sees a probe reading, a **Log probe to brew…** dropdown appears under the relay. Pick an active brew and the probe's temperature is added to that brew's fermentation chart every five minutes, labelled *Shelly probe*, and counts towards its temperature alerts — the same as an iSpindel would.

#### Try it without hardware (development)

`scripts/shelly-sim.ts` is a stand-in Shelly 1 for testing. Run it with `node scripts/shelly-sim.ts` (Node 24 or later), add `localhost:8081` as the relay address, and set the fake probe's temperature with `curl 'localhost:8081/sim?temp=21.5'`.

### Automate with Brew Flows

A Brew Flow switches your [Shelly relays](#connect-a-shelly-relay) for you, either to hold a fermenter at a temperature or on a schedule. Open **Flows** in the sidebar (on a phone, tap the **Brew Flows** card on the Dashboard) and click **New flow**.

#### Hold a fermenter at temperature

Choose **Fermentation temperature**, then:

- **Relay**: the Shelly switching your heat wrap or fridge.
- **Temperature from**: an iSpindel, or a Shelly's own probe. A probe updates every few seconds, while an iSpindel reports every 15 minutes or so, so a probe gives much tighter control.
- **Mode, Target and Swing**:
  - In **Heat** mode, the relay turns on once the temperature drops *Swing* below the target, and turns off again when it reaches the target.
  - **Cool** mirrors that above the target. It also keeps the relay off for at least 5 minutes between runs, to protect a fridge compressor.
- **Only while the sensor's brew is fermenting or conditioning**: lets the flow stand down by itself once you mark the batch Packaged.

Leave **Turn on now** ticked and click **Create flow**. The flow checks the temperature every 30 seconds. The card on the Flows page shows the current reading and whether the relay is on. Expand it to see each step and a log of every switch.

#### Run a relay on a timer

Choose **Timed relay**, pick a relay, choose a time of day (and optionally which days) or every few hours, and set how many minutes it should run. **Run now** on the flow's card tests it straight away.

#### Build or change a flow on the canvas

Click **Open** on a flow's card to see it as a diagram, or choose **Blank flow** under **New flow** to start from nothing. Steps run top to bottom:

- **Start with** a trigger. **Temperature** re-checks a sensor every 30 seconds; **Schedule** runs at set times. A flow has exactly one.
- **Only if** steps let the flow continue only while something is true: the temperature is above, below or between values, the time is inside a window (which may cross midnight), or the sensor's brew is at a given stage.
- **Control** holds a temperature with a thermostat. It must be the last step on its branch.
- **Then** steps act: switch a relay, send a notification, or (in schedule flows) wait.

Click a step in the left-hand list to add it under the selected step, or drag it onto the canvas. To join two steps, drag from the dot at the bottom of one to the dot at the top of the next. A step can branch into several steps, but each step follows only one. Select a step to change its settings on the right; press **Delete** to remove a step or a line.

Save with **Save** or Ctrl+S. A flow that's turned off saves even when it's unfinished, and any problems are shown in red on the steps they concern. A flow that's on only saves once every step is valid. Steps that don't suit the trigger are greyed out: a schedule can't hold a temperature, and a temperature flow can't wait.

While the flow is on, a green dot marks each step that was reached on the last check, and the lines leading to them move. The temperature step shows the current reading and the thermostat shows whether its relay is on.

On a phone the diagram is read-only. You can still turn the flow on or off and see its activity there.

#### What keeps it safe

FermentOS fails **off**. While a flow holds a relay on, it renews a short countdown on the Shelly every 30 seconds. If the countdown isn't renewed for 90 seconds, the Shelly switches itself off, whatever has happened to FermentOS, the Pi or the Wi-Fi. A timed run is counted down by the Shelly in the same way.

A flow also switches its relays off and sends you a notification when it can no longer tell what to do:
- the temperature reading goes stale (a probe unplugged, an iSpindel that has stopped reporting);
- a relay can't be reached;
- the flow hits an error.

It picks up again by itself once the problem clears. These alerts go to the channel you set up in [Get alerts on your phone](#get-alerts-on-your-phone); set one up if you rely on flows.

After FermentOS restarts, every relay a flow controls is switched off first, then the flows take over again.

A relay can belong to only one flow that's turned on, so two flows can never fight over it. While a flow controls a relay, the relay's manual buttons in Settings are replaced by a link to that flow. Turn the flow off to switch the relay by hand.

---

### Everyday use

Brew sessions move through four stages, in order:

```
Brew Day  ──▶  Fermenting  ──▶  Conditioning  ──▶  Packaged
```

A new session starts at **Brew Day** by default. The stage bar at the top of the
session page moves a batch forward — or back, if you jumped the gun — in one
click, and every change is written to a timestamped history you can see further
down the page. The brew date records the day grain actually hit the kettle,
which is not always the day you got round to logging it.

Day to day, that means:

- **Dashboard** shows what is fermenting now and what you finished recently, plus a live boil countdown on brew day
- **Brew Log** is the full history of every batch
- **Recipes** carries the average score of every batch brewed from it, so your best recipes surface themselves over time
- **Ingredients** tracks what you have and flags what is about to expire
- **Equipment** is a register of your kit, searchable and filtered by category
- **Calculators** has ABV and attenuation, and water chemistry (below)

**Water chemistry.** Under **Calculators → Water Chemistry**, enter the six
values from your water report (calcium, magnesium, sodium, sulfate, chloride,
bicarbonate, in ppm) and press **Save as my water** so they are filled in next
time, on any device. Leave them at zero, or press **Use RO water**, for RO or
distilled water. Pick a target, either a style profile such as **Light colored
and hoppy** or a historic city such as **Burton on Trent**, or enter your own,
then the total water volume, and press **Suggest additions**. FermentOS works
out grams of gypsum, calcium chloride, Epsom salt, table salt, and baking soda
that get closest to the target. Change any amount and the resulting profile,
sulfate-to-chloride ratio, and residual alkalinity update as you type. Salts
can only add minerals, so if your water already has more of something than the
target, it tells you to mix in RO or distilled water instead. Chalk is never
suggested, because it barely dissolves without acid or CO₂; for high-alkalinity
targets such as Dublin or Munich the calculator says so rather than making the
water salty with baking soda. Target values
come from Brewer's Friend's published table; treat the historic city ones as a
starting point, not a specification.

Only Brew Day, Fermenting, and Conditioning batches with a sensor assigned are
monitored for alerts. Once a batch is **Packaged** it is finished, and a stale
probe reading will never wake you up about it.

Two housekeeping settings under **Settings → Brewing**: **Reading Retention**
deletes readings older than the age you choose from packaged batches, along
with old sensor readings that belong to no batch, every night. It is off until
you turn it on, and what it deletes is gone. The default
number of readings shown on a session page is set there too.

**Settings → System → Power** has **Restart App** and, on a bare-metal install,
**Reboot Host**.

---

# Advanced

*Everything from here on is optional. The sections above cover normal use — this
part is for integrating FermentOS with other systems, running it in anger, or
building against its API.*

---

## Updating & rollback

This section is for bare-metal (systemd) installs. Docker installs update with `bash docker-install.sh` — see [Docker Installation](#docker-installation).

The easiest way to update is from the app itself: **Settings → System → Updates**. **Check for updates** looks for a newer commit; when there is one, **Update now** pulls it, runs migrations, rebuilds, and restarts the services automatically, with a live progress bar. Release notes are shown in-app, and every deploy is recorded in a history log with a one-click rollback if something goes wrong. If a build fails, the update rolls itself back.

An update is refused while the [backup coverage audit](#backups--restore) is below 100%. If an update is interrupted and leaves the page stuck, the same panel offers **Force-clear lock** and **Repair install**.

**Channels.** An install follows whichever branch its checkout is on: `main` for stable releases, `beta` for prereleases. To switch, `git checkout beta` (or `main`) in the install directory, then update.

To update manually from the command line instead:

```bash
cd FermentOS
bash update.sh
```

To go back to an earlier deploy from the command line, `bash rollback.sh <commit-hash>`. A rollback restores the code, not the database schema, so restore a backup as well if the newer version changed the tables.

Or step by step:

```bash
cd FermentOS
git pull
pnpm install
set -a; source .env; set +a   # export DATABASE_URL for the next step
pnpm --filter @workspace/db run push
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
download it, or schedule a run every day at 2 AM or every Sunday at 2 AM. A
scheduled run pushes to your SFTP server if one is configured, and writes to the
local disk if it is not, or if the SFTP push fails. If FermentOS was off or
asleep when a scheduled run was due, it takes the missed backup two minutes
after it next starts. Local backups can be deleted
automatically after 5 to 60 days. Restores work from an uploaded file or from
any backup still in local history.

Backups hold the database only. Brew photos are files in `data/uploads`; copy
that folder yourself if you want them backed up.

A restore replaces the whole database in one step: if the file turns out to be
damaged part-way through, nothing changes. A file that was cut off during a
download or upload is refused before anything is touched. A backup taken on an
older version of FermentOS is brought up to the current one's tables and
columns as it is restored.

Local backups land in `data/backups` inside the install directory. On Docker that
is bind-mounted to `./data/backups` on the host, so a dump is still there after a
rebuild — and still reachable if the container itself will not start.

Two things worth setting up before you need them:

- **Back up before updating.** Under **Configure Backup Destinations**, set
  **Pre-Update Backup** to **Save Local** or **Push to SFTP** and a snapshot is
  taken automatically before an in-app update runs, so a bad deploy is
  recoverable. It is off by default.
- **Check the coverage audit.** It compares the tables actually in your database
  against the list FermentOS knows about, and reports a percentage. Anything
  unclassified shows up as missing coverage, which is the signal that a new
  table shipped without being accounted for. In-app updates are refused while
  coverage is below 100%.

Restoring is destructive — it wipes and replays the public schema. On a
bare-metal install you can also restore from the command line with
`./restore.sh backup.sql`; it reads `DATABASE_URL` from `.env` and restarts the
service, so it does not work for Docker. The endpoint reference is under
[Backups](#backups) in the API section.

---

## Home Assistant

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ha/status` | Status for every enabled sensor device — always exempt from API token lockdown |

If you already run Home Assistant, you can build notification automations on
this endpoint instead of using FermentOS's own notifications. Each device's
`alerts` array carries the same alerts as the brew page:

- `device_offline` and `battery_low` for every device
- `temp_out_of_range` for a device assigned to a brew, checked against that
  brew's range for its current stage — the fermentation range, or the
  conditioning range while conditioning
- `gravity_stalled` while that brew is Fermenting and gravity has been flat for
  24 hours

Temperature and stall alerts only appear for a brew on Brew Day, Fermenting or
Conditioning. They are the live condition on each poll, without the built-in
notifications' consecutive-reading threshold or once-per-batch stall rule, so
add a `for:` to the automation's trigger to ride out a single odd reading.

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
    "alerts": [
      { "type": "temp_out_of_range", "message": "Temperature 74.2°F is above maximum 70°F", "triggeredAt": "2024-03-16T10:00:05Z" }
    ]
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
  "repeatHours": 6,
  "tempRepeatHours": null,
  "boilAlerts": true,
  "dryHopAlerts": true,
  "dryHopRepeatHours": 6,
  "autoAdvanceAlerts": true
}
```

`channel`: `none` | `ntfy` | `webhook`. `repeatHours` is 1–168. An empty
`types` array turns every monitored alert off.

`boilAlerts` turns boil-addition and flameout messages on or off. It is separate
from `types` because it is a one-off schedule rather than a monitored condition.
It defaults to `true`, and leaving it out of a `PUT` keeps the current value.

`dryHopAlerts` turns dry hop reminders on or off, and `dryHopRepeatHours` (1–168,
default 6) is how often a due dry hop is repeated until it is marked added.
Both are separate from `types` for the same reason as `boilAlerts`, and leaving
either out of a `PUT` keeps the current value.

`autoAdvanceAlerts` sends one message when auto-advance moves a batch to
Conditioning. It defaults to `true`, is separate from `types` for the same
reason, and leaving it out of a `PUT` keeps the current value.

`tempRepeatHours` overrides `repeatHours` for `temp_out_of_range` only, and is
also 1–168. `null` — the default — inherits `repeatHours`, so upgrading never
changes an interval you already set.

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

Boil alerts use the same envelope. Instead of `alertType` they carry `event`
(`boil_addition` or `boil_flameout`), the minutes left in the boil, and the
additions that are due:

```json
{
  "source": "fermentos",
  "title": "Pacific Haze IPA: 15 min addition",
  "message": "Add 1 oz Cascade, 0.5 oz Citra",
  "priority": "high",
  "triggeredAt": "2026-09-22T19:45:00.000Z",
  "brewSessionId": 7,
  "recipeName": "Pacific Haze IPA",
  "event": "boil_addition",
  "minutesRemaining": 15,
  "additions": [
    { "id": 12, "name": "Cascade", "amount": 1, "unit": "oz" },
    { "id": 13, "name": "Citra", "amount": 0.5, "unit": "oz" }
  ]
}
```

Dry hop reminders carry `alertType` `dry_hop_day_<N>` (one per day of
conditioning), plus `event: "dry_hop_due"` and `day`:

```json
{
  "source": "fermentos",
  "title": "Pacific Haze IPA: Time to dry hop",
  "message": "Day 3 of conditioning — add 2 oz Citra, 1 oz Mosaic. Mark it added in FermentOS to stop these reminders.",
  "priority": "high",
  "triggeredAt": "2026-10-13T18:05:00.000Z",
  "brewSessionId": 7,
  "recipeName": "Pacific Haze IPA",
  "alertType": "dry_hop_day_3",
  "event": "dry_hop_due",
  "day": 3
}
```

Brew Flows use the same envelope with `event` `flow_action` (a Notify step) or
`flow_failsafe` (a flow switched its relays off because a reading went stale, a
relay was unreachable or the flow failed), plus `flowId` and `flowName`:

```json
{
  "source": "fermentos",
  "title": "Fermenter 1 heat: relays switched off",
  "message": "Heat wrap probe reading is out of date. Its relays have been switched off until this is fixed.",
  "priority": "high",
  "triggeredAt": "2026-10-26T20:13:00.000Z",
  "event": "flow_failsafe",
  "flowId": 1,
  "flowName": "Fermenter 1 heat"
}
```
---

## Security & API tokens

By default no authentication is required — the API is designed for trusted local network use.

You can optionally enable **API token lockdown** under **Settings → System → Integrations → API Access** with the **Require API token for external clients** switch, which becomes available once at least one token exists. When enabled, all external clients (scripts, Home Assistant, integrations) must supply a token. Browser requests from the FermentOS UI itself continue to work without a token (same-origin requests are always allowed).

**Generating a token:** Settings → System → Integrations → API Access → enter a name → choose a scope → **Generate**. Copy the token immediately — it is only shown once.

- **Scope**: tokens are `read` or `write` (default `write`). A `read`-scoped token gets `403` on any `POST`/`PUT`/`PATCH`/`DELETE` request.

**Using a token:**
```
Authorization: Bearer <token>
```

**Always-exempt endpoints** (reachable with no token, even under lockdown):
- `GET /api/healthz`
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

**2. Install Node.js v24**
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**3. Install pnpm**
```bash
npm install -g pnpm
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
nano .env   # fill in DATABASE_URL, and set PORT to the port to browse to
```

**6. Install, migrate, build**
```bash
pnpm install
set -a; source .env; set +a   # export DATABASE_URL and PORT
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/fermentos run build
```

**7. Start**
```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

One process serves both the API and the built frontend, on `PORT`. It needs
`PORT` and `DATABASE_URL` in its environment, which the `set -a` line above
provides for this shell.

This runs the app in the foreground only. `install.sh` additionally creates the
`fermentos` systemd service, and the sudo permissions behind the in-app update,
restart, reboot and HTTPS buttons; without them those buttons and the
`systemctl` commands in this README do not work.

</details>

---

## Environment variables

`install.sh` and `docker-install.sh` write `.env` for you; this is what the
values mean.

| Variable | Used by | Meaning |
|----------|---------|---------|
| `PORT` | bare metal, dev | Port the app listens on. Required; the server will not start without it |
| `DATABASE_URL` | bare metal, dev | PostgreSQL connection string. Required. Docker builds it from `DB_PASSWORD` |
| `HOST_PORT` | Docker | Port published on the host. Default `3000` |
| `DB_PASSWORD` | Docker | Password for the bundled PostgreSQL. Default `fermentos`; the installer generates a random one |
| `LOG_LEVEL` | all | Server log level. Default `info` |
| `NODE_ENV` | all | `production` for an install; `development` gives readable logs and fuller error messages |
| `BASE_PATH` | build time | URL path the frontend is served under. Default `/` |

`FERMENTOS_PORT` and the HTTPS variables are installer inputs, described in the
install and [HTTPS](#serve-fermentos-over-https-optional) sections.

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

export DATABASE_URL=postgresql://fermentos:fermentos@localhost:5432/fermentos

PORT=8080 pnpm --filter @workspace/api-server run dev   # API on :8080 (builds, then starts)
pnpm --filter @workspace/fermentos run dev              # Vite frontend on :5173, or PORT if set

pnpm run typecheck   # tsc across every workspace package (no ESLint in this repo)
pnpm run test        # vitest, where a package has a test suite
pnpm run build       # typecheck, then build every workspace package

pnpm --filter @workspace/db run push            # apply schema changes (no migration files)
pnpm --filter @workspace/api-spec run codegen   # regenerate the API client after editing openapi.yaml
```

The API server needs both `PORT` and `DATABASE_URL` and does not read `.env` itself. The Vite dev server forwards `/api` requests to the API at `API_PROXY_TARGET` (default `http://localhost:8080`), so open the frontend on its own port.

Alternatively, `docker compose -f docker-compose.dev.yml up` starts a full dev stack in one command: Postgres, the schema push, the API on http://localhost:8080 and the frontend with hot reload on http://localhost:23975, against a bind-mounted repo. The API builds once at start, so after an API change run `docker compose -f docker-compose.dev.yml restart app`; after a dependency change, run `up --build -V`.

---

## API Reference

All endpoints are prefixed with `/api`. Replace `<host>` with your host's address (e.g. `http://192.168.1.239:8080`).

This reference covers the common fields. The complete contract, including every
response shape, is [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml).

`GET /api/healthz` returns `{ "status": "ok" }` and is always reachable without a token.

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Brewery name, counts of active brews, sessions, recipes and inventory items, the five most recent sessions, and the three top-rated brews |
| GET | `/api/dashboard/active-brews` | List of currently active brew sessions |
| GET | `/api/dashboard/upcoming-brews` | Deprecated compatibility stub — the "scheduled" status no longer exists; always returns `[]` |

---

### Recipes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recipes` | List all recipes — optional query params `style`, `search` |
| POST | `/api/recipes` | Create a recipe |
| POST | `/api/recipes/import` | Create a recipe with its ingredients and steps in one call |
| POST | `/api/recipes/import/morebeer/parse` | Read a MoreBeer kit-sheet PDF into a draft (saves nothing) |
| GET | `/api/recipes/:id` | Get a recipe with its ingredients, steps, and batch rating summary |
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
  "conditionTempMin": 32,
  "conditionTempMax": 38,
  "conditionTempIdeal": 34,
  "daysPlanned": 21,
  "daysBrewing": 1,
  "daysFermenting": 10,
  "daysConditioning": 7,
  "daysPackaged": null,
  "notes": "Optional brew notes"
}
```
Only `name`, `style` and `batchSizeGallons` are required. The `days*` fields are
the recipe's estimated time in each stage.

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
`use`: `mash` | `steep` | `boil` | `dry_hop` | `whirlpool` | `primary` | `secondary` | `packaging` | `other`

On a recipe with several versions, an ingredient may also carry
`"variants": ["lme", "dme"]` to limit it to those versions; omit it or send
`null` for an ingredient every version uses. Naming a version the recipe does
not have returns `400`.

A `dry_hop` ingredient takes `"dryHopDay": 3` instead of `timingMinutes`: the day
of conditioning it goes in, where 0 is the day the batch enters Conditioning. It
drives the dry hop reminders.

`PUT /api/ingredients/:id` accepts the same fields, all optional; send `null` to
clear `use`, `timingMinutes`, `dryHopDay`, `notes` or `variants`.

Ingredients are returned in the order they were added.

**Recipe versions.** A recipe's `variants` is `null` for an ordinary recipe, or
a list drawn from `lme` | `dme` | `all_grain` when it can be brewed more than
one way. It is set only by `POST /api/recipes/import`; `POST` and `PUT
/api/recipes` ignore it.

**POST /api/recipes/import** body:
```json
{
  "recipe": { "name": "Pliny the Elder", "style": "Double IPA", "batchSizeGallons": 5 },
  "variants": ["lme", "dme", "all_grain"],
  "ingredients": [
    { "name": "Light Dry Extract", "type": "malt", "amount": 7.5, "unit": "lbs", "use": "boil", "variants": ["dme"] },
    { "name": "2-Row", "type": "malt", "amount": 13, "unit": "lbs", "use": "mash", "variants": ["all_grain"] },
    { "name": "Magnum", "type": "hop", "amount": 2, "unit": "oz", "use": "boil", "timingMinutes": 90 }
  ],
  "steps": [{ "body": "Boil for 90 minutes", "phase": "boil", "durationMinutes": 90 }]
}
```
`recipe` takes the same fields as `POST /api/recipes`, `ingredients` the same as
`POST /api/recipes/:id/ingredients`, and `steps` the same as `POST
/api/recipes/:id/steps`. `variants` and `steps` are optional. Everything is
saved in one transaction: if any part is rejected, nothing is created.

**POST /api/recipes/import/morebeer/parse** takes the PDF itself as the request
body, not a form upload, up to 10 MB:
```bash
curl -X POST http://localhost:8080/api/recipes/import/morebeer/parse \
  -H "Content-Type: application/pdf" --data-binary @kit-sheet.pdf
```
It returns a draft — `name`, `variants`, `batchSizeGallons`, `stats`, `hints`,
`suggestedYeasts`, `ingredients`, `tips` and `warnings` — and saves nothing.
Draft ingredients may have a `null` `amount`, `unit` or `use` where the sheet
does not state one; fill those in before posting to `/api/recipes/import`.
`400` means the body is not a PDF or is too large. `422` means it is a PDF that
could not be read as a kit sheet, with a `code` of `no_text` (a scan),
`unrecognized_sheet` or `unreadable_pdf`.

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
| GET | `/api/brew-sessions` | List all brew sessions — optional query params `status`, `recipeId` |
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
| POST | `/api/brew-sessions/:id/boil` | Start, pause, resume, finish, or reset the boil timer, or save its checklist |
| GET | `/api/brew-sessions/:id/dry-hops` | The recipe's dry hop schedule for this batch, with due times and status |
| POST | `/api/brew-sessions/:id/dry-hops/:ingredientId/added` | Mark a dry hop added, which stops its reminders |
| DELETE | `/api/brew-sessions/:id/dry-hops/:ingredientId/added` | Undo marking a dry hop added |

**POST /api/brew-sessions** body:
```json
{
  "recipeId": 1,
  "recipeName": "Pacific IPA",
  "recipeVariant": null,
  "status": "brew_day",
  "brewDate": "2024-03-15",
  "plannedDate": null,
  "packagedDate": null,
  "packagingMethod": null,
  "batchSizeGallons": 5.5,
  "originalGravityActual": 1.064,
  "finalGravityActual": null,
  "abvActual": null,
  "fermentTempMin": 64,
  "fermentTempMax": 70,
  "fermentTempIdeal": 67,
  "conditionTempMin": 32,
  "conditionTempMax": 38,
  "conditionTempIdeal": 34,
  "notes": "Optional"
}
```
`status`: `brew_day` | `fermenting` | `conditioning` | `packaged`.
`packagingMethod`: `keg` | `bottle` — null until the batch is packaged, and
optional on create. `recipeName`, `status`, `brewDate` and `batchSizeGallons`
are required.

`recipeVariant`: `lme` | `dme` | `all_grain`. Required when the recipe has
several versions, and must be one of them, or the request returns `400`; for
any other recipe it is ignored and stored as `null`.

With Ingredient Enforcement on, creating a session from a recipe you are short
on returns `409` with `{ "error": "Insufficient inventory", "shortages": [...] }`.
Each shortage is the total needed of one ingredient, and only the chosen
version's ingredients are counted.

`PUT /api/brew-sessions/:id` accepts the same fields, plus
`autoAdvanceToConditioning` (`true` | `false` | `null` to follow the global
setting) and `tastingNotes`. Changing `recipeVariant` afterwards changes what
the boil timer lists but does not return or re-deduct stock. Setting `status` to `packaged` unassigns any sensor
on the session. Setting `status` from `conditioning` back to `fermenting` while
auto-advance is on for the batch also sets `autoAdvanceToConditioning` to
`false`, unless the same request sets it.

**POST /api/brew-sessions/:id/readings** body:
```json
{
  "readingAt": "2024-03-16T10:00:00Z",
  "temperatureFahrenheit": 68.5,
  "gravity": 1.045,
  "ph": 4.2,
  "notes": "Optional"
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

**POST /api/brew-sessions/:id/boil** body:
```json
{ "action": "start", "boilMinutes": 60, "doneAdditionIds": [] }
```
`action`: `start` | `pause` | `resume` | `finish` | `reset` | `checklist`.
`boilMinutes` (1–600) is required for `start`; sent with `pause`, `resume`,
`finish`, or `checklist` it changes the length of a boil already under way.
`doneAdditionIds` replaces the checklist of recipe ingredient ids that have gone
in, and is accepted with any action except `reset`, which clears the checklist
along with the timer. An action that does not fit the timer's
state — resuming a boil that is not paused, say — is rejected with a 400.
Returns the updated brew session.

The timer is stored as timestamps on the brew session (`boilMinutes`,
`boilStartedAt`, `boilPausedAt`, `boilPausedMs`, `boilEndedAt`,
`boilDoneAdditionIds`, all `null` until a boil is started), which
`GET /api/brew-sessions/:id` returns. Time remaining is `boilMinutes` minus the
time since `boilStartedAt`, less `boilPausedMs` and any pause in progress. Every
change reschedules the boil-addition alerts, and they are rebuilt from these
fields when the server restarts.

**GET /api/brew-sessions/:id/dry-hops** returns the recipe's dry hops that have
a `dryHopDay`, for the version being brewed, sorted by day:
```json
[
  { "ingredientId": 21, "name": "Citra", "amount": 2, "unit": "oz", "day": 0,
    "dueAt": "2026-10-10T18:00:00.000Z", "status": "added" },
  { "ingredientId": 22, "name": "Mosaic", "amount": 1, "unit": "oz", "day": 3,
    "dueAt": "2026-10-13T18:00:00.000Z", "status": "due" }
]
```
`dueAt` is the time the batch last entered Conditioning (from its stage history)
plus `day` days, and is `null` until it has. `status` is `scheduled`, `due` or
`added`. Nothing is `due` unless the batch is in Conditioning now. The two
`/added` endpoints return the updated schedule. Added ids are stored on the
session as `dryHopAddedIds`.

---

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List all inventory items — optional query params `type`, `search` |
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
  "purchasedDate": "2024-03-01",
  "expiryDate": "2025-03-01",
  "maltType": null,
  "suppliers": [
    { "name": "MoreBeer", "price": 1.56, "url": "https://www.morebeer.com", "preferred": true },
    { "name": "Northern Brewer", "price": 1.75, "url": null, "preferred": false }
  ],
  "notes": "Optional"
}
```
`type`: `malt` | `hop` | `yeast` | `adjunct` | `water_agent` | `other`
`maltType`: `lme` | `dme` | `all_grain` | `null`
`suppliers`: optional list of places to buy the item. `name` is required, `price` is per unit of the item's `unit` (nullable), `url` is optional, and at most one supplier can be `preferred` (if several are flagged, the first one wins). On `PUT`, sending `suppliers` replaces the whole list. Items carry `suppliers` in place of the single `supplier` and `cost` fields used before 1.10.

---

### Equipment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/equipment` | List all equipment — optional query params `category`, `search` |
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
| `/api/settings/reading-retention` | `{ "days": 0 \| 90 \| 180 \| 365 \| 730 \| null }` | Nightly, deletes readings older than N days that belong to packaged sessions, and sensor readings not tied to any session; `0`/`null` keeps forever |
| `/api/settings/brewery-name` | `{ "name": string \| null }` | Shown in the UI header |
| `/api/settings/default-readings-shown` | `{ "count": 5 \| 10 \| 25 \| 50 \| 100 }` | Default number of readings shown on a fresh fermentation chart |
| `/api/settings/ferment-temp-unit` | `{ "unit": "F" \| "C" }` | Unit used for fermentation temperature thresholds/readings |
| `/api/settings/temp-alert-readings` | `{ "count": 2..10 }` | Consecutive out-of-range readings required before a temperature alert fires |
| `/api/settings/source-water` | `{ "profile": { "calcium": 30, "magnesium": 8, "sodium": 12, "sulfate": 25, "chloride": 20, "bicarbonate": 90, "name": "Tap" } \| null }` | Your tap water in ppm, used to prefill the water calculator. Each ion is 0–2000; `name` is optional. `null` clears it, and `GET` returns `null` until one is saved |
| `/api/settings/auto-conditioning` | `{ "enabled": boolean }` | Global default for auto-advancing a session to Conditioning. A batch's own `autoAdvanceToConditioning` overrides it. The server checks every five minutes and moves a finished batch on |

`GET`/`PUT /api/settings/notifications` and `POST /api/settings/notifications/test`
are described under [Webhooks & alert payloads](#webhooks--alert-payloads).

---

### Sensors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sensors/devices` | List all registered sensor devices with latest reading, assignment, and connection status |
| POST | `/api/sensors/devices` | Manually register a device |
| GET | `/api/sensors/devices/:id` | Get a single device |
| PUT | `/api/sensors/devices/:id` | Update a device — any of `deviceName`, `deviceKey`, `enabled`, `notes` |
| DELETE | `/api/sensors/devices/:id` | Delete a device and all its readings |
| POST | `/api/sensors/devices/:id/assign` | Assign a device to a brew session |
| DELETE | `/api/sensors/devices/:id/assign` | Unassign a device from its current brew session |
| GET | `/api/sensors/devices/:id/readings` | List raw readings for a device — query param `limit` (default 100, max 500) |
| GET | `/api/brew-sessions/:id/sensor-telemetry` | Live telemetry for a brew: device info, latest reading, fermentation insights, alerts |

**POST /api/sensors/devices** body — `deviceName` and `deviceKey` are required:
```json
{ "deviceName": "Fermenter 1", "deviceKey": "ispindel-001", "deviceType": "ispindel", "notes": "Optional" }
```

**POST /api/sensors/devices/:id/assign** body:
```json
{ "brewSessionId": 12 }
```

---

### iSpindel Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/integrations/ispindel` | iSpindel ingest — receives the device's JSON payload; no auth token required. Returns `403` when the integration is disabled or the security token does not match |
| GET | `/api/integrations/ispindel/settings` | Get integration settings (enabled flag, token) |
| PUT | `/api/integrations/ispindel/settings` | Update integration settings — body `{ "enabled": boolean, "token": string \| null }` |
| POST | `/api/integrations/ispindel/simulate` | Send a synthetic reading for development/testing — body needs `gravity` and `temperature`; optional `deviceId`, `brewSessionId`, `deviceName`, `temperatureUnit`, `battery`, `angle`, `rssi` |
| GET | `/api/integrations/ispindel/status` | Status endpoint — `{ "devices": [...] }` with the latest reading from each enabled device |
| GET | `/api/integrations/ispindel/devices/:deviceId/readings` | Paginated raw readings for a device — query params `limit`, `offset`, `sort` (`asc`/`desc`), `start`, `end`, `brewId` |

---

### Relay Devices (Shelly)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List relay devices with their live state (`reachable`, `ison`, probe `tempC`, `rssi`, `lastError`) |
| POST | `/api/devices/probe` | Check an address before adding it — body `{ "host": string, "username"?: string, "password"?: string }`. Always `200`; `ok` is `false` with an `error` when the device can't be reached, isn't a Shelly Gen1, or rejects the credentials |
| POST | `/api/devices` | Add a relay — body `{ "name": string, "host": string, "channel"?: number, "username"?: string, "password"?: string }` |
| GET | `/api/devices/:id` | Get one relay device |
| PATCH | `/api/devices/:id` | Update any of `name`, `host`, `channel`, `username`, `password`, `enabled`. Omit `password` to keep it; send `null` to clear it |
| DELETE | `/api/devices/:id` | Switch the relay off and remove it. The probe's sensor device and its readings are kept |
| POST | `/api/devices/:id/relay` | Switch by hand — body `{ "on": boolean, "durationSec"?: number }`. With `durationSec` the Shelly switches itself back off after that many seconds. Returns `502` when the device can't be reached |
| POST | `/api/devices/:id/safe-defaults` | Set the relay to come back off after a power cut. Returns `502` when the device can't be reached |

Passwords are never returned; responses carry `hasPassword` instead. Once a relay's add-on probe reports a temperature, FermentOS registers it as a sensor device (`deviceType: "shelly_probe"`, linked by `probeSensorDeviceId`), so it can be assigned to a brew with the [Sensors](#sensors) endpoints.

---

### Brew Flows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/flows` | List flows. Each includes `kind` (`temperature` \| `schedule`, or `null` while invalid), `problems` (`[{ nodeId, message }]`), the relays it switches (`relayDeviceIds`), `lastError` and `lastRun` |
| POST | `/api/flows` | Create a flow — body `{ "name": string, "description"?: string, "graph": FlowGraph }`. New flows start turned off, so a half-built graph can be saved |
| GET | `/api/flows/:id` | Get one flow |
| PUT | `/api/flows/:id` | Update any of `name`, `description`, `graph`. A flow that is on only accepts a graph with no problems (`400` with `problems`) |
| DELETE | `/api/flows/:id` | Delete a flow; relays it controlled are switched off |
| POST | `/api/flows/:id/enable` | Turn a flow on. `400` with `problems` if the graph is invalid or a relay it switches belongs to another flow that's on |
| POST | `/api/flows/:id/disable` | Turn a flow off; relays it controlled are switched off |
| POST | `/api/flows/:id/run` | Run a schedule flow now (`202`); the outcome lands in its runs |
| GET | `/api/flows/:id/runs` | What the flow has done, newest first — query param `limit` (default 50, max 200). Kept for 14 days |
| GET | `/api/flows/:id/status` | Live state: `running`, `tempC`, `failsafe` (why relays are being held off, or `null`), `waiting`, `nextRunAt`, and per-node `{ active, relayOn?, reason? }` |

While a flow controls a relay, `POST /api/devices/:id/relay` and `DELETE /api/devices/:id` return `409`, and the device's `controlledBy` names the flow.

**FlowGraph** is a tree: one trigger node, and every other node fed by exactly one edge.

```json
{
  "version": 1,
  "nodes": [
    { "id": "t", "type": "trigger.temperature", "position": { "x": 0, "y": 0 },
      "data": { "config": { "source": { "kind": "shelly", "outputDeviceId": 3 } } } },
    { "id": "th", "type": "control.thermostat", "position": { "x": 0, "y": 120 },
      "data": { "config": { "outputDeviceId": 3, "mode": "heat", "setpointC": 20, "hysteresisC": 0.5 } } }
  ],
  "edges": [{ "id": "e1", "source": "t", "target": "th" }]
}
```

Node types and their `config` (temperatures are always °C):

| Type | Config | Notes |
|------|--------|-------|
| `trigger.temperature` | `source`: `{ "kind": "sensor", "sensorDeviceId" }` or `{ "kind": "shelly", "outputDeviceId" }` | Re-evaluated every 30 s. Relays downstream are on while the path to them passes, off otherwise |
| `trigger.schedule` | `cron` (five fields, server local time) | Runs top to bottom once per firing |
| `condition.compare` | `op` (`lt`, `gt`, `between`), `valueC`, `value2C` (for `between`) | Temperature flows only |
| `condition.timeWindow` | `from`, `to` (`HH:MM`), `days` (0 = Sunday; empty = every day) | Windows may cross midnight |
| `condition.brewStatus` | `statuses` (any of `brew_day`, `fermenting`, `conditioning`, `packaged`) | The brew the temperature sensor is assigned to; temperature flows only |
| `control.thermostat` | `outputDeviceId`, `mode` (`heat`/`cool`), `setpointC`, `hysteresisC` (default 0.5), `minOnSec`, `minOffSec` (default 300 when cooling) | Temperature flows only; must end its branch; one per relay |
| `action.relay` | `outputDeviceId`, `action` (`on`, `off`, `onFor`), `minutes` (for `onFor`) | Temperature flows use `on`; schedule flows use `onFor` or `off`, never an open-ended `on` |
| `action.notify` | `message` — `{flow}` and `{temp}` are filled in | Sent each time the step is newly reached |
| `action.delay` | `minutes` | Schedule flows only |

---

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/stats` | Live host stats: CPU, memory, disk, network, temperature |
| GET | `/api/system/health-history?hours=` | Historical health samples for trend charts. `hours` defaults to 24, max 336 (14 days) |

Backs the Settings → System → Health panel, which auto-refreshes every 5 seconds.

`GET /api/ha/status` is described under [Home Assistant](#home-assistant).

---

### Backups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backup/config` | Get backup configuration (SFTP credentials are masked) and last-run status, as `{ "config": {...}, "status": {...} }` |
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

`localPath` defaults to `data/backups` under the install directory — `./data/backups`
on the host for Docker, since that path is bind-mounted so dumps survive a
container rebuild. Upgrading a bare-metal install? Dumps already in
`~/fermentos-backups` stay exactly where they are; that location is simply no
longer the default, so point `localPath` back at it if you want them in one place.

---

### Admin — Software Update

Update and rollback are for bare-metal/systemd installs (Docker updates by
rebuilding the image). In Docker, `version` and `restart-service` still work,
and `rollback` and `reboot` return `409`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/version` | Current commit hash/branch/message, whether an update is available, and update-lock state |
| POST | `/api/admin/update` | Start an in-app update (pull, install, migrate, build, restart). Returns `409` while backup coverage is below 100% or another update, rollback or HTTPS job is running |
| GET | `/api/admin/update-log` | The last 200 lines of the update log, as `{ "log": string }` |
| GET | `/api/admin/release-notes` | GitHub release notes, annotated with whether each release is newer than what's currently running |
| GET | `/api/admin/update-history` | Last 10 deploys, newest first, flagging which one is currently running |
| POST | `/api/admin/rollback` | Roll back to a prior deploy — body `{ "hash": "<7-40 char git SHA>" }` |
| POST | `/api/admin/restart-service` | Restart just the app service (~15s) |
| POST | `/api/admin/reboot` | Reboot the host (~30-90s) |
| POST | `/api/admin/update-lock/clear` | Force-clear a stuck update/rollback lock. Returns `409` if the lock is not yet stale |
| GET | `/api/admin/repair-script` | A copy-pasteable `sudo bash` script that fixes missing sudoers permissions — always exempt from auth |
| GET | `/api/admin/sudoers-line` | The raw sudoers line the repair script installs — always exempt from auth |
| GET | `/api/admin/https` | HTTPS status: install type, whether Caddy is running and serving the root certificate, the certificate's address, names and ports, this host's LAN addresses, whether the root helper is installed, and the progress of any turn-on/turn-off job |
| POST | `/api/admin/https/enable` | Turn HTTPS on or re-apply it (native installs) — body `{ "ip": "<IPv4>", "names"?: string[], "httpPort"?: number, "httpsPort"?: number }`. Runs in the background; returns 202, 400 on invalid settings or a missing helper, 409 while an HTTPS job, update or rollback runs |
| POST | `/api/admin/https/disable` | Turn HTTPS off (native installs), same responses |

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
