/**
 * Core "submit a map request" logic, shared by the public endpoint
 * (StreamElements) and the admin "add map manually" action.
 */

import { getEnv } from './env';
import { prisma } from './db';
import { queueLength } from './queries';
import { rateLimit } from './rateLimit';
import { serializeTags } from './tags';
import { toDTO } from './serialize';
import { fetchMap, parseMapInput, TmxNotFoundError, type TmxMap } from './tmx';
import type { MapDTO } from './types';

export type ErrorCode =
  | 'BAD_USER'
  | 'INVALID_MAP'
  | 'MAP_NOT_FOUND'
  | 'DUPLICATE'
  | 'USER_LIMIT'
  | 'COOLDOWN'
  | 'TMX_UNAVAILABLE'
  | 'INTERNAL';

export type SubmitResult =
  | { ok: true; code: 'CREATED'; message: string; request: MapDTO; position: number }
  | { ok: false; code: ErrorCode; message: string; status: number; retryAfterSec?: number };

/** Twitch logins: 4–25 chars of [A-Za-z0-9_]. We accept 1–25 to allow manual/test names. */
const USERNAME_RE = /^[A-Za-z0-9_]{1,25}$/;

/** Strip control characters and cap length so map names are safe to echo into Twitch chat. */
const chatSafe = (s: string, max = 60) =>
  s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

interface SubmitOptions {
  /** Raw map ID / UID / TMX URL as typed by the viewer. */
  map: string;
  /** Twitch username (a leading @ is tolerated). */
  user: string;
  /** Public endpoint: true. Admin manual add: false (skips cooldown / duplicate / per-user caps). */
  enforceLimits: boolean;
}

export async function submitRequest({ map, user, enforceLimits }: SubmitOptions): Promise<SubmitResult> {
  const env = getEnv();

  // --- 1. Username -----------------------------------------------------------
  const username = user.trim().replace(/^@/, '');
  if (!USERNAME_RE.test(username)) {
    return fail('BAD_USER', 'Could not read your Twitch username – please try again.', 400);
  }
  const mention = `@${username}`;
  const usernameKey = username.toLowerCase();

  // --- 2. Map input ------------------------------------------------------------
  const input = parseMapInput(map);
  if (!input) {
    return fail(
      'INVALID_MAP',
      `${mention} please give a Trackmania.exchange map ID (e.g. !request 12345) or a map link.`,
      400,
    );
  }

  // --- 3. Per-user cooldown (counts invalid lookups too, so ID-spam is throttled) ---
  if (enforceLimits) {
    const rl = rateLimit(`user:${usernameKey}`, 1, env.userCooldownSec * 1000);
    if (!rl.ok) {
      return fail('COOLDOWN', `${mention} slow down! Try again in ${rl.retryAfterSec}s.`, 429, rl.retryAfterSec);
    }
  }

  // --- 4. Validate against Trackmania.exchange ------------------------------------
  let tmx: TmxMap;
  try {
    tmx = await fetchMap(input);
  } catch (err) {
    if (err instanceof TmxNotFoundError) {
      const shown = chatSafe(String(input.value), 30);
      return fail(
        'MAP_NOT_FOUND',
        `${mention} map "${shown}" doesn't exist on Trackmania.exchange – double-check the ID.`,
        404,
      );
    }
    return fail(
      'TMX_UNAVAILABLE',
      `${mention} Trackmania.exchange isn't responding right now – please try again in a moment.`,
      503,
    );
  }

  // --- 5. Duplicate + per-user caps -------------------------------------------------
  if (enforceLimits) {
    // Database-backed cooldown: unlike the in-memory limiter above, this survives
    // restarts and works across serverless instances (e.g. Vercel).
    if (env.userCooldownSec > 0) {
      const recent = await prisma.mapRequest.findFirst({
        where: { usernameKey, requestedAt: { gte: new Date(Date.now() - env.userCooldownSec * 1000) } },
        orderBy: { requestedAt: 'desc' },
      });
      if (recent) {
        const wait = Math.max(
          1,
          Math.ceil((recent.requestedAt.getTime() + env.userCooldownSec * 1000 - Date.now()) / 1000),
        );
        return fail('COOLDOWN', `${mention} slow down! Try again in ${wait}s.`, 429, wait);
      }
    }

    const duplicate = await prisma.mapRequest.findFirst({ where: { mapId: tmx.mapId, played: false } });
    if (duplicate) {
      const who = duplicate.usernameKey === usernameKey ? 'you' : `@${duplicate.username}`;
      return fail(
        'DUPLICATE',
        `${mention} "${chatSafe(tmx.name)}" is already in the queue (requested by ${who}).`,
        409,
      );
    }

    if (env.maxUnplayedPerUser > 0) {
      const open = await prisma.mapRequest.count({ where: { usernameKey, played: false } });
      if (open >= env.maxUnplayedPerUser) {
        return fail(
          'USER_LIMIT',
          `${mention} you already have ${open} maps in the queue (max ${env.maxUnplayedPerUser}). Wait until one is played!`,
          429,
        );
      }
    }
  }

  // --- 6. Persist ----------------------------------------------------------------------
  try {
    const row = await prisma.mapRequest.create({
      data: {
        mapId: tmx.mapId,
        mapUid: tmx.mapUid,
        name: tmx.name,
        author: tmx.author,
        tags: serializeTags(tmx.tags),
        thumbnailUrl: tmx.thumbnailUrl,
        length: tmx.length,
        difficulty: tmx.difficulty,
        awards: tmx.awards,
        tmxUrl: tmx.tmxUrl,
        username,
        usernameKey,
        // requestedAt defaults to now() on the server → "exact date and time of the request".
      },
    });

    const position = await queueLength();
    return {
      ok: true,
      code: 'CREATED',
      message: `${mention} "${chatSafe(tmx.name)}" by ${chatSafe(tmx.author, 30)} added to the queue (#${position})!`,
      request: toDTO(row),
      position,
    };
  } catch (err) {
    console.error('[submitRequest] database error', err);
    return fail('INTERNAL', `${mention} something went wrong saving your request – please try again.`, 500);
  }
}

function fail(code: ErrorCode, message: string, status: number, retryAfterSec?: number): SubmitResult {
  return { ok: false, code, message, status, retryAfterSec };
}
