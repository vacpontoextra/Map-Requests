/** Shapes shared between API routes and the frontend. */

export interface MapDTO {
  id: number;
  mapId: number;
  mapUid: string;
  name: string;
  author: string;
  tags: string[];
  thumbnailUrl: string | null;
  length: string | null;
  difficulty: string | null;
  awards: number;
  tmxUrl: string;
  username: string;
  /** ISO-8601 UTC timestamp (server time). The UI renders it in the viewer's locale. */
  requestedAt: string;
  played: boolean;
  playedAt: string | null;
}

export interface StatsDTO {
  total: number;
  unplayed: number;
  played: number;
  uniqueRequesters: number;
  topMaps: { mapId: number; name: string; count: number }[];
  topRequesters: { username: string; count: number }[];
}

export type StatusFilter = 'all' | 'unplayed' | 'played';
export type SortOrder = 'newest' | 'oldest';
