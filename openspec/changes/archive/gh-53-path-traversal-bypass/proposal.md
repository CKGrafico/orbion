# Security: isAllowedPath path traversal bypass via URL-encoded and double-encoded sequences

**Change ID:** gh-53-path-traversal-bypass
**Issue:** #53
**Severity:** Medium-High

## Problem

The `isAllowedPath()` validator in `ipc-validation.ts` rejects paths containing `..` but fails to account for **URL-encoded** (`%2e%2e`) and **double-encoded** (`%252e%252e`) traversal sequences. Since these paths are passed to `fetchAndUnwrap()` which constructs HTTP URLs, a compromised renderer can bypass the traversal check and access unintended API endpoints on the remote daemon.

Additionally:
- The validator only checks for `..` as a literal substring — it does not reject encoded dots
- It does not validate path prefix (allows any `/` prefix, not just `/api/`)
- It does not enforce a path length limit
- The inline check in `handleApiRequest()` (index.ts line 160) duplicates the same weak logic

## Solution

1. **Decode before validation**: Apply `decodeURIComponent()` to the path before checking for `..`
2. **Reject encoded dots**: Block `%2e`, `%2E`, `%252e`, and any `%25` sequences in the raw path
3. **Add `/api/` prefix allowlist**: Only allow paths starting with `/api/` for defense in depth
4. **Enforce path length limit**: Cap at 512 characters
5. **Remove duplicate inline check** in `handleApiRequest()` — rely on the centralized `isAllowedPath`
6. **Add comprehensive unit tests** covering all bypass vectors

## Affected Files

- `src/main/ipc-validation.ts` — harden `isAllowedPath()`
- `src/main/index.ts` — remove duplicate inline check in `handleApiRequest()`
- `tests/ipc-validation.test.ts` — new test file
