/**
 * Nur http(s)-Adressen und Pfade auf dem eigenen Server (z. B. /local/...) sind erlaubt.
 * Verhindert u. a. javascript:-Links, die im HA-Frontend ausgeführt würden.
 */
export function isSafeUrl(value: string): boolean {
  const url = value.trim();
  if (url.startsWith('/')) {
    return true;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
