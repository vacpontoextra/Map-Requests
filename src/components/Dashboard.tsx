'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapDTO, SortOrder, StatsDTO, StatusFilter } from '@/lib/types';
import { AddMapForm, AdminLogin } from './AdminPanel';
import MapCard from './MapCard';
import StatsPanel from './StatsPanel';
import ThemeToggle from './ThemeToggle';

const POLL_INTERVAL_MS = 5000; // near-real-time updates via polling
const NAME_KEY = 'tm_myname';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unplayed', label: 'Unplayed' },
  { value: 'played', label: 'Played' },
];

export default function Dashboard() {
  // --- Filters -----------------------------------------------------------------
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [myName, setMyName] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  // --- Data ----------------------------------------------------------------------
  const [maps, setMaps] = useState<MapDTO[]>([]);
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // --- UI state --------------------------------------------------------------------
  const [showStats, setShowStats] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // Guards against out-of-order responses when filters change quickly.
  const requestSeq = useRef(0);

  // Remember the viewer's Twitch name for the "only my requests" filter.
  useEffect(() => {
    try {
      setMyName(localStorage.getItem(NAME_KEY) ?? '');
    } catch {
      /* storage unavailable */
    }
  }, []);

  function updateMyName(value: string) {
    setMyName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* ignore */
    }
  }

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const userFilter = onlyMine ? myName.trim().replace(/^@/, '') : '';

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    const params = new URLSearchParams({ status, sort });
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    if (userFilter) params.set('user', userFilter);

    try {
      const res = await fetch(`/api/maps?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setMaps(data.maps);
      setStats(data.stats);
      setIsAdmin(Boolean(data.isAdmin));
      setUpdatedAt(new Date());
      setError(null);
      // Drop selections that no longer exist (deleted / filtered out).
      setSelected((prev) => {
        const present = new Set<number>((data.maps as MapDTO[]).map((m) => m.id));
        const next = new Set([...prev].filter((id) => present.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch {
      if (seq === requestSeq.current) setError('Connection problem – retrying…');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [status, sort, debouncedSearch, userFilter]);

  // Initial load + polling (paused while the tab is hidden).
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // --- Admin actions -----------------------------------------------------------------

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((cur) => (cur === text ? null : cur)), 4000);
  };

  /** Call an admin endpoint; returns an error message or null on success. */
  async function adminCall(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return null;
      if (res.status === 401) setIsAdmin(false);
      const data = await res.json().catch(() => ({}));
      return data.message ?? `Request failed (${res.status})`;
    } catch {
      return 'Could not reach the server.';
    }
  }

  const withBusy = async (ids: number[], fn: () => Promise<string | null>) => {
    setBusyIds((prev) => new Set([...prev, ...ids]));
    const err = await fn();
    setBusyIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    if (err) flash(err);
    await load();
  };

  const togglePlayed = useCallback(
    (m: MapDTO) => withBusy([m.id], () => adminCall(`/api/admin/maps/${m.id}`, 'PATCH', { played: !m.played })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  );

  const deleteOne = useCallback(
    (m: MapDTO) => {
      if (!window.confirm(`Delete "${m.name}" requested by ${m.username}?`)) return;
      withBusy([m.id], () => adminCall(`/api/admin/maps/${m.id}`, 'DELETE'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  );

  const select = useCallback((id: number, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  async function bulk(action: 'played' | 'unplayed' | 'delete') {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} selected request(s)?`)) return;
    await withBusy(ids, () => adminCall('/api/admin/maps/bulk', 'POST', { ids, action }));
    setSelected(new Set());
  }

  async function addMap(map: string, user: string): Promise<string | null> {
    const err = await adminCall('/api/admin/maps', 'POST', { map, user });
    if (!err) await load();
    return err;
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setIsAdmin(false);
    setSelected(new Set());
  }

  const allSelected = maps.length > 0 && selected.size === maps.length;

  // --- Render -----------------------------------------------------------------------------
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            Map Requests
          </h1>
          <p className="text-sm text-muted">
            {stats ? (
              <>
                <span className="font-semibold text-warn">{stats.unplayed}</span> in queue ·{' '}
                <span className="font-semibold text-good">{stats.played}</span> played ·{' '}
                <span className="font-semibold text-fg">{stats.total}</span> total
              </>
            ) : (
              'Loading…'
            )}
            {updatedAt && (
              <span className="ml-2 hidden sm:inline" title="Auto-refreshes every few seconds">
                · <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-good align-middle" /> live
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={() => setShowStats((s) => !s)} aria-expanded={showStats}>
            📊 Stats
          </button>
          <a className="btn" href="/api/export?status=unplayed&format=txt" target="_blank" rel="noopener noreferrer">
            ⬇ Unplayed
          </a>
          <ThemeToggle />
          {isAdmin ? (
            <button type="button" className="btn" onClick={logout}>
              Log out
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setShowLogin((s) => !s)}>
              🔒 Admin
            </button>
          )}
        </div>
      </header>

      {showLogin && !isAdmin && (
        <AdminLogin
          onSuccess={() => {
            setShowLogin(false);
            load();
          }}
          onCancel={() => setShowLogin(false)}
        />
      )}

      {showStats && <StatsPanel stats={stats} />}

      {isAdmin && (
        <section aria-label="Admin tools" className="space-y-3 rounded-2xl border border-accent/30 bg-accent/5 p-3">
          <p className="text-sm font-semibold text-accent">Admin mode</p>
          <AddMapForm onAdd={addMap} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              className="btn"
              onClick={() => setSelected(allSelected ? new Set() : new Set(maps.map((m) => m.id)))}
              disabled={maps.length === 0}
            >
              {allSelected ? 'Clear selection' : 'Select all shown'}
            </button>
            <span className="text-muted">{selected.size} selected</span>
            <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => bulk('played')}>
              Mark played
            </button>
            <button type="button" className="btn" disabled={selected.size === 0} onClick={() => bulk('unplayed')}>
              Mark unplayed
            </button>
            <button type="button" className="btn btn-danger" disabled={selected.size === 0} onClick={() => bulk('delete')}>
              Delete
            </button>
          </div>
        </section>
      )}

      {/* Filters */}
      <section aria-label="Filters" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Played status" className="inline-flex rounded-lg border border-border bg-surface p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={status === t.value}
                onClick={() => setStatus(t.value)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                  status === t.value ? 'bg-accent text-bg' : 'text-muted hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
            className="input w-auto"
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search map, author or requester…"
            className="input min-w-[14rem] flex-1"
            aria-label="Search"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input
            value={myName}
            onChange={(e) => updateMyName(e.target.value)}
            placeholder="Your Twitch name"
            className="input w-48"
            aria-label="Your Twitch name"
          />
          <label className="flex cursor-pointer items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              disabled={!myName.trim()}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Only my requests
          </label>
        </div>
      </section>

      {notice && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {notice}
        </p>
      )}
      {error && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : maps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted">
          <p className="text-lg font-medium text-fg">Nothing here yet</p>
          <p className="mt-1 text-sm">
            {debouncedSearch || userFilter || status !== 'all'
              ? 'No requests match your filters.'
              : 'Requests from chat will show up here automatically.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {maps.map((m) => (
            <MapCard
              key={m.id}
              map={m}
              isAdmin={isAdmin}
              selected={selected.has(m.id)}
              busy={busyIds.has(m.id)}
              onSelect={select}
              onTogglePlayed={togglePlayed}
              onDelete={deleteOne}
            />
          ))}
        </div>
      )}

      <footer className="pb-4 pt-2 text-center text-xs text-muted">
        Map data from{' '}
        <a href="https://trackmania.exchange" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">
          Trackmania.exchange
        </a>
      </footer>
    </main>
  );
}
