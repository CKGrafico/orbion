## ADDED Requirements

### Requirement: Loop card shows contextual action buttons
The LoopCard component SHALL render a row of action buttons below the meta row (or below the log tail if present). The buttons shown SHALL depend on the loop's current status and reachability.

#### Scenario: Running loop shows Pause, Stop, and Run Now is hidden
- **WHEN** a loop has status "running" and the instance is connected
- **THEN** the card shows "Pause" and "Stop" action buttons; "Run Now" and "Resume" are not shown

#### Scenario: Waiting loop shows Pause, Stop, and Run Now
- **WHEN** a loop has status "waiting" and the instance is connected
- **THEN** the card shows "Pause", "Stop", and "Run Now" action buttons; "Resume" is not shown

#### Scenario: Paused loop shows Resume, Stop, and Run Now
- **WHEN** a loop has status "paused" and the instance is connected
- **THEN** the card shows "Resume", "Stop", and "Run Now" action buttons; "Pause" is not shown

#### Scenario: Stopped loop shows Run Now only
- **WHEN** a loop has status "stopped" and the instance is connected
- **THEN** the card shows only the "Run Now" action button; "Pause", "Resume", and "Stop" are not shown

#### Scenario: Failed loop shows Stop and Run Now
- **WHEN** a loop has status "failed" and the instance is connected
- **THEN** the card shows "Stop" and "Run Now" action buttons; "Pause" and "Resume" are not shown

#### Scenario: Finished loop shows no action buttons
- **WHEN** a loop has status "finished"
- **THEN** no action buttons are shown on the card

#### Scenario: Unreachable instance shows no action buttons
- **WHEN** the instance hosting the loop is unreachable
- **THEN** no action buttons are shown on the card

### Requirement: Pause action calls daemon pause endpoint
When the user clicks the Pause button, the component SHALL send `POST /api/loops/:id/pause` via the existing `apiRequest` IPC channel. On success, the card SHALL reflect the paused status promptly.

#### Scenario: Pause a running loop
- **WHEN** user clicks Pause on a running loop
- **THEN** the system sends `POST /api/loops/:id/pause` and the card shows a brief "Paused" confirmation, then the next poll cycle reflects the paused status

#### Scenario: Pause action failure
- **WHEN** user clicks Pause and the daemon returns an error
- **THEN** the card shows the error message inline for ~4 seconds, then returns to the action bar

### Requirement: Resume action calls daemon resume endpoint
When the user clicks the Resume button on a paused loop, the component SHALL send `POST /api/loops/:id/resume` via the existing `apiRequest` IPC channel.

#### Scenario: Resume a paused loop
- **WHEN** user clicks Resume on a paused loop
- **THEN** the system sends `POST /api/loops/:id/resume` and the card shows a brief "Resumed" confirmation, then the next poll cycle reflects the running/waiting status

#### Scenario: Resume action failure
- **WHEN** user clicks Resume and the daemon returns an error
- **THEN** the card shows the error message inline for ~4 seconds

### Requirement: Stop action calls daemon stop endpoint
When the user clicks Stop, the component SHALL send `POST /api/loops/:id/stop` via the existing `apiRequest` IPC channel. The daemon's stop endpoint clears the loop's schedule.

#### Scenario: Stop a running loop
- **WHEN** user clicks Stop on a running loop and confirms
- **THEN** the system sends `POST /api/loops/:id/stop` and the card shows a brief "Stopped" confirmation, then the next poll cycle reflects the stopped status

#### Scenario: Stop action failure
- **WHEN** user clicks Stop and confirms, but the daemon returns an error
- **THEN** the card shows the error message inline for ~4 seconds

### Requirement: Trigger (Run Now) action calls daemon trigger endpoint
When the user clicks Run Now on an eligible loop, the component SHALL send `POST /api/loops/:id/trigger` via the existing `apiRequest` IPC channel.

