/**
 * ADMIN: update or delete a single request.
 *
 *   PATCH  /api/admin/maps/:id   { "played": true | false }   (omit body to toggle)
 *   DELETE /api/admin/maps/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toDTO } from '@/lib/serialize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

const notFound = () =>
  NextResponse.json({ ok: false, code: 'NOT_FOUND', message: 'Request not found.' }, { status: 404 });

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return notFound();

  const existing = await prisma.mapRequest.findUnique({ where: { id } });
  if (!existing) return notFound();

  const body = await readJson(req);
  const played = typeof body.played === 'boolean' ? body.played : !existing.played; // default: toggle

  const updated = await prisma.mapRequest.update({
    where: { id },
    data: { played, playedAt: played ? new Date() : null },
  });
  return NextResponse.json({ ok: true, request: toDTO(updated) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return notFound();

  // deleteMany so a double-click on "delete" doesn't throw.
  const { count } = await prisma.mapRequest.deleteMany({ where: { id } });
  if (count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
