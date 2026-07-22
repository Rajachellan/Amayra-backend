/**
 * In-memory JWT blacklist (jti → expiry).
 * Suitable for single-instance / Coolify single replica.
 * Swap for Redis when horizontally scaling.
 */
const blacklist = new Map<string, number>();

function sweep(): void {
  const now = Date.now();
  for (const [jti, exp] of blacklist.entries()) {
    if (exp <= now) blacklist.delete(jti);
  }
}

setInterval(sweep, 60_000).unref?.();

export function blacklistToken(jti: string, expiresAtMs: number): void {
  if (!jti) return;
  blacklist.set(jti, expiresAtMs);
}

export function isTokenBlacklisted(jti: string | undefined): boolean {
  if (!jti) return false;
  const exp = blacklist.get(jti);
  if (!exp) return false;
  if (exp <= Date.now()) {
    blacklist.delete(jti);
    return false;
  }
  return true;
}
