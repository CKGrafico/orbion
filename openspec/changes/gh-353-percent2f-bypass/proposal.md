# Proposal: Block URL-encoded slashes in daemon API paths

**Change ID:** gh-353-percent2f-bypass
**Issue:** #353
**Scope:** focused (2 files, 1-line fix + tests)

## Problem

`isAllowedPath()` in `src/main/ipc-validation.ts:56–73` validates paths and blocks `..` traversal and `%2e`/`%25` encoding, but does NOT block `%2F` (URL-encoded slash).

The daemon-allowlist regexes in `src/shared/daemon-allowlist.ts` use `[^/]+` to match loop IDs. A path like `/api/loops/abc%2Fdef` passes both `isAllowedPath()` and the regex `^/api/loops/[^/]+$` because `%2F` is not a literal `/` at the regex level. When the daemon HTTP server URL-decodes the path, it sees `/api/loops/abc/def` — bypassing the segment count constraint.

## Solution

Add `/%2f/i` check in `isAllowedPath()` to reject paths containing URL-encoded slashes (both `%2F` and `%2f`). This is a one-line addition alongside the existing `%2e` and `%25` checks.

## Affected Files

- `src/main/ipc-validation.ts` — `isAllowedPath()` function
- `src/shared/__tests__/daemon-allowlist.test.ts` — add negative tests for `%2F` bypass
- `tests/ipc-validation.test.ts` — add `%2F` rejection tests for `isAllowedPath`
- `src/main/__tests__/daemon-allowlist-ipc.test.ts` — add `%2F` rejection integration test

## Acceptance Criteria

- Path `/api/loops/abc%2Fdef` → `isAllowedPath` returns `false`
- Path `/api/loops/abc%2fsecret` → `isAllowedPath` returns `false`
- Valid paths like `/api/loops/abc-123` still pass
