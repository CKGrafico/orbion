## ADDED Requirements

### Requirement: Inactivity sweep removes abandoned ephemeral sessions
The system SHALL periodically remove ephemeral sessions whose `lastActiveAt` exceeds a configurable threshold (default: 4 hours). The sweep MUST key exclusively on `lastActiveAt`, never on `createdAt`.

#### Scenario: Ephemeral session idle beyond threshold
- **WHEN** an ephemeral session has `lastActiveAt` older than 4 hours
- **AND** the session is NOT currently open (active session ID does not match)
- **THEN** the sweep SHALL delete the session and its transcript

#### Scenario: Ephemeral session is currently open
- **WHEN** an ephemeral session has `lastActiveAt` older than 4 hours
- **AND** the session IS currently the active session in the window
- **THEN** the sweep SHALL NOT delete the session

#### Scenario: Persisted session idle beyond threshold
- **WHEN** a persisted session has `lastActiveAt` older than 4 hours
- **THEN** the sweep SHALL NOT delete the session (persisted sessions are never swept)

### Requirement: Sweep runs periodically from the renderer
The renderer SHALL run a sweep check at a fixed interval (every 30 minutes). The sweep check SHALL invoke a main-process IPC handler that performs the actual deletion.

#### Scenario: Sweep timer fires
- **WHEN** the 30-minute interval elapses
- **THEN** the renderer SHALL call `config:sweepEphemeralSessions` with the active session ID and the inactivity threshold in hours
- **AND** the main process SHALL delete qualifying sessions and return their IDs

#### Scenario: Sweep removes sessions and renderer updates
- **WHEN** the sweep IPC handler returns removed session IDs
- **THEN** the renderer SHALL remove those sessions from its local state
- **AND** if a discard toast was pending for any removed session, the toast SHALL be dismissed

### Requirement: Sweep IPC handler
The main process SHALL expose an IPC handler `config:sweepEphemeralSessions` that accepts `{ activeSessionId: string | null, inactivityThresholdHours: number }` and returns `{ removedSessionIds: string[] }`.

#### Scenario: Main process sweep handler execution
- **WHEN** the IPC handler is invoked
- **THEN** it SHALL iterate all `ChatSession` entries where `persisted === false` and `id !== activeSessionId`
- **AND** for each where `lastActiveAt` is older than `inactivityThresholdHours`, it SHALL delete the session via `removeChatSession` and its transcript via `transcriptStore.deleteSession`
- **AND** it SHALL return the array of deleted session IDs
