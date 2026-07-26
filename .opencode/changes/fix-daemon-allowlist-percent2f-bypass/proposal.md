# Proposal: Fix daemon-allowlist %2F regex bypass

## Summary

Block URL-encoded slashes in daemon API paths so the allowlist regex cannot be bypassed by sending `%2F` where the regex expects `[^/]+`.

## Problem

`isAllowedPath()` in `src/main/ipc-validation.ts` validates paths but did not block `%2F` (URL-encoded slash). The daemon-allowlist regexes in `src/shared/daemon-allowlist.ts` use `[^/]+` to match loop IDs. A path like `/api/loops/abc%2Fdef` passes the regex because `%2F` is not a literal `/`, but when the daemon HTTP server URL-decodes, it sees `/api/loops/abc/def` — an extra path segment bypassing the segment count constraint.

## Fix (already in codebase)

The `/%2f/i` check on line 72 of `ipc-validation.ts` already blocks both `%2F` and `%2f`. Tests across `tests/ipc-validation.test.ts`, `src/main/__tests__/daemon-allowlist-ipc.test.ts`, and `src/shared/__tests__/daemon-allowlist.test.ts` already cover all acceptance criteria.

## Scope

- Scope classification: **focused**
- Affected files: `src/main/ipc-validation.ts`, `src/shared/__tests__/daemon-allowlist.test.ts`
- Issue: #353
