# Spec: isAllowedPath Hardening

## Current Behavior

```typescript
function isAllowedPath(v: unknown): v is string {
  if (!isString(v)) return false;
  return v.startsWith("/") && !v.includes("..");
}
```

Bypass examples:
- `/api/%2e%2e/admin/secrets` — URL-encoded traversal
- `/api/..%252f..%252f/admin` — Double-encoded traversal
- `/admin/../../../etc/passwd` — Passes `..` check but also allows non-`/api/` paths

## New Behavior

```typescript
function isAllowedPath(v: unknown): v is string {
  if (!isString(v)) return false;
  if (!v.startsWith("/api/")) return false;          // prefix allowlist
  if (v.length > 512) return false;                   // length limit

  // Decode to catch URL-encoded traversal
  try {
    const decoded = decodeURIComponent(v);
    if (decoded.includes("..")) return false;
  } catch {
    return false; // malformed encoding
  }

  // Reject raw encoded dot forms and double-encoding
  if (/%2e/i.test(v)) return false;
  if (/%25/i.test(v)) return false;

  return true;
}
```

### Validation Rules (in order)

| # | Check | Rejects |
|---|-------|---------|
| 1 | `isString(v)` | non-string values |
| 2 | `v.startsWith("/api/")` | non-API paths, bare `/` |
| 3 | `v.length <= 512` | oversized paths |
| 4 | `decodeURIComponent(v)` succeeds | malformed encoding |
| 5 | `decoded.includes("..")` is false | traversal (plain + single-encoded) |
| 6 | `/%2e/i.test(v)` is false | encoded dots in raw form |
| 7 | `/%25/i.test(v)` is false | double-encoding attempts |

## impact on `handleApiRequest()`

The inline check at `index.ts:160-162` will be removed since `validateIpc("api:request", ...)` already runs `isAllowedPath()` via the validator registry. The duplicate check is redundant and weaker.
