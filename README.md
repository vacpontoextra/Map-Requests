# Trackmania Map Requests

A self-hosted web app that collects Trackmania map requests from Twitch chat (via a StreamElements
custom command), validates every map against [Trackmania.exchange](https://trackmania.exchange) (TMX),
and shows the queue as a live, filterable card grid. The streamer gets a password-protected admin mode
to mark maps as played, delete them, add maps manually and see stats.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · PostgreSQL

> **GitHub Pages cannot host this app.** Pages only serves static files, but the app needs a server for
> the `/api/request` endpoint, the database and the admin login. Use the free **Vercel + Neon** setup below
> (it deploys straight from your GitHub repo, so `git push` redeploys), or Docker on any server.

---

## Features

| Area | What you get |
| --- | --- |
| Requests | `GET /api/request?mapId=…&user=…` – ID, UID or a full TMX link; server timestamp stored |
| Validation | Looks the map up on TMX before saving; unknown maps are rejected with a chat-friendly message |
| Metadata | Name, author, tags, thumbnail, length, difficulty, awards, link to the TMX page |
| Dashboard | Responsive dark-theme grid · All / Unplayed / Played · newest/oldest · search · "only my requests" · live polling (5 s) · light/dark toggle |
| Admin | Login → one-click played/unplayed, bulk actions, delete, add map manually, stats |
| Protection | Per-user cooldown (database-backed), per-IP limit, duplicate detection, per-user queue cap, optional API key |
| Export | `/api/export?format=txt\|csv\|json` (unplayed queue by default) |

---

## Deploy for free: Vercel + Neon (from GitHub)

### 1. Create the database (Neon)

1. Sign up at <https://neon.tech> and create a project (free tier is plenty).
2. On the project dashboard open **Connect** and copy two connection strings:
   - **Pooled connection** → this becomes `DATABASE_URL`. Append `&pgbouncer=true&connect_timeout=15` to it.
   - **Direct connection** (turn off the "pooled" toggle) → this becomes `DIRECT_URL`.

### 2. Import the repo into Vercel

1. Sign up at <https://vercel.com> with your GitHub account.
2. **Add New → Project**, pick your repository, keep the detected **Next.js** preset.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | pooled Neon string (+ `&pgbouncer=true&connect_timeout=15`) |
   | `DIRECT_URL` | direct Neon string |
   | `ADMIN_PASSWORD` | a long random password |
   | `SESSION_SECRET` | another long random string |
   | `BASE_URL` | `https://YOUR-PROJECT.vercel.app` (you can set this after the first deploy and redeploy) |

4. Click **Deploy**. The build runs `prisma migrate deploy` automatically (the `vercel-build` script),
   so the table is created for you.

### 3. StreamElements command

Use your Vercel URL – see "StreamElements setup" below.

Every `git push` to `main` redeploys automatically.

---

## Run locally

You need Node.js 18.18+ and a Postgres database (the free Neon one works fine for local development too,
or run `docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16`).

```bash
cp .env.example .env          # Windows: copy .env.example .env
# edit .env: DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD
npm install                   # also runs `prisma generate`
npx prisma migrate deploy     # creates the table
npm run dev                   # http://localhost:3000
```

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | – | Postgres URL used at runtime (pooled on serverless hosts) |
| `DIRECT_URL` | yes | – | Direct Postgres URL used by migrations (can equal `DATABASE_URL`) |
| `ADMIN_PASSWORD` | yes | – | Streamer login. **Admin is disabled if empty.** |
| `BASE_URL` | recommended | `http://localhost:3000` | Public URL, no trailing slash. `https://` enables Secure cookies |
| `SESSION_SECRET` | recommended | `ADMIN_PASSWORD` | Signs the admin cookie |
| `REQUEST_API_KEY` | optional | – | If set, `/api/request` needs `&key=…` |
| `USER_COOLDOWN_SECONDS` | optional | `15` | Min seconds between requests per Twitch user (checked in the database) |
| `MAX_UNPLAYED_PER_USER` | optional | `3` | Max queued maps per user (`0` = unlimited) |
| `IP_LIMIT_PER_MINUTE` | optional | `120` | Coarse per-IP limit (in-memory; best effort on serverless) |
| `TEXT_ALWAYS_200` | optional | `true` | Plain-text responses always use HTTP 200 so chat shows the message |
| `TMX_THUMBNAIL_TEMPLATE` | optional | `https://trackmania.exchange/mapthumb/{id}` | Thumbnail URL pattern |

---

## StreamElements setup

1. In the StreamElements dashboard go to **Chat Commands → Custom Commands → Add New Command**.
2. Name: `request`. Response:

   ```text
   $(customapi https://YOUR-PROJECT.vercel.app/api/request?mapId=$(queryescape $(1))&user=$(queryescape $(user)))
   ```

3. If you set `REQUEST_API_KEY`, add `&key=YOUR_KEY` before the final `)`.
4. Set a user-level cooldown (e.g. 10–15 s) in StreamElements too.

Viewers can type any of these:

```text
!request 12345
!request bonSd_wS5YSoFj9grp47vvJgydf
!request https://trackmania.exchange/mapshow/12345
```

Example chat replies:

```text
@viewer "Cool Map" by pecorenzo added to the queue (#4)!
@viewer map "99999999" doesn't exist on Trackmania.exchange – double-check the ID.
@viewer "Cool Map" is already in the queue (requested by @someoneelse).
@viewer slow down! Try again in 9s.
```

---

## API reference

### `GET /api/request` (public)

Query: `mapId` (ID, UID or TMX URL), `user` (Twitch name), optional `key`, optional `format=json`.

- Default → `text/plain` chat message. Success **and** business errors return HTTP 200
  (`TEXT_ALWAYS_200=true`) so StreamElements always prints the message.
- `format=json` (or `Accept: application/json`, or `POST` with a JSON body) → JSON with real status codes:

```jsonc
// 201
{ "ok": true, "code": "CREATED", "message": "@viewer \"Cool Map\" …", "position": 4, "request": { /* MapDTO */ } }
// 404
{ "ok": false, "code": "MAP_NOT_FOUND", "message": "@viewer map \"1\" doesn't exist …" }
```

Error codes: `BAD_USER` 400 · `INVALID_MAP` 400 · `UNAUTHORIZED` 401 · `MAP_NOT_FOUND` 404 · `DUPLICATE` 409 ·
`USER_LIMIT` 429 · `COOLDOWN` 429 (+`Retry-After`) · `INTERNAL` 500 · `TMX_UNAVAILABLE` 503.

### Other endpoints

| Method & path | Auth | Description |
| --- | --- | --- |
| `GET /api/maps?status=&sort=&q=&user=` | public | List + stats (+`isAdmin` flag for the UI) |
| `GET /api/stats` | public | Totals, most requested maps, top requesters |
| `GET /api/export?status=&format=` | public | `txt` (default) · `csv` · `json` |
| `POST /api/admin/login` `{password}` | – | Sets the HttpOnly session cookie (5 tries/min/IP) |
| `POST /api/admin/logout` | – | Clears the cookie |
| `POST /api/admin/maps` `{map, user}` | admin | Add a map manually (still validated on TMX) |
| `PATCH /api/admin/maps/:id` `{played}` | admin | Set played/unplayed (empty body toggles) |
| `DELETE /api/admin/maps/:id` | admin | Delete a request |
| `POST /api/admin/maps/bulk` `{ids, action}` | admin | `played` · `unplayed` · `delete` |

Admin routes accept the session cookie **or** `Authorization: Bearer <ADMIN_PASSWORD>` for scripting.

---

## Project structure

```text
prisma/
  schema.prisma                     data model (PostgreSQL)
  migrations/20261029000000_init/   SQL migration (applied by `prisma migrate deploy`)
src/
  app/
    page.tsx · layout.tsx · globals.css
    api/request            public StreamElements endpoint
    api/maps · stats · export
    api/admin/login · logout · maps · maps/[id] · maps/bulk
  components/              Dashboard, MapCard, AdminPanel, StatsPanel, ThemeToggle
  lib/
    tmx.ts                 Trackmania.exchange client (v1 + v2 fallback, input parsing)
    requests.ts            validation → cooldown/duplicate/limit checks → save
    auth.ts · rateLimit.ts · queries.ts · serialize.ts · env.ts · db.ts · types.ts
```

---

## Other ways to deploy

### Docker (any VPS)

```bash
cp .env.example .env     # set ADMIN_PASSWORD, BASE_URL=https://your-domain.com, SESSION_SECRET
docker compose up -d --build
```

`docker-compose.yml` starts a Postgres container (data on the `pg-data` volume) plus the app; migrations run on
every start. Put a reverse proxy in front for HTTPS, e.g. Caddy:

```caddyfile
your-domain.com {
  reverse_proxy localhost:3000
}
```

Change the bundled database password in `docker-compose.yml` before going live.

### Railway / Render / Fly.io

Deploy the repo (Dockerfile is detected), add a Postgres database from the platform, and set the same
environment variables. Use the platform's Postgres URL for both `DATABASE_URL` and `DIRECT_URL`.

---

## Security notes

- The admin cookie is HttpOnly + SameSite=Strict, signed with an HMAC, expires after 12 h; state-changing
  admin calls also reject mismatching `Origin` headers.
- Anyone who knows your request URL can fake usernames. Set `REQUEST_API_KEY` to prevent that.
- The per-user cooldown is checked in the database, so it holds on serverless hosts. The per-IP limit and the
  admin login limiter are in-memory and therefore best-effort there.
- Map names are control-character-stripped before being echoed to chat; CSV export neutralises formula injection.

## Known limitations / things to double-check

- **TMX endpoints were written from the public docs but not exercised against the live API** (the build
  sandbox had no access to trackmania.exchange). Lookup tries the documented v1 `get_map_info` endpoint,
  then falls back to the v2 `/api/maps` search. If a field name changed, adjust `src/lib/tmx.ts` – it is the
  only file that knows about TMX's response format. Test with `!request <a real map id>` after deploying.
- Thumbnails use `https://trackmania.exchange/mapthumb/{id}`; if that pattern is wrong the cards fall back to a
  placeholder, and you can change it with `TMX_THUMBNAIL_TEMPLATE`.
- Updates are polling-based (every 5 s, paused in background tabs) rather than WebSockets.
