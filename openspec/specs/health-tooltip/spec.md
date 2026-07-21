# health-tooltip Specification

## Purpose
TBD - created by archiving change fix-health-tooltip-dedup. Update Purpose after archive.
## Requirements
### Requirement: Shared healthTooltip function
The system SHALL provide a single `healthTooltip` function exported from `src/renderer/src/format.ts` that maps a `ConnectionStatus.phase` to an i18n-formatted tooltip string, falling back to the `EnvironmentHealth` value when no status is provided.

#### Scenario: Connected phase
- **WHEN** `healthTooltip` is called with a `ConnectionStatus` where `phase` is `"connected"`
- **THEN** it SHALL return `intl.formatMessage({ id: "sidebar.connected" })`

#### Scenario: Connecting phase
- **WHEN** `healthTooltip` is called with a `ConnectionStatus` where `phase` is `"connecting"`
- **THEN** it SHALL return `intl.formatMessage({ id: "sidebar.connecting" })`

#### Scenario: Backoff phase
- **WHEN** `healthTooltip` is called with a `ConnectionStatus` where `phase` is `"backoff"`
- **THEN** it SHALL return `intl.formatMessage({ id: "sidebar.retrying" }, { seconds: Math.round(status.backoffMs / 1000), failures: status.failureCount })`

#### Scenario: Blocked phase
- **WHEN** `healthTooltip` is called with a `ConnectionStatus` where `phase` is `"blocked"`
- **THEN** it SHALL return `translateMessage(intl, status.lastError)` if non-empty, otherwise `intl.formatMessage({ id: "sidebar.blockedTooltip" })`

#### Scenario: Offline phase
- **WHEN** `healthTooltip` is called with a `ConnectionStatus` where `phase` is `"offline"`
- **THEN** it SHALL return `translateMessage(intl, status.lastError)` if non-empty, otherwise `intl.formatMessage({ id: "sidebar.offlineTooltip" })`

#### Scenario: No status provided
- **WHEN** `healthTooltip` is called with `status` being `null` or `undefined`
- **THEN** it SHALL return the `health` parameter as-is

