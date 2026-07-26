# Proposal: Fix SiblingDeclineBridge duplicate definition

## Problem
`SiblingDeclineBridge` is exported from both `src/shared/ipc.ts` and `src/shared/sibling-offer-types.ts`. The `sibling-offer-types.ts` copy uses `Omit<SiblingDeclineRecord, "declinedAt">` for type precision; the `ipc.ts` copy uses an inline object literal. Structural compatibility today, but any divergence would silently break the IPC contract.

## Solution
- Remove the duplicate interface from `ipc.ts`
- Import `SiblingDeclineBridge` from `sibling-offer-types.ts` in `ipc.ts`
- The canonical definition in `sibling-offer-types.ts` is the more precise version (uses `Omit<SiblingDeclineRecord>`)

## Scope
- Focused — 2 files touched, no behavioral change
