# Fix: Double Pairing Code Exchange — Session Token Never Persisted for New VMs

**Change ID:** fix-50-double-pairing-code-exchange  
**Severity:** Critical (9.2/10)  
**Issue:** #50

## Problem

The VM wizard (`vm-wizard.ts`) exchanges the pairing code **twice**, but the token from the first exchange is **discarded** and the second exchange fails because the code has already been consumed. This means the session token is **never stored** for newly created environments, leaving them in an unauthenticated state.

### Root Cause

1. Line 339: First `exchangePairingCode()` call consumes the one-time pairing code and returns a session token
2. The token is checked (`exchangeResult.token`) but **never stored** — only `pair.paired = true` is set
3. Line 362: Second `exchangePairingCode()` call with the same code fails because pairing codes are single-use
4. `storeSessionToken()` is only reachable in the second exchange path, so it is **never executed**
5. New VM environments have no stored session token — they show as unauthenticated/blocked

## Affected Files

- `src/main/vm-wizard.ts` (lines 337–366)

## Fix Strategy

**Option B (implemented):** Remove the second exchange entirely and persist the token from the first exchange.

1. Introduce a `pendingToken` variable to capture the token from the first (and only) exchange
2. After `addEnvironment()` creates the environment (providing the env ID needed for storage), call `storeSessionToken(env.id, pendingToken)` with the saved token
3. Remove the second `exchangePairingCode()` call — pairing codes are single-use by design

## Risk

Low-risk change: removes dead code (the second exchange always failed) and adds the missing token persistence. No behavioral regression — the only change is that tokens will now actually be stored, which is the intended behavior.
