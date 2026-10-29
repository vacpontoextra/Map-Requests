/**
 * PUBLIC read-only list used by the dashboard (polled every few seconds).
 *
 *   GET /api/maps?status=all|unplayed|played&sort=newest|oldest&q=text&user=twitchname
 *
 * Also reports whether the caller is logged in as admin, so the UI can show controls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { getStats, listMaps, parseSort, parseStatus } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  try {
    const [maps, stats] = await Promise.all([
      listMaps({
        status: parseStatus(q.get('status')),
        sort: parseSort(q.get('sort')),
        q: q.get('q') ?? undefined,
        user: q.get('user')?.trim().replace(/^@/, '') || undefined,
        limit: Number(q.get('limit')) || undefined,
      }),
      getStats(),
    ]);

    return NextResponse.json(
      { ok: true, maps, stats, isAdmin: isAdminRequest(req), serverTime: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[GET /api/maps]', err);
    return NextResponse.json({ ok: false, code: 'INTERNAL', message: 'Could not load maps.' }, { status: 500 });
  }
}
