/**
 * Central, typed access to environment variables.
 * Read lazily (function call) so values are picked up at runtime, not frozen at build time.
 */

const int = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function getEnv() {
  return {
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '',
    baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    requestApiKey: process.env.REQUEST_API_KEY ?? '',
    userCooldownSec: int(process.env.USER_COOLDOWN_SECONDS, 15),
    maxUnplayedPerUser: int(process.env.MAX_UNPLAYED_PER_USER, 3),
    ipLimitPerMinute: int(process.env.IP_LIMIT_PER_MINUTE, 120),
    textAlways200: process.env.TEXT_ALWAYS_200 !== 'false',
    thumbnailTemplate:
      process.env.TMX_THUMBNAIL_TEMPLATE || 'https://trackmania.exchange/mapthumb/{id}',
  };
}
