import type { MapRequest } from '@prisma/client';
import type { MapDTO } from './types';

/** Parse the JSON-encoded tags column defensively. */
function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function toDTO(row: MapRequest): MapDTO {
  return {
    id: row.id,
    mapId: row.mapId,
    mapUid: row.mapUid,
    name: row.name,
    author: row.author,
    tags: parseTags(row.tags),
    thumbnailUrl: row.thumbnailUrl,
    length: row.length,
    difficulty: row.difficulty,
    awards: row.awards,
    tmxUrl: row.tmxUrl,
    username: row.username,
    requestedAt: row.requestedAt.toISOString(),
    played: row.played,
    playedAt: row.playedAt ? row.playedAt.toISOString() : null,
  };
}
