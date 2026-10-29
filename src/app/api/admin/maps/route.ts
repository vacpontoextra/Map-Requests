/**
 * ADMIN: manually add a map (handy for testing, or adding a map you picked yourself).
 *
 *   POST /api/admin/maps   { "map": "12345 | uid | tmx url", "user": "optional name" }
 *
 * Skips cooldown / duplicate / per-user limits, but still validates against TMX.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin } from '@/lib/auth';
import { submitRequest } from '@/lib/requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await readJson(req);
  const map = typeof body.map === 'string' || typeof body.map === 'number' ? String(body.map) : '';
  const user = typeof body.user === 'string' && body.user.trim() ? body.user : 'streamer';

  const result = await submitRequest({ map, user, enforceLimits: false });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, message: result.message, request: result.request }, { status: 201 });
}
