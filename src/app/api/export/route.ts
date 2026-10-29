/**
 * PUBLIC export of the queue.
 *
 *   GET /api/export?status=unplayed&format=txt|csv|json
 *
 * `txt` is one map per line (handy to paste into Discord / a TM server map list),
 * `csv` opens in Excel/Sheets, `json` is raw data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listMaps, parseSort, parseStatus } from '@/lib/queries';
import type { MapDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Quote a CSV cell and neutralise spreadsheet formula injection (=, +, -, @ prefixes). */
function csvCell(value: string | number | boolean): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(maps: MapDTO[]): string {
  const header = ['mapId', 'name', 'author', 'tags', 'requestedBy', 'requestedAt', 'played', 'url'];
  const lines = maps.map((m) =>
    [m.mapId, m.name, m.author, m.tags.join('; '), m.username, m.requestedAt, m.played, m.tmxUrl].map(csvCell).join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}

function toTxt(maps: MapDTO[]): string {
  return maps.map((m) => `${m.name} by ${m.author} – ${m.tmxUrl} (requested by ${m.username})`).join('\n') + '\n';
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const format = q.get('format') ?? 'txt';
  // Default to the unplayed queue in play order (oldest first).
  const status = q.has('status') ? parseStatus(q.get('status')) : 'unplayed';
  const sort = q.has('sort') ? parseSort(q.get('sort')) : 'oldest';

  const maps = await listMaps({ status, sort, limit: 1000 });
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') return NextResponse.json({ ok: true, maps }, { headers: { 'Cache-Control': 'no-store' } });

  if (format === 'csv') {
    return new Response(toCsv(maps), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="trackmania-${status}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(toTxt(maps), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
