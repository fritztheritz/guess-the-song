# Guess the Track — Basketball Edition 🏀

A music-guessing party game built around your SoundCloud library, themed like a basketball
broadcast: possessions instead of rounds, buckets instead of correct answers, a shot clock,
a scoreboard, and a Buzzer Beater reveal.

Pick a track → play progressively longer snippets (2s / 4s / 7s / 10s) → friends guess →
award points → move to the next possession.

## Architecture

The app itself is a **static single-page app** — deployable straight to GitHub Pages — plus
one small serverless piece needed only because SoundCloud requires it (see below).

- **Vite + React + TypeScript + Tailwind CSS v4**
- **React Router (`BrowserRouter`)** — real paths (`/admin`, not `/#/admin`). Since GitHub
  Pages can't do server-side rewrites, a direct load of a deep path is handled by the
  standard SPA-on-GitHub-Pages trick: `public/404.html` (which GH Pages serves for any
  unrecognized path) redirects back to `index.html` with the original path encoded in a
  query string, and a small restore script in `index.html` decodes it back into the URL bar
  before React Router mounts. See `src/main.tsx`, `public/404.html`.
- **SoundCloud auth**: OAuth **Authorization Code + PKCE**. The `/authorize` redirect and PKCE
  challenge happen entirely in the browser, same as a public client. The one exception:
  SoundCloud's `/oauth/token` endpoint requires a `client_secret` in the request body even
  for PKCE flows (their own docs: *"All clients are currently treated as confidential rather
  than public... there is no self-service option to register as a public client"*) — a static
  site can't hold that secret safely, so token exchange/refresh go through a tiny Cloudflare
  Worker (`/worker`) that's the only thing that knows the secret. See "SoundCloud token proxy"
  below.
- **Game/team/clip data**: stored in the browser's `localStorage` — one browser, one device.
  There's no shared server, so games don't sync across devices. See "Known trade-offs" below
  if you want that.
- **Audio playback**: an `AudioSource` abstraction (`src/lib/audio`) decouples the game engine
  from where the audio comes from. `SoundCloudAudioSource` streams authorized SoundCloud
  tracks by seeking an `<audio>` element and auto-stopping after N seconds; `SpotifyAudioSource`
  (behind the "Spotify Import" flag) instead delegates to one page-lifetime Web Playback SDK
  player, since Spotify has no fetchable clip URL to seek within; `LocalAudioSource` is a
  dev/testing fallback for local files. Nothing is ever downloaded or saved to disk.
- **Spotify import (optional)**: OAuth Authorization Code + PKCE too, but unlike SoundCloud,
  Spotify's PKCE flow is designed for a plain public client — no client secret, no Worker
  involved, token exchange happens straight from the browser. See "Spotify setup" below,
  including why this isn't SoundCloud's `preview_url`-based approach.

```
src/
  lib/soundcloud/   auth (PKCE), API client, track browsing, stream resolution
  lib/spotify/      auth (PKCE), API client, search, Web Playback SDK wrapper
  lib/pkce.ts        shared PKCE (RFC 7636) helpers used by both providers
  lib/audio/        AudioSource abstraction + SoundCloud/Spotify/local implementations
  lib/storage/      localStorage-backed game repository
  types/            Game / Team / SongRound data model
  state/            SoundCloud/Spotify connection contexts
  pages/            Home, CreateGame, GameBuilder, Presentation, Callback
  components/       TrackCard, ClipEditor, ImportSoundCloudModal, ImportSpotifyModal, Scoreboard, ...
worker/             Cloudflare Worker: SoundCloud token exchange/refresh proxy,
                    plus the Phone Buzz-In WebSocket relay (Durable Object)
```

## SoundCloud setup

SoundCloud API registration is invite/approval-gated for new apps — you need your own
registered app before anything here will work.

1. Go to SoundCloud's developer portal and register a new application.
2. Add a **redirect URI**. It points at the app's *root* (not a `/callback` path — GitHub
   Pages only guarantees `index.html` at the base path itself; the app moves the OAuth
   response into its internal `/callback` route client-side, see `src/main.tsx`). Must
   match exactly, trailing slash included:
   - Local dev: `http://127.0.0.1:5173/guess-the-song/`
   - Production: `https://<your-github-username>.github.io/guess-the-song/`
     (adjust if your repo name or custom domain differs — the app's base path always mirrors
     the repo name, see `vite.config.ts`)
