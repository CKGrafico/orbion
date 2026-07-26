# Tasks

## Task 1: Remove duplicate SiblingDeclineBridge from ipc.ts
- id: T1
- agent: main
- tier: fast
- depends_on: none
- touches: src/shared/ipc.ts

Remove the `export interface SiblingDeclineBridge` block at ipc.ts:1035–1038. Add `import type { SiblingDeclineBridge } from "./sibling-offer-types.js";` at the top of `ipc.ts` alongside existing imports. The `LoopTaskBridge.siblingDecline: SiblingDeclineBridge` reference at line 1065 continues to resolve via the new import.

## Task 2: Verify typecheck, test, build pass
- id: T2
- agent: main
- tier: fast
- depends_on: T1
- touches: none

Run `rtk pnpm typecheck`, `rtk pnpm test`, `rtk pnpm build`. All must pass with zero errors.
