## Context

`startViaSsh()` in `agent-runtime-recovery.ts` constructs a shell command string by interpolating `port` directly. The `port` value originates from `openCodePort()`, which parses a URL and returns `Number(url.port)` — this can produce `NaN`, `0`, or out-of-range integers. None of these are rejected before shell interpolation. `ssh-launch.ts` already has `assertSafePort()` that validates ports as safe integers in 1–65535 before any shell use.

## Goals / Non-Goals

**Goals:**
- Prevent shell injection or malformed commands from invalid port values in `startViaSsh()`
- Reuse the existing `assertSafePort()` from `ssh-launch.ts` — no duplication

**Non-Goals:**
- Changes to `openCodePort()` itself (its `null` return on bad protocol is sufficient)
- Changes to the SSH command structure
- Moving `assertSafePort` to a shared module (export from `ssh-launch.ts` is sufficient for a single consumer)

## Decisions

1. **Export `assertSafePort` from `ssh-launch.ts`** — single-line change, no new file. Only one other consumer.
2. **Guard at the top of `startViaSsh()`** — wrap `assertSafePort` in try/catch, return `false` on failure. Consistent with the early-return-on-error pattern in `ssh-launch.ts` and avoids uncaught exceptions crashing the recovery flow.
3. **No logging on validation failure** — `openCodePort` already returns `null` for invalid URLs, and the caller `recoverOpenCode()` already handles the falsy case. Adding a log on assertSafePort failure would be redundant noise; the existing `logger.warn` on SSH config missing covers the "can't recover" case.

## Risks / Trade-offs

- [assertSafePort throws, startViaSsh catches, returns false] → No leak, no crash, recovery gracefully skipped. Acceptable.
- [Exporting internal function from ssh-launch.ts] → Minimal API surface expansion. Acceptable for a pure validation function with a clear contract.
