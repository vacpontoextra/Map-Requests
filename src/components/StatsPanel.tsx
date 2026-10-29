import type { StatsDTO } from '@/lib/types';

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

export default function StatsPanel({ stats }: { stats: StatsDTO | null }) {
  if (!stats) return null;

  return (
    <section aria-label="Statistics" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total requests" value={stats.total} />
        <Tile label="In queue" value={stats.unplayed} tone="text-warn" />
        <Tile label="Played" value={stats.played} tone="text-good" />
        <Tile label="Requesters" value={stats.uniqueRequesters} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Most requested maps</h3>
          {stats.topMaps.length === 0 ? (
            <p className="text-sm text-muted">No map has been requested more than once yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {stats.topMaps.map((m) => (
                <li key={m.mapId} className="flex justify-between gap-3">
                  <span className="truncate">{m.name}</span>
                  <span className="tabular-nums text-muted">×{m.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Top requesters</h3>
          {stats.topRequesters.length === 0 ? (
            <p className="text-sm text-muted">Nobody yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {stats.topRequesters.map((r) => (
                <li key={r.username} className="flex justify-between gap-3">
                  <span className="truncate">{r.username}</span>
                  <span className="tabular-nums text-muted">{r.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
