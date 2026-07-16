# run-selector Specification

## Purpose
TBD - created by archiving change loop-detail-run-selector-log-rendering. Update Purpose after archive.
## Requirements
### Requirement: Run selector panel in LoopDetail
The LoopDetail view SHALL display a run selector panel that lists all entries from `LoopMeta.runHistory` in reverse chronological order (newest first). Each entry SHALL display the run number, a status indicator (running/completed), exit code (when available), duration (when available), and timestamp. The user SHALL be able to select a run to scroll the log viewer to that run's content.

#### Scenario: Run history displayed when loop has run records
- **WHEN** a loop has `runHistory` with multiple entries
- **THEN** the run selector panel displays each run as a compact row with run number, status dot, exit code, duration, and timestamp

#### Scenario: Selecting a run scrolls log viewer
- **WHEN** the user clicks on a run entry in the selector
- **THEN** the log viewer scrolls to the start of that run's log content

#### Scenario: Run selector shows status indicators
- **WHEN** a run has `status: "running"`
- **THEN** the run entry displays a blue status dot
- **WHEN** a run has `status: "completed"` and `exitCode: 0`
- **THEN** the run entry displays a green status dot
- **WHEN** a run has `status: "completed"` and `exitCode` non-zero
- **THEN** the run entry displays a red status dot

#### Scenario: Empty run history
- **WHEN** a loop has an empty `runHistory`
- **THEN** the run selector panel is not displayed

### Requirement: Run selector panel is collapsible
The run selector panel SHALL be collapsible to preserve vertical space for the log viewer. When collapsed, it SHALL show only the most recent run's summary. When expanded, it SHALL show all run entries.

#### Scenario: Collapsed state shows latest run summary
- **WHEN** the run selector panel is collapsed
- **THEN** only the most recent run's number and status are visible

#### Scenario: Expanding the panel shows all runs
- **WHEN** the user clicks the collapsed panel header
- **THEN** all run entries become visible

