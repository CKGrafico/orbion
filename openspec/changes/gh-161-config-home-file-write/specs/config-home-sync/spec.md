## ADDED Requirements

### Requirement: Config file written to config-home VM on meaningful changes
After any config mutation (environment add/remove, endpoint change, main-VM designation, chat session change, etc.), the system SHALL write a sanitized JSON config file to `~/.orbion/config.json` on the designated config-home VM.

#### Scenario: Environment added triggers sync
- **WHEN** a new environment is added to the config store
- **THEN** the system SHALL write the sanitized config to `~/.orbion/config.json` on the config-home VM within 2 seconds

#### Scenario: Environment removed triggers sync
- **WHEN** an environment is removed from the config store
- **THEN** the system SHALL write the sanitized config to `~/.orbion/config.json` on the config-home VM within 2 seconds

#### Scenario: Multiple rapid mutations are coalesced
- **WHEN** three config mutations occur within 500ms (e.g. wizard adding environment + endpoint + session token)
- **THEN** the system SHALL write the config to the VM only once, using the final state after all mutations

### Requirement: Config payload contains only non-secret fields
The JSON written to the remote file SHALL contain only fields from the `sanitizeEnvironmentForSync` allowlist. No password, session token, encrypted value, or encryption metadata SHALL appear in the file.

#### Scenario: No secrets in remote config file
- **WHEN** the config is written to the config-home VM
- **THEN** the JSON file SHALL NOT contain any field named "password", "wasEncrypted", "encryptedAccessToken", "encryptedValue", or "accessToken"

#### Scenario: Config stamp included in remote file
- **WHEN** the config is written to the config-home VM
- **THEN** the JSON file SHALL include a top-level `configStamp` object with `timestamp` and `revision` fields

### Requirement: Remote file permissions are owner-only
The config file on the config-home VM SHALL have `chmod 600` permissions (owner read/write only).

#### Scenario: File permissions after write
- **WHEN** the config is written to the config-home VM
- **THEN** the file `~/.orbion/config.json` SHALL have permissions `0o600` (owner read/write, no group or other access)

### Requirement: SSH transport for remote VMs
When the config-home VM's active endpoint is of kind `ssh`, the system SHALL write the config file by executing a command over SSH, piping the JSON payload via stdin.

#### Scenario: Write via SSH
- **WHEN** the config-home VM has an SSH endpoint as its active endpoint
- **THEN** the system SHALL execute `mkdir -p ~/.orbion && cat > ~/.orbion/config.json && chmod 600 ~/.orbion/config.json` over SSH, piping the JSON via stdin

#### Scenario: SSH write failure is non-blocking
- **WHEN** the SSH write fails (timeout, connection refused, etc.)
- **THEN** the system SHALL log the error and continue without blocking the user's workflow. The next config mutation SHALL trigger a retry.

### Requirement: Local filesystem transport for direct endpoints
When the config-home VM's active endpoint is of kind `direct`, the system SHALL write the config file directly to the local filesystem using Node.js `fs` module.

#### Scenario: Write via local filesystem
- **WHEN** the config-home VM has a direct endpoint as its active endpoint
- **THEN** the system SHALL create `~/.orbion/` directory if it doesn't exist, write the JSON to `~/.orbion/config.json`, and set file permissions to `0o600`

### Requirement: No sync when no main-VM is designated
When no environment has the `main-vm` role, the sync SHALL be skipped silently.

#### Scenario: No main-VM set
- **WHEN** no environment has `role: "main-vm"`
- **THEN** no config write SHALL be attempted. No error SHALL be surfaced.

### Requirement: Loop-task is not involved
The config sync SHALL NOT use any loop-task API endpoint or interact with the loop-task daemon in any way.

#### Scenario: No loop-task API calls during sync
- **WHEN** the config is being written to the config-home VM
- **THEN** the system SHALL NOT call any loop-task HTTP API endpoint (e.g. `/api/loops`, `/api/events`, etc.)
