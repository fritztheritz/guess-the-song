# Guess the Track — Basketball Edition 🏀

A music-guessing party game built around your SoundCloud library, themed like a basketball
broadcast: possessions instead of rounds, buckets instead of correct answers, a shot clock,
a scoreboard, and a Buzzer Beater reveal.

Pick a track → play progressively longer snippets (2s / 4s / 7s / 10s) → friends guess →
award points → move to the next possession.

## Architecture

This is a **static single-page app** — no backend, deployable straight to GitHub Pages.

- **Vite + React + TypeScript + Tailwind CSS v4**
- **React Router (`HashRouter`)** — every route lives under the same `index.html`, so GitHub
  Pages needs no server-side rewrite rules.
- **SoundCloud auth**: OAuth **Authorization Code + PKCE**, run entirely in the browser as a
  *public client* — there is no client secret anywhere in this app (see below).
- **Game/team/clip data**: stored in the browser's `localStorage` — one browser, one device.
  There's no shared server, so games don't sync across devices. See "Known trade-offs" below
  if you want that.
- **Audio playback**: an `AudioSource` abstraction (`src/lib/audio`) decouples the game engine
  from where the audio comes from. `SoundCloudAudioSource` streams authorized SoundCloud
  tracks; `LocalAudioSource` is a dev/testing fallback for local files. Clips are played by
  seeking an `<audio>` element and auto-stopping after N seconds — nothing is ever downloaded
  or saved to disk.

```
src/
  lib/soundcloud/   auth (PKCE), API client, track browsing, stream resolution
  lib/audio/        AudioSource abstraction + SoundCloud/local implementations
  lib/storage/      localStorage-backed game repository
  types/            Game / Team / SongRound data model
  state/            SoundCloud connection context
  pages/            Home, CreateGame, GameBuilder, Presentation, Callback
  components/       TrackCard, ClipEditor, ImportSoundCloudModal, Scoreboard, ...
```

## SoundCloud setup

SoundCloud API registration is invite/approval-gated for new apps — you need your own
registered app before anything here will work.

1. Go to SoundCloud's developer portal and register a new application.
2. When configuring the app, make sure it's set up as a **public client using PKCE**
   (Authorization Code + PKCE, no client secret required for token exchange). If the form
   still shows you a client secret, ignore it — this app never uses it.
3. Add a **redirect URI**. It points at the app's *root* (not a `/callback` path — GitHub
   Pages only guarantees `index.html` at the base path itself; the app moves the OAuth
   response into its internal `#/callback` route client-side, see `src/main.tsx`). Must
   match exactly, trailing slash included:
   - Local dev: `http://127.0.0.1:5173/guess-the-song/`
   - Production: `https://<your-github-username>.github.io/guess-the-song/`
     (adjust if your repo name or custom domain differs — the app's base path always mirrors
     the repo name, see `vite.config.ts`)
4. Copy the **Client ID** — you won't need a secret for this app. See "Where credentials go"
   below.

## Local development

```bash
npm install
cp .env.example .env   # then fill in VITE_SOUNDCLOUD_CLIENT_ID
npm run dev
```

Open the printed `http://127.0.0.1:5173/guess-the-song/` URL.

## Where credentials go

| Credential | Local dev | Production (GitHub Actions) | Notes |
|---|---|---|---|
| Client ID | `.env` → `VITE_SOUNDCLOUD_CLIENT_ID` | Repo **Variable** (not Secret) with the same name — Settings → Secrets and variables → Actions → Variables | Gets bundled into the public JS either way; it's not confidential for a PKCE public client. |
| Client secret | **nowhere** | **nowhere** | Never generated or read by this app. |

## Deploying to GitHub Pages

1. Push this repo to GitHub (public, since Pages serves it publicly).
2. Repo Settings → **Pages** → Source: **GitHub Actions**.
3. Repo Settings → **Secrets and variables → Actions → Variables** → add:
   - `VITE_SOUNDCLOUD_CLIENT_ID`
   - `VITE_SOUNDCLOUD_REDIRECT_URI` (your production callback URL from step 3 above)
4. Push to `main` — `.github/workflows/deploy.yml` builds and deploys automatically. The site
   ends up at `https://<username>.github.io/<repo-name>/`.
5. Go back to your SoundCloud app settings and make sure the production redirect URI from
   step 3 is registered there too — SoundCloud rejects callbacks to unregistered URIs.

## Known trade-offs of the static-site architecture

Because there's no server, a few things deviate from a "proper" backend setup on purpose:

- **Tokens live in `sessionStorage`**, not a secure server-side session. They're cleared when
  the tab closes (so you'll reconnect SoundCloud each session) and never touch `localStorage`
  or the game data store.
- **Game data is per-browser** (`localStorage`), not a shared database — it won't sync across
  devices or let two hosts co-edit the same game. If you outgrow this, the natural next step
  is a small serverless backend (e.g. a Cloudflare Worker or Vercel function) handling token
  exchange/refresh plus a hosted Postgres (e.g. Supabase) for the `games` table — the
  `AudioSource` and repository abstractions in this codebase are already shaped to make that
  swap without touching the game engine or UI.
- **Token exchange and API calls happen directly from the browser to SoundCloud.** This
  assumes SoundCloud's token/API endpoints allow CORS for public-client apps. If you hit a
  CORS error during the OAuth callback or track browsing, that's the signal you've outgrown
  the pure-static approach and need the small backend proxy described above.
- SoundCloud's documented **15,000 stream-resolution requests per client ID per 24h** limit
  applies per app, not per user — the playback layer (`soundcloud-playback.ts`) caches
  resolved stream URLs for a few minutes to avoid re-resolving on every clue replay.

## Gameplay

- **Clue progression**: 2s (4 pts) → 4s (3 pts) → 7s (2 pts) → 10s (1 pt) → reveal. Configurable
  per track in the Clip Editor.
- **Keyboard controls in Presentation mode**: `Space` play clue · `Enter` reveal / next
  possession · `→` next possession · `←` previous possession · `R` restart clue · `Esc` exit.
- **Scoring** is manual — the host clicks which team got the bucket after revealing.

## Building for production locally

```bash
npm run build
npm run preview
```
