## ADDED Requirements

### Requirement: Items auto-resolve when condition clears
The system SHALL automatically resolve inbox items when their underlying condition clears, removing them from the active inbox list with no user gesture required.

#### Scenario: Failed loop recovers on next run
- **WHEN** a loop is in `failed` state and appears as a `failed-loop` inbox item
- **AND** the next poll cycle shows the loop is no longer in a failed state (its status changed to `running`, `waiting`, `paused`, `stopped`, or `finished` with exit code 0)
- **THEN** the inbox item SHALL be auto-resolved and removed from the active list

#### Scenario: Budget breach clears when runs drop below threshold
- **WHEN** a budget breach inbox item exists for a loop
- **AND** the loop's run-count-today drops below the watch threshold
- **THEN** the breach inbox item SHALL be auto-resolved and removed from the active list

#### Scenario: Offline instance reconnects
- **WHEN** an `instance-offline` inbox item exists for an environment
- **AND** the environment's health changes to `ok` or `connecting`
- **THEN** the inbox item SHALL be auto-resolved and removed from the active list

#### Scenario: Prolonged-offline instance reconnects
- **WHEN** a `prolonged-offline` inbox item exists for an environment
- **AND** the OutageTracker fires an onResolve event for that environment
- **THEN** the inbox item SHALL be auto-resolved and removed from the active list

### Requirement: Resolved items carry resolution metadata
When an inbox item is auto-resolved, the system SHALL persist resolution metadata including the resolution timestamp and a resolution reason string.

#### Scenario: Resolution metadata persisted
- **WHEN** an inbox item is auto-resolved
- **THEN** the system SHALL store a resolved-item record containing the original InboxItem data plus `resolvedAt` (ISO timestamp) and `resolution` (reason string)

### Requirement: Done toggle shows resolved items
The InboxPanel SHALL provide a Done tab/toggle (off by default) that lists auto-resolved items with their resolution info.

#### Scenario: Done toggle defaults to Active view
- **WHEN** the InboxPanel is rendered
- **THEN** the Active view SHALL be shown by default
- **AND** a Done toggle SHALL be visible but inactive

#### Scenario: User switches to Done view
- **WHEN** the user clicks the Done toggle
- **THEN** the InboxPanel SHALL display resolved items sorted by resolvedAt descending
- **AND** each item SHALL show the original title, environment, detail, resolution reason, and resolvedAt timestamp

#### Scenario: User switches back to Active view
- **WHEN** the user clicks the Active toggle while viewing Done
- **THEN** the InboxPanel SHALL return to showing active (unresolved) items

### Requirement: Resolved items retention cap
Resolved items older than 30 days SHALL be automatically pruned from the Done archive.

#### Scenario: Old resolved items pruned
- **WHEN** resolved items are queried for the Done view
- **THEN** any resolved item whose `resolvedAt` is more than 30 days in the past SHALL be excluded and deleted from persistence

### Requirement: Resolved item persistence survives restarts
Resolved items SHALL be persisted in the main process via electron-store so they survive app restarts.

#### Scenario: Resolved items persist after restart
- **WHEN** the app is restarted
- **THEN** previously resolved items SHALL be available in the Done view (within the 30-day retention window)

### Requirement: Mock adapter support for resolved items
The mock InboxService SHALL support auto-resolution and the Done archive so the app works in browser-only dev mode via `pnpm dev:web`.

#### Scenario: Mock inbox supports Done view
- **WHEN** the app runs in browser-only mode without `window.api`
- **THEN** the Done toggle SHALL work
- **AND** auto-resolved items SHALL appear in the Done list
