/**
 * Trackmania.exchange (TMX) client.
 *
 * Strategy:
 *   1. Try the documented v1 "get_map_info" endpoint (id or uid):
 *        GET https://trackmania.exchange/api/maps/get_map_info/id/{id}
 *        GET https://trackmania.exchange/api/maps/get_map_info/uid/{uid}
 *   2. If v1 doesn't return the map (it's deprecated and may disappear), fall back
 *      to the v2 search endpoint: GET /api/maps?id=… / ?uid=…&fields=…
 *
 * Outcomes are explicit: found / not found / TMX unavailable, so the request
 * handler can tell the viewer "that map doesn't exist" vs "TMX is down, retry".
 *
 * API docs: https://api2.mania.exchange/  (a User-Agent header is mandatory).
 */

import { getEnv } from './env';

const TMX_BASE = 'https://trackmania.exchange';
// Kept short: v1 + v2 fallback must finish well inside a serverless function's time limit.
const FETCH_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TmxMap {
  mapId: number;
  mapUid: string;
  name: string;
  author: string;
  tags: string[];
  length: string | null;
  difficulty: string | null;
  awards: number;
  thumbnailUrl: string | null;
  tmxUrl: string;
}

export type MapInput = { kind: 'id'; value: number } | { kind: 'uid'; value: string };

export class TmxNotFoundError extends Error {
  constructor() {
    super('Map not found on Trackmania.exchange');
  }
}

export class TmxUnavailableError extends Error {
  constructor() {
    super('Trackmania.exchange is not reachable right now');
  }
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Accepts what viewers actually type in chat:
 *   "12345"                                   → TMX map ID
 *   "bonSd_wS5YSoFj9grp47vvJgydf"             → map UID (≈27 chars)
 *   "https://trackmania.exchange/mapshow/123" → ID extracted from the URL
 */
export function parseMapInput(raw: string): MapInput | null {
  const text = raw.trim();
  if (!text || text.length > 200) return null;

  const urlMatch = text.match(/trackmania\.exchange\/(?:mapshow|maps?|mapsearch2\/[^/]*\/)\/?(\d{1,9})/i);
  if (urlMatch) return { kind: 'id', value: Number(urlMatch[1]) };

  if (/^#?\d{1,9}$/.test(text)) {
    const id = Number(text.replace('#', ''));
    return id > 0 ? { kind: 'id', value: id } : null;
  }

  if (/^[A-Za-z0-9_-]{25,30}$/.test(text)) return { kind: 'uid', value: text };

  return null;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface JsonResponse {
  status: number;
  data: unknown;
}

/** Returns null on network failure / timeout. Never throws. */
async function getJson(url: string): Promise<JsonResponse | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': `TrackmaniaRequestSite/1.0 (+${getEnv().baseUrl})`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON body (HTML error page, empty body…) */
    }
    return { status: res.status, data };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tag names (TMX returns tag IDs in v1; names come from a separate endpoint)
// ---------------------------------------------------------------------------

let tagCache: { at: number; names: Map<number, string> } | null = null;
const TAG_TTL_MS = 6 * 60 * 60 * 1000;

async function getTagNames(): Promise<Map<number, string>> {
  if (tagCache && Date.now() - tagCache.at < TAG_TTL_MS) return tagCache.names;

  const res = await getJson(`${TMX_BASE}/api/tags/gettags`);
  const names = new Map<number, string>();
  if (res && res.status === 200 && Array.isArray(res.data)) {
    for (const t of res.data as Record<string, unknown>[]) {
      const id = Number(t.ID ?? t.Id ?? t.TagId);
      const name = String(t.Name ?? '');
      if (Number.isFinite(id) && name) names.set(id, name);
    }
  }
  // Only cache a successful lookup; otherwise retry on the next request.
  if (names.size > 0) tagCache = { at: Date.now(), names };
  return names;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const DIFFICULTY_NAMES = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Lunatic', 'Impossible'];

function thumbnailFor(id: number): string {
  return getEnv().thumbnailTemplate.replace('{id}', String(id));
}

function formatLengthMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} secs`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m} min`;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// v1: /api/maps/get_map_info/{id|uid}/{value}
// ---------------------------------------------------------------------------

type Lookup = { state: 'found'; map: TmxMap } | { state: 'missing' } | { state: 'error' };

async function lookupV1(input: MapInput): Promise<Lookup> {
  const url = `${TMX_BASE}/api/maps/get_map_info/${input.kind}/${encodeURIComponent(String(input.value))}`;
  const res = await getJson(url);
  if (!res) return { state: 'error' };
  if (res.status === 404 || res.status === 400) return { state: 'missing' };
  if (res.status !== 200) return { state: 'error' };

  // Single lookups return an object; some deployments wrap it in an array.
  const rec = (Array.isArray(res.data) ? res.data[0] : res.data) as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== 'object') return { state: 'missing' };

