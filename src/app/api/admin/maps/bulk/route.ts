/**
 * ADMIN: bulk actions.
 *
 *   POST /api/admin/maps/bulk   { "ids": [1,2,3], "action": "played" | "unplayed" | "delete" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTIONS = ['played', 'unplayed', 'delete'] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await readJson(req);
  const action = body.action as Action;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is number => Number.isInteger(v) && v > 0).slice(0, 1000)
    : [];

  if (!ACTIONS.includes(action) || ids.length === 0) {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', message: 'Provide a non-empty "ids" array and an action: played | unplayed | delete.' },
      { status: 400 },
    );
  }

  const where = { id: { in: ids } };
  const result =
    action === 'delete'
      ? await prisma.mapRequest.deleteMany({ where })
      : await prisma.mapRequest.updateMany({
          where,
          data: action === 'played' ? { played: true, playedAt: new Date() } : { played: false, playedAt: null },
        });

  return NextResponse.json({ ok: true, affected: result.count });
}
