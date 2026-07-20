## Why

Discarding an ephemeral (scratch) chat must never roll back or orphan side effects that chat caused (loops created, chains edited). The architecture already implies this: loops live on the loop-task daemon, not in Orbion's local state, and discarding a session only removes the session metadata and transcript. However, this invariant is not asserted by any test, and the discard code lacks explicit documentation of the guarantee. A regression could silently break it.

## What Changes

- Add explicit documentation comments on the ephemeral-session discard flow in `App.tsx` stating the side-effect permanence invariant.
- Add a regression test asserting that after a session is discarded (config session removed + transcript deleted), loops that were created through that session remain intact on the daemon and are still returned by the loop-list API.
- Add a regression test asserting that chain edits applied through a discarded session remain on the daemon.

## Capabilities

### New Capabilities
- `side-effect-permanence`: Regression test suite and documentation asserting that discarding a chat never rolls back or orphans actions taken through it (loop creation, chain edits).

### Modified Capabilities
<!-- No spec-level behavior changes required -->

## Impact

- `src/renderer/src/App.tsx` (documentation comments on discard flow)
- `tests/side-effect-permanence.test.ts` (new regression test file)
