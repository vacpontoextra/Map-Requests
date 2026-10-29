import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { toDTO } from './serialize';
import type { MapDTO, SortOrder, StatsDTO, StatusFilter } from './types';

export interface ListFilters {
  status: StatusFilter;
  sort: SortOrder;
  q?: string;
  /** Only requests by this Twitch user (case-insensitive). */
  user?: string;
  limit?: number;
}

export function parseStatus(v: string | null): StatusFilter {
  return v === 'unplayed' || v === 'played' ? v : 'all';
}

export function parseSort(v: string | null): SortOrder {
  return v === 'oldest' ? 'oldest' : 'newest';
}

export async function listMaps(f: ListFilters): Promise<MapDTO[]> {
  const where: Prisma.MapRequestWhereInput = {};

  if (f.status === 'unplayed') where.played = false;
  if (f.status === 'played') where.played = true;

  if (f.user) where.usernameKey = f.user.toLowerCase();

  const q = f.q?.trim();
  if (q) {
    // SQLite's LIKE is case-insensitive for ASCII, which is what we want here.
    where.OR = [{ name: { contains: q } }, { author: { contains: q } }, { username: { contains: q } }];
  }

  const direction = f.sort === 'oldest' ? 'asc' : 'desc';
  const rows = await prisma.mapRequest.findMany({
    where,
    orderBy: [{ requestedAt: direction }, { id: direction }],
    take: Math.min(Math.max(f.limit ?? 300, 1), 1000),
  });
  return rows.map(toDTO);
}

export async function getStats(): Promise<StatsDTO> {
  const [total, unplayed, topMaps, requesters] = await Promise.all([
    prisma.mapRequest.count(),
    prisma.mapRequest.count({ where: { played: false } }),
    prisma.mapRequest.groupBy({
      by: ['mapId', 'name'],
      _count: { _all: true },
      orderBy: { _count: { mapId: 'desc' } },
      take: 5,
    }),
    prisma.mapRequest.groupBy({
      by: ['usernameKey'],
      _count: { _all: true },
      orderBy: { _count: { usernameKey: 'desc' } },
    }),
  ]);

  return {
    total,
    unplayed,
    played: total - unplayed,
    uniqueRequesters: requesters.length,
    // Only list maps that were actually requested more than once as "most requested".
    topMaps: topMaps
      .filter((m) => m._count._all > 1)
      .map((m) => ({ mapId: m.mapId, name: m.name, count: m._count._all })),
    topRequesters: requesters.slice(0, 5).map((r) => ({ username: r.usernameKey, count: r._count._all })),
  };
}

/** Number of maps currently waiting in the queue. */
export function queueLength(): Promise<number> {
  return prisma.mapRequest.count({ where: { played: false } });
}
