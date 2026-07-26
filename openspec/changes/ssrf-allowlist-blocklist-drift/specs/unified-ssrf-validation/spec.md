# unified-ssrf-validation Delta

## Modified Requirements

### Requirement: SSRF host validation SHALL use a single canonical module (MODIFIED)

The system SHALL implement all SSRF host-validation logic in `src/main/ssrf-allowlist.ts`. `src/main/ssrf-blocklist.ts` SHALL NOT exist. Both `ipc-validation.ts` and `index.ts` SHALL import and call the canonical function from `ssrf-allowlist.ts` only.

#### Scenario: ipc-validation imports from canonical module
- **WHEN** `validateIpc` processes a `config:addEnvironment` or `config:addEndpoint` call with a URL containing a blocked host
- **THEN** the validation SHALL call `isAllowedBaseUrl` imported from `ssrf-allowlist.js` and reject the request when it returns `false`

### Requirement: Cloud-provider DNS metadata hostnames SHALL be blocked (MODIFIED)

The system SHALL reject `metadata.google.internal`, `metadata.google.internal.`, `metadata.azure.internal`, and `metadata.azure.internal.`.

#### Scenario: Azure metadata DNS hostname blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://metadata.azure.internal/metadata/instance`
- **THEN** it SHALL return `false`

#### Scenario: Azure metadata trailing-dot form blocked
- **WHEN** `isUrlAllowedForFetch` is called with `http://metadata.azure.internal./metadata/instance`
- **THEN** it SHALL return `false`
