## Why

The daemon allowlist regexes (`[^/]+`) match URL-encoded slashes (`%2F`/`%2f`), allowing paths like `/api/loops/abc%2Fdef` to pass `isAllowedApiOperation` and `isAllowedStreamPath`. The defense currently relies on `isAllowedPath` in `ipc-validation.ts` rejecting `%2f` upstream — but the allowlist's own doc comment calls it the trust boundary. Any code path that calls `isAllowedApiOperation`/`isAllowedStreamPath` without first passing through `isAllowedPath` creates a path-traversal vulnerability. Issue #385.

## What Changes

- Add `/%2[fF]/` rejection directly in `isAllowedApiOperation` and `isAllowedStreamPath` so the allowlist is self-contained as a trust boundary
- Update the two existing tests that currently *expect* encoded slashes to pass — flip them to expect rejection
- Add negative tests for encoded slashes in `isAllowedStreamPath`

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `daemon-allowlist`: reject URL-encoded slashes at the allowlist level instead of relying on upstream validation

## Impact

- `src/shared/daemon-allowlist.ts`: `isAllowedApiOperation` and `isAllowedStreamPath` gain an encoded-slash guard
- `src/shared/__tests__/daemon-allowlist.test.ts`: two tests flip from `toBe(true)` to `toBe(false)`, plus new stream-path negative tests
- No API, dependency, or architectural changes
