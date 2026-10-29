/**
 * Admin authentication.
 *
 * Flow: POST /api/admin/login with the password → server sets an HttpOnly,
 * SameSite=Strict cookie containing an HMAC-signed expiry timestamp. Scripts can
 * alternatively send `Authorization: Bearer <ADMIN_PASSWORD>`.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from './env';

export const ADMIN_COOKIE = 'tm_admin';
const SESSION_TTL_SEC = 12 * 60 * 60; // 12 hours

/** Constant-time string comparison (hash first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(payload: string): string {
  return createHmac('sha256', getEnv().sessionSecret).update(payload).digest('base64url');
}

export function checkPassword(candidate: string): boolean {
  const { adminPassword } = getEnv();
  if (!adminPassword) return false; // admin disabled
  return safeEqual(candidate, adminPassword);
}

export function createSessionToken(): string {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SEC);
  return `${exp}.${sign(exp)}`;
}

function verifySessionToken(token: string): boolean {
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (!safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Math.floor(Date.now() / 1000);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: getEnv().baseUrl.startsWith('https://'),
    path: '/',
    maxAge: SESSION_TTL_SEC,
  };
}

export function isAdminRequest(req: NextRequest): boolean {
  if (!getEnv().adminPassword) return false;

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && checkPassword(auth.slice(7).trim())) return true;

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return !!cookie && verifySessionToken(cookie);
}

/**
 * Guard for admin API routes. Returns a NextResponse to send back if the request
 * must be rejected, or `null` if it is allowed to proceed.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  if (!isAdminRequest(req)) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', message: 'Admin login required.' },
      { status: 401 },
    );
  }

  // Extra CSRF defence for state-changing calls: if the browser sent an Origin,
  // it must match the host we are being served from.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (origin && host) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* malformed origin → rejected below */
      }
      if (originHost !== host) {
        return NextResponse.json(
          { ok: false, code: 'FORBIDDEN', message: 'Cross-origin request blocked.' },
          { status: 403 },
        );
      }
    }
  }
  return null;
}

/** Parse a JSON body without throwing; returns {} on garbage. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
