# Fingerprint collapse

## Route

`GET /.well-known/orbion/environment` returns `{ id: string, label: string }`.

Timeout: 3 seconds. Non-blocking — if the route doesn't exist, we fall back to URL-as-identity.

## Collapse logic (main process)

When `addEnvironment` is called:

1. Fetch fingerprint from the new URL.
2. If the fingerprint exists, search existing environments for one with the same `fingerprintId`.
3. If found: add the new URL as an endpoint on the existing environment (don't create a new one).
4. If not found (or no fingerprint): create a new environment and store the `fingerprintId`.

## Renderer fallback (localStorage mode)

In non-Electron mode, we probe each existing environment's active endpoint. If the new URL can reach a daemon that's already reachable via an existing endpoint, we add the new URL as an endpoint instead of creating a new environment. This is a heuristic — less reliable than fingerprint, but covers the common case.