  const mapId = num(rec.TrackID ?? rec.MapID ?? rec.MapId, NaN);
  const mapUid = str(rec.TrackUID ?? rec.MapUID ?? rec.MapUid);
  if (!Number.isFinite(mapId) || !mapUid) return { state: 'missing' };

  // v1 "Tags" is a comma-separated list of tag IDs, e.g. "15,22".
  const tagIds = str(rec.Tags)
    .split(',')
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const tagNames = tagIds.length ? await getTagNames() : new Map<number, string>();

  return {
    state: 'found',
    map: {
      mapId,
      mapUid,
      name: str(rec.Name, str(rec.GbxMapName, 'Unnamed map')),
      author: str(rec.Username, 'Unknown'),
      tags: tagIds.map((id) => tagNames.get(id)).filter((n): n is string => !!n),
      length: str(rec.LengthName) || null,
      difficulty: str(rec.DifficultyName) || null,
      awards: num(rec.AwardCount),
      thumbnailUrl: rec.HasThumbnail === false ? null : thumbnailFor(mapId),
      tmxUrl: `${TMX_BASE}/mapshow/${mapId}`,
    },
  };
}

// ---------------------------------------------------------------------------
// v2: /api/maps?id=…&fields=…
// ---------------------------------------------------------------------------

const V2_FIELDS = 'MapId,MapUid,Name,Uploader.Name,Tags,Length,Difficulty,AwardCount,HasThumbnail';

async function lookupV2(input: MapInput): Promise<Lookup> {
  const param = input.kind === 'id' ? 'id' : 'uid';
  const url = `${TMX_BASE}/api/maps?${param}=${encodeURIComponent(String(input.value))}&fields=${encodeURIComponent(V2_FIELDS)}`;
  const res = await getJson(url);
  if (!res) return { state: 'error' };
  if (res.status !== 200) return { state: res.status === 404 ? 'missing' : 'error' };

  const results = (res.data as { Results?: unknown[] } | null)?.Results;
  if (!Array.isArray(results) || results.length === 0) return { state: 'missing' };

  const rec = results[0] as Record<string, unknown>;
  const mapId = num(rec.MapId, NaN);
  const mapUid = str(rec.MapUid);
  if (!Number.isFinite(mapId) || !mapUid) return { state: 'missing' };

  const tags = Array.isArray(rec.Tags)
    ? (rec.Tags as Record<string, unknown>[]).map((t) => str(t?.Name)).filter(Boolean)
    : [];
  const uploader = rec.Uploader as Record<string, unknown> | undefined;
  const diff = rec.Difficulty;

  return {
    state: 'found',
    map: {
      mapId,
      mapUid,
      name: str(rec.Name, 'Unnamed map'),
      author: str(uploader?.Name, 'Unknown'),
      tags,
      length: typeof rec.Length === 'number' ? formatLengthMs(rec.Length) : null,
      difficulty: typeof diff === 'number' ? DIFFICULTY_NAMES[diff] ?? null : str(diff) || null,
      awards: num(rec.AwardCount),
      thumbnailUrl: rec.HasThumbnail === false ? null : thumbnailFor(mapId),
      tmxUrl: `${TMX_BASE}/mapshow/${mapId}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Look a map up on Trackmania.exchange.
 * @throws TmxNotFoundError    the map definitely doesn't exist
 * @throws TmxUnavailableError TMX could not be reached / answered nonsense
 */
export async function fetchMap(input: MapInput): Promise<TmxMap> {
  const v1 = await lookupV1(input);
  if (v1.state === 'found') return v1.map;

  const v2 = await lookupV2(input);
  if (v2.state === 'found') return v2.map;

  // At least one API gave a definitive "no such map" → treat as not found.
  if (v1.state === 'missing' || v2.state === 'missing') throw new TmxNotFoundError();
  throw new TmxUnavailableError();
}
