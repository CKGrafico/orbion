# log-write-catch Specification

## Purpose
TBD - created by archiving change fix-log-write-ipc-error-swallow. Update Purpose after archive.
## Requirements
### Requirement: log.write SHALL catch IPC rejections
The `bridge.log.write` method SHALL attach a `.catch()` handler to the `ipcRenderer.invoke("log:write", entry)` promise to prevent unhandled-promise-rejection events.

#### Scenario: Rate-limit rejection is caught
- **WHEN** the main-process handler rejects with `IpcValidationError` due to rate limiting
- **THEN** no unhandled-promise-rejection event is emitted in the renderer process

#### Scenario: Validation rejection is caught
- **WHEN** the main-process handler rejects with `IpcValidationError` due to input validation failure
- **THEN** no unhandled-promise-rejection event is emitted in the renderer process

#### Scenario: Successful write is unaffected
- **WHEN** the main-process handler resolves successfully
- **THEN** the `.catch()` handler is not invoked and behavior is unchanged

