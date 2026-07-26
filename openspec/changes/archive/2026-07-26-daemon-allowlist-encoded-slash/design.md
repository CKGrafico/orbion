## Context

The daemon allowlist (`src/shared/daemon-allowlist.ts`) is the documented trust boundary for renderer-initiated daemon requests. Its regex patterns use `[^/]+` to match path segments, which does not see URL-encoded slashes (`%2F`/`%2f`) as `/`. Currently, `isAllowedPath` in `ipc-validation.ts` rejects `%2f` before the allowlist is consulted, but this is a brittle two-layer defense — any bypass of `isAllowedPath` creates a path-traversal vulnerability.

## Goals / Non-Goals

**Goals:**
- Make the allowlist self-contained: reject encoded slashes at the allowlist level regardless of upstream checks
- Preserve existing allowlist behavior for all legitimate paths
- Update tests to reflect the new expected behavior

**Non-Goals:**
- Changing the regex patterns themselves (alternative approach 2 from the issue)
- Removing the upstream `isAllowedPath` check (defense in depth remains)
- Adding rejection for other percent-encoded characters beyond `%2f`/`%2F`

## Decisions

**1. Add `%2f`/`%2F` guard inside `isAllowedApiOperation` and `isAllowedStreamPath`**

After `stripQueryString`, check `/%2[fF]/.test(pathWithoutQuery)` and return `false`.

Rationale: Simplest fix. Matches the pattern already used in `isAllowedPath`. Does not require Changing regex patterns, which would be harder to audit and could introduce regressions in the `[^/]+` segments.

Alternative considered: Change `[^/]+` to `[^/%]+` in regex patterns. Rejected because it changes the meaning of existing patterns and could reject legitimate percent-encoded characters in IDs (e.g., `%20` in a loop name). The explicit `%2f` check is narrower and more auditable.

## Risks / Trade-offs

- [Legitimate IDs with `%2f`] → No known loop IDs contain `%2f`. If one did, it would already be rejected by `isAllowedPath`, so no functional change in the real flow.
- [Other encoded traversal vectors] → `%2e` (encoded dot for `..`) is already handled by `isAllowedPath`. Not in scope for this change — the allowlist match-regex would not match `..` anyway since `[^/]+` excludes dots in multi-dot sequences. But the explicit `%2e` check in `isAllowedPath` covers the decoded case.
