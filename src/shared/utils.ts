// Shared pure utilities used across main, renderer, and shared layers.

/**
 * Compare two semver strings (e.g. "1.2.3" vs "18.0.0").
 * Returns negative if a < b, positive if a > b, zero if equal.
 * Handles optional "v" prefix.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Remove trailing slashes from a URL or path string.
 * Commonly used to normalise environment base URLs before concatenation.
 */
export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
