## MODIFIED Requirements

### Requirement: Cloud metadata IPs SHALL be rejected (MODIFIED)
The system SHALL reject any URL whose host resolves to a cloud metadata IP address: `169.254.169.254` (AWS/Azure), `169.254.169.253` (GCP), or `fd00:ec2::254` (AWS IPv6). Additionally, IPv6 link-local addresses in `fe80::/10` and cloud-provider DNS metadata hostnames (`metadata.google.internal`) SHALL be rejected. This applies at both environment registration and API request time.

#### Scenario: IPv6 link-local fe80::1 rejected at registration
- **WHEN** a renderer sends `config:addEnvironment` with URL `http://[fe80::1]/api`
- **THEN** the main process SHALL reject the request with a host-blocked error

#### Scenario: GCP metadata DNS hostname rejected
- **WHEN** a renderer sends `api:request` with `baseUrl` `http://metadata.google.internal`
- **THEN** the main process SHALL return `{ ok: false, status: 0, error: <i18n message> }`