3. Copy both the **Client ID** and **Client Secret**. The secret goes only into the Worker
   (next section), never into `.env` or anything committed to this repo. See "Where
   credentials go" below.

## SoundCloud token proxy

This is the one piece of infrastructure beyond GitHub Pages, and it exists only because
SoundCloud requires a `client_secret` on every token exchange. Deploy it once:

```bash
cd worker
npm install
npx wrangler login              # opens a browser to authorize the CLI with your (free) Cloudflare account
npx wrangler secret put SOUNDCLOUD_CLIENT_SECRET   # paste your SoundCloud app's client secret when prompted
```

Before deploying, open `worker/wrangler.toml` and check:
- `SOUNDCLOUD_CLIENT_ID` matches your SoundCloud app
- `ALLOWED_ORIGINS` includes your GitHub Pages URL (and your local dev origin if you want
  `npm run dev` to exercise the real OAuth flow too)

Then deploy:

```bash
npx wrangler deploy
```

This prints the Worker's URL, something like `https://guess-the-song-auth.<your-subdomain>.workers.dev`.
That's your `VITE_SOUNDCLOUD_TOKEN_PROXY_URL` — set it in `.env` for local dev and as a repo
Variable for production (see below). The Worker only ever forwards to
`secure.soundcloud.com/oauth/token`; it never logs the secret or your tokens.

## Spotify setup (optional — Spotify Import feature flag)

Behind the "Spotify Import" flag (`/admin`), games can also pull tracks from Spotify. This
is a fundamentally different integration from SoundCloud, worth understanding before turning
it on:

- **Playback needs the Web Playback SDK, which needs Premium.** Spotify restricted
  `preview_url` (30-second clip URLs) for newly-registered apps in November 2024 — a fresh
  app today gets `null` for most tracks, the same restriction that already limits some
  SoundCloud tracks in this app. Rather than build on a preview API likely to return nothing,
  Spotify import uses the **Web Playback SDK** instead: it plays full tracks through one
  managed player connected to whoever authenticated, and Spotify requires that account to
  have **Premium**. That's the host's account, not each player's — only the person who
  connects Spotify needs Premium, and playback happens through their account regardless of
  who's in the room.
