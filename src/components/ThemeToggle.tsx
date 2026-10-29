'use client';

import { useEffect, useState } from 'react';

/** Dark (default) / light switch. Persists to localStorage; applied via a class on <html>. */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('tm_theme', next ? 'light' : 'dark');
    } catch {
      /* storage blocked – the toggle still works for this session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn"
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}
    >
      {light ? '🌙' : '☀️'}
    </button>
  );
}
