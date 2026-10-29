'use client';

import { memo, useState } from 'react';
import type { MapDTO } from '@/lib/types';

interface Props {
  map: MapDTO;
  isAdmin: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: (id: number, selected: boolean) => void;
  onTogglePlayed: (map: MapDTO) => void;
  onDelete: (map: MapDTO) => void;
}

const MAX_TAGS = 6;

function MapCard({ map, isAdmin, selected, busy, onSelect, onTogglePlayed, onDelete }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const when = new Date(map.requestedAt);
  const showImage = map.thumbnailUrl && !imgFailed;

  return (
    <article
      className={[
        'group relative flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition',
        map.played ? 'border-good/30' : 'border-border hover:border-accent/50',
        selected ? 'ring-2 ring-accent' : '',
      ].join(' ')}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface2">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={map.thumbnailUrl!}
            alt={`Thumbnail of ${map.name}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${
              map.played ? 'opacity-60 saturate-50' : ''
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/10 to-accent2/20 text-4xl">
            🏁
          </div>
        )}

        {/* Played / queued badge */}
        <span
          className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur ${
            map.played ? 'bg-good/90 text-bg' : 'bg-warn/90 text-bg'
          }`}
        >
          {map.played ? '✓ Played' : '● In queue'}
        </span>

        {isAdmin && (
          <label className="absolute left-2 top-2 flex cursor-pointer items-center rounded-md bg-bg/80 p-1.5 backdrop-blur">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(map.id, e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
              aria-label={`Select ${map.name}`}
            />
          </label>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="truncate text-base font-semibold" title={map.name}>
            <a href={map.tmxUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {map.name}
            </a>
          </h3>
          <p className="truncate text-sm text-muted">
            by <span className="text-fg">{map.author}</span>
          </p>
        </div>

        {map.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {map.tags.slice(0, MAX_TAGS).map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
            {map.tags.length > MAX_TAGS && <span className="chip">+{map.tags.length - MAX_TAGS}</span>}
          </div>
        )}

        {(map.length || map.difficulty || map.awards > 0) && (
          <p className="text-xs text-muted">
            {[map.difficulty, map.length, map.awards > 0 ? `🏆 ${map.awards}` : null].filter(Boolean).join(' · ')}
          </p>
        )}

        <div className="mt-auto border-t border-border pt-2 text-xs text-muted">
          <p>
            Requested by <span className="font-medium text-fg">{map.username}</span>
          </p>
          <p>
            <time dateTime={map.requestedAt} title={map.requestedAt}>
              {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onTogglePlayed(map)}
              className={`btn flex-1 ${map.played ? '' : 'btn-primary'}`}
            >
              {map.played ? 'Mark unplayed' : 'Mark played'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(map)}
              className="btn btn-danger"
              aria-label={`Delete ${map.name}`}
              title="Delete request"
            >
              🗑
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(MapCard);
