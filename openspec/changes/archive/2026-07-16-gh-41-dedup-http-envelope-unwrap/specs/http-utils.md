# Spec: fetchAndUnwrap API

## Type signature

```typescript
// src/main/http-utils.ts

export interface FetchAndUnwrapOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Called when response status is 401; receives the status code */
  onUnauthorized?: (status: number) => Promise<void>;
  /** Custom validation for non-envelope JSON responses.
   *  Return the typed data or `null` to reject. */
  validateJson?: (data: unknown) => unknown | null;
  /** i18n key for HTTP error fallback */
  errorKey?: string;
  /** Params for the i18n error key */
  errorParams?: Record<string, string | number>;
}

export type FetchAndUnwrapResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string | I18nMessage };

export async function fetchAndUnwrap<T = unknown>(
  url: string,
  opts?: FetchAndUnwrapOptions,
): Promise<FetchAndUnwrapResult<T>>
```

## Behavior

1. Build request: merge method, headers, body (JSON.stringify if body provided + set Content-Type)
2. Set AbortController timeout (default 10_000ms)
3. `fetch(url, ...)` with signal
4. On 401/403: call `onUnauthorized` if provided
5. Read `.text()` from response
6. Try `JSON.parse(text)` — if fails, keep raw text as `parsed`
7. If `validateJson` is provided: call it with parsed data. If it returns non-null → `{ ok: true, data: result }`. If null → treat as error.
8. If parsed is object with `"ok"` key (envelope):
   - `envelope.ok === true` → `{ ok: true, data: envelope.data ?? parsed }`
   - `envelope.ok === false` → `{ ok: false, error: envelope.error?.message ?? i18nFallback }`
9. If `!res.ok` → `{ ok: false, error: i18nFallback }`
10. Otherwise → `{ ok: true, data: parsed }`
11. Catch: AbortError → timeout message; other → err.message; return `{ ok: false, status: 0, error }`

## Usage per call site

| Call site | Special config |
|---|---|
| `handleApiRequest` | Default envelope mode, `onUnauthorized` removes session token, custom i18n key |
| `makeProbe` | Default envelope mode, `onUnauthorized` removes session token, probe timeout |
| `fetchFingerprint` | `validateJson` checks `"id" in data && "label" in data`, returns null on any failure |
| `exchangePairingCode` | `validateJson` checks `"accessToken" in data`, custom error key on bad shape |