#### Scenario: Trigger a waiting loop
- **WHEN** user clicks Run Now on a waiting loop and confirms
- **THEN** the system sends `POST /api/loops/:id/trigger` and the card shows a brief "Triggered" confirmation, then the next poll cycle reflects the running status

#### Scenario: Trigger action failure
- **WHEN** user clicks Run Now and confirms, but the daemon returns an error
- **THEN** the card shows the error message inline for ~4 seconds

### Requirement: Destructive actions require confirmation
Actions that interrupt or irrevocably change loop state SHALL require user confirmation before executing. Specifically: Stop (clears schedule) and Pause of a running loop (interrupts active work) SHALL show a confirmation prompt. Resume and Run Now on a waiting/stopped loop are not destructive and SHALL execute immediately.

#### Scenario: Stop action shows confirmation
- **WHEN** user clicks Stop
- **THEN** a confirmation overlay appears inside the card with the message "Stop will clear this loop's schedule. Continue?" and Confirm/Cancel buttons

#### Scenario: Pause running loop shows confirmation
- **WHEN** user clicks Pause on a running loop
- **THEN** a confirmation overlay appears inside the card with the message "Pause this loop? The schedule will be kept." and Confirm/Cancel buttons

#### Scenario: Resume action executes immediately
- **WHEN** user clicks Resume on a paused loop
- **THEN** the resume request is sent immediately without confirmation

#### Scenario: Run Now on stopped loop shows confirmation
- **WHEN** user clicks Run Now on a stopped loop
- **THEN** a confirmation overlay appears with the message "Trigger a run now?" and Confirm/Cancel buttons

#### Scenario: Run Now on waiting loop executes immediately
- **WHEN** user clicks Run Now on a waiting loop
- **THEN** the trigger request is sent immediately without confirmation

#### Scenario: Cancel confirmation dismisses overlay
- **WHEN** user clicks Cancel on the confirmation overlay
- **THEN** the overlay is dismissed and no request is sent

### Requirement: Action buttons are disabled during request
While a loop action request is in flight, all action buttons on that card SHALL be disabled to prevent duplicate submissions.

#### Scenario: Buttons disabled while request is in flight
- **WHEN** user clicks an action and the request has not yet resolved
- **THEN** all action buttons on that card are disabled

#### Scenario: Buttons re-enabled after request resolves
- **WHEN** the request resolves (success or failure)
- **THEN** the action buttons are re-enabled or replaced by the confirmation status message

### Requirement: Daemon allowlist includes stop endpoint
The shared daemon allowlist SHALL permit `POST /api/loops/:id/stop` so that the main-process IPC validation does not reject stop requests from the renderer.

#### Scenario: Stop request passes IPC validation
- **WHEN** the renderer sends `api:request` with method `POST` and path `/api/loops/abc123/stop`
- **THEN** the IPC validation passes and the request is forwarded to the daemon

### Requirement: Mock adapter supports loop action mutations
When running in browser-only dev mode (`pnpm dev:web`), the mock adapter SHALL handle POST requests to `/api/loops/:id/pause`, `/api/loops/:id/resume`, `/api/loops/:id/stop`, and `/api/loops/:id/trigger` by mutating the in-memory loop status and returning `{ ok: true }`.

#### Scenario: Mock pause request
- **WHEN** a POST request is sent to `/api/loops/:id/pause` in mock mode
- **THEN** the loop's status is set to "paused" and the response is `{ ok: true, status: 200 }`

#### Scenario: Mock resume request
- **WHEN** a POST request is sent to `/api/loops/:id/resume` in mock mode
- **THEN** the loop's status is set to "waiting" and the response is `{ ok: true, status: 200 }`

#### Scenario: Mock stop request
- **WHEN** a POST request is sent to `/api/loops/:id/stop` in mock mode
- **THEN** the loop's status is set to "stopped" and the response is `{ ok: true, status: 200 }`

#### Scenario: Mock trigger request
- **WHEN** a POST request is sent to `/api/loops/:id/trigger` in mock mode
- **THEN** the loop's status is set to "running" and the response is `{ ok: true, status: 200 }`
