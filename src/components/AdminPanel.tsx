'use client';

import { FormEvent, useState } from 'react';

interface LoginProps {
  onSuccess: () => void;
  onCancel: () => void;
}

/** Small inline password prompt. */
export function AdminLogin({ onSuccess, onCancel }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPassword('');
        onSuccess();
      } else {
        setError(data.message ?? 'Login failed.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
      <label className="sr-only" htmlFor="admin-password">
        Admin password
      </label>
      <input
        id="admin-password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        className="input max-w-xs flex-1"
      />
      <button type="submit" className="btn btn-primary" disabled={busy || !password}>
        {busy ? 'Checking…' : 'Log in'}
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

interface AddProps {
  onAdd: (map: string, user: string) => Promise<string | null>;
}

/** Admin-only form: add a map manually (testing / streamer picks). */
export function AddMapForm({ onAdd }: AddProps) {
  const [map, setMap] = useState('');
  const [user, setUser] = useState('streamer');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const error = await onAdd(map, user);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
    } else {
      setMessage({ ok: true, text: 'Map added.' });
      setMap('');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-3">
      <h3 className="mb-2 text-sm font-semibold">Add a map manually</h3>
      <div className="flex flex-wrap gap-2">
        <input
          value={map}
          onChange={(e) => setMap(e.target.value)}
          placeholder="Map ID, UID or trackmania.exchange link"
          className="input min-w-[14rem] flex-[2]"
          aria-label="Map ID, UID or link"
        />
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Requested by"
          className="input min-w-[8rem] flex-1"
          aria-label="Requested by"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !map.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
