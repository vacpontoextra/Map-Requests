# Trackmania Map Requests

A small, self-hosted web app that collects Trackmania map requests from Twitch chat
(via a StreamElements custom command), validates every map against
[Trackmania.exchange](https://trackmania.exchange) (TMX), and shows the queue as a live,
filterable card grid. The streamer gets a password-protected admin mode to mark maps as
played, delete them, add maps manually and see stats.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite

---

## Features

| Area | What you get |
| --- | --- |
| Requests | `GET /api/request?mapId=…&user=…` – ID, UID or a full TMX link; server timestamp stored |
| Validation | Looks the map up on TMX before saving; unknown maps are rejected with a chat-friendly message |
| Metadata | Name, author, tags, thumbnail, length, difficulty, awards, link to the TMX page |
| Dashboard | Responsive dark-theme grid · All / Unplayed / Played · newest/oldest · search · "only my requests" · live polling (5 s) · light/dark toggle |
| Admin | Login → one-click played/unplayed, bulk actions, delete, add map manually, stats |
| Protection | Per-user cooldown, per-IP limit, duplicate detection, per-user queue cap, optional API key |
| Export | `/api/export?format=txt\|csv\|json` (unplayed queue by default) |

---

## Quick start (local)

```bash
cd trackmania-requests
cp .env.example .env          # then edit ADMIN_PASSWORD (and the rest if you like)
npm install                   # also runs `prisma generate`
npx prisma migrate deploy     # creates prisma/dev.db using the committed migration
npm run dev                   # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start:prod            # applies migrations, then starts on port 3000
```

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `file:./dev.db` | SQLite file (relative to `/prisma`) or a Postgres/MySQL URL |
| `ADMIN_PASSWORD` | yes | – | Streamer login. **Admin is disabled if empty.** |
| `BASE_URL` | recommended | `http://localhost:3000` | Public URL, no trailing slash. `https://` enables Secure cookies |
| `SESSION_SECRET` | recommended | `ADMIN_PASSWORD` | Signs the admin cookie (`openssl rand -hex 32`) |
| `REQUEST_API_KEY` | optional | – | If set, `/api/request` needs `&key=…` |
| `USER_COOLDOWN_SECONDS` | optional | `15` | Min seconds between requests per Twitch user |
| `MAX_UNPLAYED_PER_USER` | optional | `3` | Max queued maps per user (`0` = unlimited) |
| `IP_LIMIT_PER_MINUTE` | optional | `120` | Coarse per-IP limit (StreamElements shares IPs, keep it high) |
| `TEXT_ALWAYS_200` | optional | `true` | Plain-text responses always use HTTP 200 so chat shows the message |
| `TMX_THUMBNAIL_TEMPLATE` | optional | `https://trackmania.exchange/mapthumb/{id}` | Thumbnail URL pattern |

---

## StreamElements setup

1. In the StreamElements dashboard go to **Chat Commands → Custom Commands → Add New Command**.
2. Name: `request`. Response:

   ```text
   !request $(customapi https://your-domain.com/api/request?mapId=$(queryescape $(1))&user=$(queryescape $(user)))
   ```

   Remove the leading `!request ` text if you don't want the command name repeated in chat – the response
   is just the sentence returned by the API. A cleaner version:

   ```text
   $(customapi https://your-domain.com/api/request?mapId=$(queryescape $(1))&user=$(queryescape $(user)))
   ```

3. If you set `REQUEST_API_KEY`, append `&key=YOUR_KEY` inside the URL.
4. Set a user-level cooldown (e.g. 10–15 s) in StreamElements too – cheap and effective.

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
  schema.prisma                     data model
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
    requests.ts            validation → duplicate/limit checks → save
    auth.ts · rateLimit.ts · queries.ts · serialize.ts · env.ts · db.ts · types.ts
```

---

## Deployment

### Docker (recommended)

```bash
cp .env.example .env     # set ADMIN_PASSWORD, BASE_URL=https://your-domain.com, SESSION_SECRET
docker compose up -d --build
```

The SQLite file lives on the `tm-data` volume (`/data/requests.db`), migrations run on every start.
Put a reverse proxy in front for HTTPS, e.g. Caddy:

```caddyfile
your-domain.com {
  reverse_proxy localhost:3000
}
```

### Plain VPS

`npm ci && npm run build`, then run `npm run start:prod` under systemd or PM2, behind nginx/Caddy.
Make sure `DATABASE_URL` points to a path that is persisted and backed up.

### Vercel / serverless

SQLite files are **not persistent** there and the in-memory rate limiter is per-instance. Use a hosted
Postgres instead (below) and consider Redis for rate limiting.

### Using PostgreSQL / MySQL

1. In `prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"` (or `"mysql"`).
2. Set `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/trackmania`).
3. Delete `prisma/migrations` and create a fresh baseline: `npx prisma migrate dev --name init`.
4. Deploy with `npx prisma migrate deploy`.

`tags` is stored as a JSON string so the same schema works on every database.

---

## Security notes

- The admin cookie is HttpOnly + SameSite=Strict, signed with an HMAC, expires after 12 h; state-changing
  admin calls also reject mismatching `Origin` headers.
- Anyone who knows your request URL can fake usernames. Set `REQUEST_API_KEY` to prevent that.
- Rate limiting is in-memory: fine for one Node process, resets on restart.
- Map names are control-character-stripped before being echoed to chat; CSV export neutralises formula injection.

## Known limitations / things to double-check

- **TMX endpoints were written from the public docs but not exercised against the live API** (the build
  sandbox had no access to trackmania.exchange). Lookup tries the documented v1 `get_map_info` endpoint,
  then falls back to the v2 `/api/maps` search. If a field name changed, adjust `src/lib/tmx.ts` – it is the
  only file that knows about TMX's response format. Please test with `!request <a real map id>` once deployed.
- Thumbnails use `https://trackmania.exchange/mapthumb/{id}`; if that pattern is wrong the cards fall back to a
  placeholder, and you can change it with `TMX_THUMBNAIL_TEMPLATE`.
- Updates are polling-based (every 5 s, paused in background tabs) rather than WebSockets – simple and robust.
