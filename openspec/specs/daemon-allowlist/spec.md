# daemon-allowlist Specification

## Purpose
TBD - created by archiving change daemon-allowlist-encoded-slash. Update Purpose after archive.
## Requirements
### Requirement: Encoded-slash rejection at allowlist level
`isAllowedApiOperation` and `isAllowedStreamPath` SHALL reject any path containing a URL-encoded slash (`%2F` or `%2f`) in the path segment, regardless of whether an upstream validator has already checked for it.

#### Scenario: API operation with uppercase encoded slash
- **WHEN** `isAllowedApiOperation("GET", "/api/loops/abc%2Fdef")` is called
- **THEN** the function SHALL return `false`

#### Scenario: API operation with lowercase encoded slash
- **WHEN** `isAllowedApiOperation("GET", "/api/loops/abc%2fsecret")` is called
- **THEN** the function SHALL return `false`

#### Scenario: Stream path with encoded slash
- **WHEN** `isAllowedStreamPath("/api/loops/abc%2Fdef/logs/stream")` is called
- **THEN** the function SHALL return `false`

#### Scenario: Legitimate path without encoded slash still passes
- **WHEN** `isAllowedApiOperation("GET", "/api/loops/abc-123")` is called
- **THEN** the function SHALL return `true`

