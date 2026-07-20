## ADDED Requirements

### Requirement: Discard does not roll back side effects
When an ephemeral chat session is discarded (session metadata removed, transcript deleted), any side effects that were executed through that session SHALL remain intact on the loop-task daemon. Specifically:
- Loops created via the chat SHALL continue to exist and be returned by the loop-list API.
- Chain edits applied via the chat SHALL remain applied on the daemon.

#### Scenario: Loop created in ephemeral chat survives discard
- **WHEN** a user creates a loop through an ephemeral chat session
- **AND** the user navigates away from the session
- **AND** the discard toast expires without undo
- **THEN** the session is removed from Orbion's config store
- **AND** the transcript is deleted
- **AND** the loop still exists on the daemon and is returned by `GET /api/loops`

#### Scenario: Chain edit applied in ephemeral chat survives discard
- **WHEN** a user applies a chain edit through an ephemeral chat session
- **AND** the user navigates away from the session
- **AND** the discard toast expires without undo
- **THEN** the session is removed from Orbion's config store
- **AND** the transcript is deleted
- **AND** the chain edit remains applied on the daemon

### Requirement: Discard flow explicitly documents side-effect permanence
The ephemeral-session discard code path in App.tsx SHALL include a documentation comment stating that discarding a chat only removes local session metadata and transcript, never side effects that were executed on the daemon (loop creation, chain edits, etc.).

#### Scenario: Documentation comment present on discard flow
- **WHEN** a developer reads the ephemeral-session discard-on-leave effect in App.tsx
- **THEN** there SHALL be a comment explaining that side effects outlive the chat and are not rolled back by discard

### Requirement: Regression test for side-effect permanence
There SHALL be a regression test that verifies the side-effect permanence invariant: after a session is discarded, loops created through it remain on the daemon.

#### Scenario: Test asserts loop survives session discard
- **WHEN** the regression test runs
- **THEN** it SHALL create a session, simulate loop creation, discard the session, and assert the loop data is still available
