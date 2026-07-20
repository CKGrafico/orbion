## ADDED Requirements

### Requirement: Cloud metadata IPs SHALL be rejected
The system SHALL reject any URL whose host resolves to a cloud metadata IP address: `169.254.169.254` (AWS/Azure), `169.254.169.253` (GCP), or `fd00:ec2::254` (AWS IPv6). This applies at both environment registration and API request time.

#### Scenario: AWS metadata endpoint rejected at registration
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://169.254.169.254/api/projects`
- **THEN** the main process SHALL reject the request with an i18n error indicating the host is blocked

#### Scenario: GCP metadata endpoint rejected at registration
- **WHEN** a renderer sends `config:addEndpoint` with URL `http://169.254.169.253/api/projects`
- **THEN** the main process SHALL reject the request with an i18n error indicating the host is blocked

#### Scenario: AWS metadata endpoint rejected at request time
- **WHEN** a renderer sends `api:request` with `baseUrl` `http://169.254.169.254` and `path` `/api/projects`
- **THEN** the main process SHALL return `{ ok: false, status: 0, error: <i18n message> }`

### Requirement: Link-local range SHALL be rejected
The system SHALL reject any URL whose host is an IP in the `169.254.0.0/16` range (link-local). This covers the entire cloud metadata space, not just the well-known endpoints.

#### Scenario: Arbitrary link-local IP rejected
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://169.254.100.50:8845`
- **THEN** the main process SHALL reject the request with an i18n error indicating the host is blocked

### Requirement: Loopback SHALL be rejected for non-tunneled requests
The system SHALL reject `api:request` and `stream:subscribe` calls whose effective URL resolves to a loopback address (`127.0.0.0/8`, `::1`, `localhost`) UNLESS the loopback URL corresponds to a port with an active SSH tunnel in the registry.

#### Scenario: Loopback rejected for non-SSH environment
- **WHEN** a renderer sends `api:request` with `baseUrl` `http://localhost:8845` for a non-SSH environment
- **THEN** the main process SHALL return `{ ok: false, status: 0, error: <i18n message> }`

#### Scenario: Loopback allowed for SSH tunnel
- **WHEN** an SSH tunnel is active on port 19001 and the effective URL resolves to `http://127.0.0.1:19001`
- **THEN** the main process SHALL allow the request

#### Scenario: Loopback rejected for wrong port
- **WHEN** an SSH tunnel is active on port 19001 but the effective URL is `http://127.0.0.1:22`
- **THEN** the main process SHALL reject the request

### Requirement: Loopback SHALL be allowed at environment registration
The system SHALL allow `config:addEnvironment` and `config:addEndpoint` with loopback URLs. The user is explicitly choosing to connect to localhost.

#### Scenario: Localhost registration allowed
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://localhost:8845` and kind `direct`
- **THEN** the main process SHALL allow the registration

### Requirement: Host validation SHALL be applied at IPC boundary
The IPC validation layer (`ipc-validation.ts`) SHALL reject `config:addEnvironment` and `config:addEndpoint` calls whose URL host is a cloud metadata IP or link-local IP. This provides defense-in-depth at the trust boundary.

#### Scenario: IPC validation blocks metadata host
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://169.254.169.254/api/projects`
- **THEN** `validateIpc` SHALL throw `IpcValidationError` with the appropriate issue message

### Requirement: Host validation SHALL produce i18n errors
All host rejection messages SHALL use the i18n key `vmWizard.mainHostBlocked` with a `{ host }` parameter, following the existing pattern for URL validation errors.

#### Scenario: Error message is i18n-formatted
- **WHEN** `isAllowedHost` rejects a URL
- **THEN** the error SHALL be `msg("vmWizard.mainHostBlocked", { host: "<rejected-host>" })`
