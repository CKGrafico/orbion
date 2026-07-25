# unified-ssrf-validation Specification

## Purpose
TBD - created by archiving change unify-ssrf-blocklist. Update Purpose after archive.
## Requirements
### Requirement: SSRF host validation SHALL use a single canonical module
The system SHALL implement all SSRF host-validation logic in `src/main/ssrf-allowlist.ts`. No other module SHALL duplicate host-blocking patterns. Both `ipc-validation.ts` and `index.ts` SHALL import and call the canonical function.

#### Scenario: ipc-validation uses canonical module
- **WHEN** `validateIpc` processes a `config:addEnvironment` or `config:addEndpoint` call with a URL containing a blocked host
- **THEN** the validation SHALL call `isUrlAllowedForFetch` from `ssrf-allowlist.ts` and reject the request when it returns `false`

#### Scenario: api-utils uses canonical module
- **WHEN** an API request or stream subscription is processed with a blocked host
- **THEN** the main process SHALL call `isUrlAllowedForFetch` from `ssrf-allowlist.ts` and reject the request when it returns `false`

### Requirement: isUrlAllowedForFetch SHALL use allowlist polarity
`isUrlAllowedForFetch` SHALL return `true` for allowed hosts and `false` for blocked hosts. All callers SHALL treat `false` as "block the request".

#### Scenario: Public host allowed
- **WHEN** `isUrlAllowedForFetch` is called with `http://example.com/api`
- **THEN** it SHALL return `true`

#### Scenario: Metadata IP blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://169.254.169.254/api`
- **THEN** it SHALL return `false`

### Requirement: IPv6 link-local addresses SHALL be blocked
The system SHALL reject any URL whose host is an IPv6 link-local address in the `fe80::/10` range.

#### Scenario: fe80::1 blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://[fe80::1]/api`
- **THEN** it SHALL return `false`

#### Scenario: fe80 address with loopback override still blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://[fe80::1]/api` and `allowLoopback: true`
- **THEN** it SHALL return `false`

### Requirement: Cloud-provider DNS metadata hostnames SHALL be blocked
The system SHALL reject `metadata.google.internal` and its trailing-dot form `metadata.google.internal.`.

#### Scenario: GCP metadata DNS hostname blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://metadata.google.internal/computeMetadata/v1/`
- **THEN** it SHALL return `false`

#### Scenario: GCP metadata trailing-dot form blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://metadata.google.internal./computeMetadata/v1/`
- **THEN** it SHALL return `false`

### Requirement: Both call paths SHALL produce identical results
For any given URL, the IPC validation path and the API request path SHALL produce the same allow/deny decision (modulo the `allowLoopback` option difference).

#### Scenario: Consistent blocking of metadata IPs across paths
- **WHEN** `isUrlAllowedForFetch` is called for `http://169.254.169.254/api` from both `ipc-validation.ts` (with `allowLoopback: true`) and `index.ts` (with `allowLoopback: false`)
- **THEN** both calls SHALL return `false`

