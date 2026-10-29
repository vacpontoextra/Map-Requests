import { NextResponse } from 'next/server';
import { getStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PUBLIC: totals, most requested maps and top requesters. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, stats: await getStats() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[GET /api/stats]', err);
    return NextResponse.json({ ok: false, code: 'INTERNAL', message: 'Could not load stats.' }, { status: 500 });
  }
}
