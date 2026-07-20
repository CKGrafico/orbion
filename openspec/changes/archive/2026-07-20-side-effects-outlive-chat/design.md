## Context

Orbion's chat sessions are ephemeral by default. When a user navigates away from an ephemeral session, a 5-second undo toast is shown; if not undone, the session metadata (`configService.removeChatSession`) and transcript (`transcriptService.deleteSession`) are deleted. Side effects (loops created via POST to the daemon, chain edits applied via MCP) live on the loop-task daemon, not in Orbion's local state. The architecture implies these outlive the chat, but no test enforces this and the discard code does not explicitly state the invariant.

## Goals / Non-Goals

**Goals:**
- Make the side-effect permanence invariant explicit via documentation on the discard flow.
- Provide a regression test that proves discarding a session does not affect loops on the daemon.
- Provide a regression test that proves discarding a session does not affect chain edits on the daemon.

**Non-Goals:**
- Changing the discard flow behavior (it already correctly does not touch daemon state).
- Adding runtime guards or wrapper mechanisms at the IPC/api level (the separation is architectural, not enforced by code).
- Testing the undo flow or inactivity sweep (those are separate concerns).

## Decisions

1. **Test approach: mock-based unit test.** The test simulates the discard flow at the service level (removeChatSession + deleteSession) and verifies the mock loop store is untouched. This avoids needing a running Electron app or daemon. The mock adapter in `MockServices.ts` already maintains an in-memory loop store that persists across session lifecycle calls.

2. **Documentation over code guard.** Rather than adding defensive code (e.g., a "side-effect tracker" that would be redundant since side effects are async HTTP calls to the daemon), we document the invariant. Adding runtime enforcement would be over-engineering for what is an architectural guarantee.

3. **Test file location:** `tests/side-effect-permanence.test.ts`, following the existing convention of test files at the project root.

## Risks / Trade-offs

- [Risk: mock tests don't prove real daemon behavior] The mock adapter simulates the daemon's behavior. A future change to the MockServices that introduces incorrect behavior could pass the test while the real daemon diverges. Mitigation: the mock is intentionally thin and mirrors the daemon's CRUD semantics; the test is a regression guard against accidental changes to the Orbion-side discard logic, not a full integration test.

- [Risk: documentation can go stale] Comments may not be updated if the discard flow changes. Mitigation: the test is the primary enforcement mechanism; comments are supplementary.

## Migration Plan

No migration needed. This is purely additive (comments + test file).

## Open Questions

None. The architecture is clear.
