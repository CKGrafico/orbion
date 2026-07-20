## Why

A compromised renderer can register an environment whose URL points to `http://169.254.169.254/...` (AWS/GCP/Azure cloud metadata endpoint), `http://localhost:*`, or any internal service. Once registered, `handleApiRequest` and `handleStreamSubscribe` forward credentialed requests to that URL, attaching the stored bearer token. While `isAllowedBaseUrl()` restricts to `http:`/`https:` protocols, and `isAllowedApiOperation()` limits API paths, the host check is absent, enabling SSRF attacks that can leak cloud credentials or probe internal services.

## What Changes

- Add `isAllowedHost()` function to `src/main/index.ts` that rejects cloud metadata IPs (`169.254.169.254`, `169.254.169.253`, `fd00:ec2::254`), the full link-local range (`169.254.0.0/16`), and loopback addresses (`127.0.0.0/8`, `::1`)
- Loopback exemption: requests routed through registered SSH tunnels legitimately resolve to `127.0.0.1:<port>` via `resolveEffectiveUrl()`. The host check must allow loopback only when the effective URL comes from a tunnel in the registry
- Integrate `isAllowedHost()` into `isAllowedBaseUrl()` (registration-time check, blocks metadata/link-local, blocks loopback for non-SSH endpoints) and `handleApiRequest()`/`handleStreamSubscribe()` (request-time check on the effective URL after tunnel resolution)
- Add i18n error key for blocked host
- Add corresponding IPC validation in `ipc-validation.ts` for `config:addEnvironment` and `config:addEndpoint` (block metadata/link-local hosts at registration time)
- Add Vitest unit tests for `isAllowedHost()` covering all blocked ranges, exemptions, and edge cases

## Capabilities

### New Capabilities
- `host-blocklist`: Validates that URLs used for API requests and environment registration do not point to cloud metadata endpoints, link-local addresses, or loopback (except via SSH tunnel)

### Modified Capabilities

## Impact

- `src/main/index.ts`: `isAllowedBaseUrl()` gains host validation; `handleApiRequest()` and `handleStreamSubscribe()` validate effective URLs post-tunnel-resolution
- `src/main/ipc-validation.ts`: `config:addEnvironment` and `config:addEndpoint` validators reject blocklisted hosts
- `src/main/tunnel-registry.ts`: exported helper to check if a loopback URL belongs to a registered tunnel (read-only, no behavioral change)
- `tests/host-blocklist.test.ts`: new test file for the host validation logic
