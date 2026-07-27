## Context

The credential vault in `src/main/credential-vault.ts` logs reference UUIDs at three points: migration (line 87, `info`), integrity failure (line 93, `error`), and orphan pruning (line 124, `warn` with full array). The `CredentialTamperedError` class already propagates the reference programmatically, so the log inclusion is redundant as well as unsafe.

## Goals / Non-Goals

**Goals:**
- Remove all credential-reference identifiers from structured and unstructured log output.
- Preserve programmatic error reporting via `CredentialTamperedError.reference`.

**Non-Goals:**
- Changing log levels or log format infrastructure.
- Hashing or truncating references — simply omitting them is sufficient and simpler.
- Redacting references from `CredentialTamperedError` (it is an in-memory error, not persisted).

## Decisions

**Omit rather than hash.** The issue suggests hashing as an alternative, but a plain omission is unambiguous, zero-cost, and eliminates the correlation vector entirely. Hashing introduces a reversible mapping risk if the hash space is small or the UUID format is predictable.

## Risks / Trade-offs

- [Debugging becomes marginally harder] → The `CredentialTamperedError` still carries the `reference` for programmatic inspection. Log-based debugging must cross-reference via the error object, not the log line. Acceptable trade-off for a security fix.