- **New Spotify apps start in Development Mode**, which only works for up to 25 accounts
  you've explicitly added as testers in the app's dashboard (Spotify's own "Extended Quota
  Mode" review is needed to lift that). If Spotify import doesn't work for a friend, check
  whether their account is on that list.
- **No Worker involved.** Unlike SoundCloud, Spotify's Authorization Code with PKCE flow is
  designed to be called directly from a browser — their own docs demonstrate a client-side
  `fetch()` to the token endpoint. Token exchange/refresh happen straight from `src/lib/spotify`,
  no client secret anywhere.

Setup:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and
   create an app.
2. Add a **Redirect URI** — same "points at the app's root" reasoning as SoundCloud's, must
   match exactly:
   - Local dev: `http://127.0.0.1:5173/guess-the-song/`
   - Production: `https://<your-github-username>.github.io/guess-the-song/`
3. Under the app's settings, enable the **Web Playback SDK** / Web API as needed, and add
   your own Spotify account's email under **Users and Access** so you can actually authorize
   (Development Mode's tester allowlist above).
4. Copy the **Client ID** — there's no secret to copy; Spotify's PKCE flow never needs one.
5. Set `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI` in `.env` (local) or as repo
   Variables (production — same place as the SoundCloud ones, see "Where credentials go").
6. Turn on the "Spotify Import" flag at `/admin` and connect from the GameBuilder's
   "+ ADD FROM SPOTIFY" button.

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SOUNDCLOUD_CLIENT_ID, VITE_SOUNDCLOUD_REDIRECT_URI, VITE_SOUNDCLOUD_TOKEN_PROXY_URL
                        # (and the VITE_SPOTIFY_* ones too, only if you're setting up Spotify Import)
npm run dev
```

Open the printed `http://127.0.0.1:5173/guess-the-song/` URL.

## Where credentials go

| Credential | Local dev | Production (GitHub Actions) | Notes |
|---|---|---|---|
| Client ID | `.env` → `VITE_SOUNDCLOUD_CLIENT_ID` | Repo **Variable** — Settings → Secrets and variables → Actions → Variables | Also set in `worker/wrangler.toml`. Bundled into public JS either way; not confidential. |
| Token proxy URL | `.env` → `VITE_SOUNDCLOUD_TOKEN_PROXY_URL` | Repo **Variable**, same name | The Worker's `*.workers.dev` URL from `wrangler deploy`. |
| Client secret | **nowhere in this repo** | **nowhere in this repo** | Set once via `wrangler secret put SOUNDCLOUD_CLIENT_SECRET` — lives only in Cloudflare's encrypted secret store for the Worker. |
| Spotify Client ID | `.env` → `VITE_SPOTIFY_CLIENT_ID` | Repo **Variable** | No secret to set — Spotify's PKCE flow doesn't use one. |
| Spotify redirect URI | `.env` → `VITE_SPOTIFY_REDIRECT_URI` | Repo **Variable** | Same "points at the app root" URI as SoundCloud's, registered separately on the Spotify app. |

## Deploying to GitHub Pages

1. Deploy the Worker first (see "SoundCloud token proxy" above) — you need its URL for step 3.
2. Push this repo to GitHub (public, since Pages serves it publicly).
3. Repo Settings → **Pages** → Source: **GitHub Actions**.
4. Repo Settings → **Secrets and variables → Actions → Variables** → add:
   - `VITE_SOUNDCLOUD_CLIENT_ID`
   - `VITE_SOUNDCLOUD_REDIRECT_URI` (your production redirect URI)
   - `VITE_SOUNDCLOUD_TOKEN_PROXY_URL` (the Worker URL from `wrangler deploy`)
5. Push to `main` — `.github/workflows/deploy.yml` builds and deploys automatically. The site
   ends up at `https://<username>.github.io/<repo-name>/`.
6. Go back to your SoundCloud app settings and make sure the production redirect URI from
   step 4 is registered there too — SoundCloud rejects callbacks to unregistered URIs. Also
   double check `worker/wrangler.toml`'s `ALLOWED_ORIGINS` includes this production URL,
   then re-run `npx wrangler deploy` if you changed it.
7. If you're also setting up Spotify Import: add `VITE_SPOTIFY_CLIENT_ID` and
   `VITE_SPOTIFY_REDIRECT_URI` as repo Variables too, and register the production redirect
   URI on the Spotify app the same way as step 6.

## Known trade-offs of this architecture

- **Tokens live in `sessionStorage`**, not a secure server-side session. They're cleared when
  the tab closes (so you'll reconnect SoundCloud each session) and never touch `localStorage`
  or the game data store.
- **Game data is per-browser** (`localStorage`), not a shared database — it won't sync across
  devices or let two hosts co-edit the same game. If you outgrow this, the natural next step
  is extending the Worker (or a similar small backend) with a hosted Postgres (e.g. Supabase)
  for the `games` table — the `AudioSource` and repository abstractions in this codebase are
  already shaped to make that swap without touching the game engine or UI.
- **Track browsing and playback (everything except token exchange) still calls SoundCloud's
  API directly from the browser**, not through the Worker — only the token exchange needed a
  secret. This assumes SoundCloud's API allows CORS for these calls with a bearer token, which
  it does today; if that ever changes, those calls would need to move behind the Worker too.
- SoundCloud's documented **15,000 stream-resolution requests per client ID per 24h** limit
  applies per app, not per user — the playback layer (`soundcloud-playback.ts`) caches
  resolved stream URLs for a few minutes to avoid re-resolving on every clue replay.
- **Spotify import requires the host to have Premium** and, until Spotify approves Extended
  Quota Mode for the app, only works for accounts added as testers in the dashboard — see
  "Spotify setup" above.

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
