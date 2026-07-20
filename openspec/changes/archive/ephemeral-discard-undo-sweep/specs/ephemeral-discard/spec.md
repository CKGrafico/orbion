## ADDED Requirements

### Requirement: Discard ephemeral session on navigation away
When the user navigates away from an ephemeral (unpersisted) chat session, the system SHALL initiate a discard flow. The session SHALL NOT be deleted immediately. Instead, the system SHALL show a toast notification with an "Undo" button.

#### Scenario: User navigates from ephemeral session to inbox
- **WHEN** the active view is a session with `persisted: false` and the user navigates to the inbox
- **THEN** the system SHALL show a toast with the text "Chat discarded" and an "Undo" button
- **AND** the session SHALL remain in the config store until the undo window expires

#### Scenario: User navigates from ephemeral session to another ephemeral session
- **WHEN** the active view is a session with `persisted: false` and the user navigates to a different session
- **THEN** the system SHALL show a discard toast for the left session
- **AND** the new session SHALL become active immediately

#### Scenario: User navigates from persisted session to another view
- **WHEN** the active view is a session with `persisted: true` and the user navigates away
- **THEN** the system SHALL NOT show a discard toast
- **AND** no session data SHALL be affected

### Requirement: Undo restores discarded ephemeral session
The discard toast SHALL include an "Undo" action. When clicked within the undo window, the session SHALL be restored exactly: same session ID, same transcript, same view state.

#### Scenario: User clicks Undo within the undo window
- **WHEN** the discard toast is visible and the user clicks "Undo" within 5 seconds
- **THEN** the session SHALL be restored (it was never deleted)
- **AND** the view SHALL navigate back to the restored session
- **AND** the toast SHALL dismiss

#### Scenario: Undo window expires without action
- **WHEN** 5 seconds pass without the user clicking "Undo"
- **THEN** the toast SHALL dismiss
- **AND** the session and its transcript SHALL be permanently deleted via `removeChatSession` and `transcript:deleteSession`

### Requirement: Only one discard toast at a time
If the user navigates away from multiple ephemeral sessions in quick succession, only the most recent discard SHALL show a toast. Any previous pending discard SHALL be finalized immediately (session deleted without further undo opportunity).

#### Scenario: Rapid navigation through multiple ephemeral sessions
- **WHEN** a discard toast is visible for session A and the user navigates away from ephemeral session B
- **THEN** session A SHALL be deleted immediately (undo window forfeited)
- **AND** a new discard toast SHALL appear for session B with a fresh 5-second window
