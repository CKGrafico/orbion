# port-validation-recovery Specification

## Purpose
TBD - created by archiving change shell-injection-port-validation. Update Purpose after archive.
## Requirements
### Requirement: Port validation before shell interpolation in startViaSsh
The system SHALL validate that the port number passed to `startViaSsh()` is a safe integer in the range 1–65535 before constructing any shell command string. If the port fails validation, the function SHALL return `false` without executing any SSH command.

#### Scenario: Valid port passes validation
- **WHEN** `startViaSsh` is called with port `8080`
- **THEN** the shell command is constructed and executed with the validated port value

#### Scenario: NaN port is rejected
- **WHEN** `startViaSsh` is called with `NaN` as the port
- **THEN** the function returns `false` without constructing or executing any shell command

#### Scenario: Zero port is rejected
- **WHEN** `startViaSsh` is called with port `0`
- **THEN** the function returns `false` without constructing or executing any shell command

#### Scenario: Out-of-range port is rejected
- **WHEN** `startViaSsh` is called with port `70000`
- **THEN** the function returns `false` without constructing or executing any shell command

#### Scenario: Negative port is rejected
- **WHEN** `startViaSsh` is called with port `-1`
- **THEN** the function returns `false` without constructing or executing any shell command

