# host-blocklist Delta

## Modified Requirements

### Requirement: Cloud metadata IPs SHALL be rejected (MODIFIED)

The cloud-provider DNS metadata hostname list SHALL include Azure IMDS hostnames: `metadata.azure.internal` and `metadata.azure.internal.`.

#### Scenario: Azure metadata DNS hostname rejected
- **WHEN** a renderer sends `api:request` with `baseUrl` `http://metadata.azure.internal`
- **THEN** the main process SHALL return `{ ok: false, status: 0, error: <i18n message> }`

#### Scenario: Azure metadata DNS hostname rejected at registration
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://metadata.azure.internal/metadata/instance`
- **THEN** `validateIpc` SHALL throw `IpcValidationError`
