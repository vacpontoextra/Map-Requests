import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, checkPassword, createSessionToken, readJson, sessionCookieOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!getEnv().adminPassword) {
    return NextResponse.json(
      { ok: false, code: 'ADMIN_DISABLED', message: 'Admin is disabled: set ADMIN_PASSWORD on the server.' },
      { status: 503 },
    );
  }

  // Brute-force protection: 5 attempts per minute per IP.
  const rl = rateLimit(`login:${clientIp(req.headers)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', message: `Too many attempts. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const body = await readJson(req);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), sessionCookieOptions());
  return res;
}
