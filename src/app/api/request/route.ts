/**
 * PUBLIC endpoint called by StreamElements:
 *
 *   GET /api/request?mapId=12345&user=SomeViewer[&key=SECRET][&format=json]
 *
 * Default response is a short plain-text chat message (what StreamElements prints).
 * Add `format=json` (or send `Accept: application/json`, or use POST with a JSON
 * body) to get structured JSON with proper HTTP status codes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual, readJson } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { submitRequest, type SubmitResult } from '@/lib/requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  map: string;
  user: string;
  key: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const wantsJson = q.get('format') === 'json' || (req.headers.get('accept') ?? '').includes('application/json');

  return handle(
    req,
    {
      // `mapId` is the documented name; the others are accepted as aliases.
      map: q.get('mapId') ?? q.get('map') ?? q.get('id') ?? q.get('uid') ?? '',
      user: q.get('user') ?? '',
      key: q.get('key') ?? '',
    },
    wantsJson,
  );
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  return handle(
    req,
    {
      map: s(body.mapId ?? body.map ?? body.id ?? body.uid),
      user: s(body.user),
      key: s(body.key) || (req.headers.get('x-api-key') ?? ''),
    },
    true,
  );
}

async function handle(req: NextRequest, p: Params, json: boolean): Promise<Response> {
  const env = getEnv();

  // 1. Coarse per-IP throttle (generous: StreamElements shares IPs between all viewers).
  const ip = rateLimit(`ip:${clientIp(req.headers)}`, env.ipLimitPerMinute, 60_000);
  if (!ip.ok) {
    return respond(
      { ok: false, code: 'COOLDOWN', message: 'Too many requests – please slow down.', status: 429, retryAfterSec: ip.retryAfterSec },
      json,
    );
  }

  // 2. Optional shared secret so strangers can't spoof usernames.
  if (env.requestApiKey && !safeEqual(p.key, env.requestApiKey)) {
    return respond(
      { ok: false, code: 'INTERNAL', message: 'Request rejected: missing or invalid API key.', status: 401 },
      json,
      'UNAUTHORIZED',
    );
  }

  // 3. Validate, look up on TMX, de-duplicate, save.
  const result = await submitRequest({ map: p.map, user: p.user, enforceLimits: true });
  return respond(result, json);
}

function respond(result: SubmitResult, json: boolean, codeOverride?: string): Response {
  const env = getEnv();
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (!result.ok && result.retryAfterSec) headers['Retry-After'] = String(result.retryAfterSec);

  if (json) {
    const body = result.ok
      ? { ok: true, code: result.code, message: result.message, position: result.position, request: result.request }
      : { ok: false, code: codeOverride ?? result.code, message: result.message };
    return NextResponse.json(body, { status: result.ok ? 201 : result.status, headers });
  }

  // Plain text for StreamElements. Business errors still return 200 by default so the
  // message always reaches chat; flip TEXT_ALWAYS_200=false for real status codes.
  const status = result.ok || env.textAlways200 ? 200 : result.status;
  return new Response(result.message, {
    status,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
