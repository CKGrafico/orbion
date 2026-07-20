## 1. Host validation core

- [x] 1.1 Add `isAllowedHost()` function to `src/main/index.ts` that rejects cloud metadata IPs (169.254.169.254, 169.254.169.253, fd00:ec2::254), link-local range (169.254.0.0/16), and loopback (127.0.0.0/8, ::1, localhost) unless `allowLoopback` is true <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/index.ts] -->
- [x] 1.2 Add `isTunnelLocalPort()` export to `src/main/tunnel-registry.ts` that checks if a port number corresponds to an active tunnel registry entry <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/tunnel-registry.ts] -->
- [x] 1.3 Integrate `isAllowedHost()` into `isAllowedBaseUrl()` in `src/main/index.ts`: reject metadata/link-local, allow loopback at registration time (the user is choosing to connect there) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 1.4 Add request-time host validation in `handleApiRequest()` and `handleStreamSubscribe()`: after resolving the effective URL, reject loopback unless the port matches a tunnel registry entry <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2, 1.3], touches: [src/main/index.ts] -->

## 2. IPC boundary hardening

- [x] 2.1 Add `isBlocklistedHost()` helper to `src/main/ipc-validation.ts` that checks a URL string for metadata/link-local hosts, and integrate it into `config:addEnvironment` and `config:addEndpoint` validators <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->

## 3. User-facing error messages

- [x] 3.1 Add i18n key `vmWizard.mainHostBlocked` with `{ host }` parameter to the renderer-side i18n locale files <!-- agent: frontend-engineer.fast, depends_on: [1.3], touches: [src/renderer/src/i18n/**] -->

## 4. Tests

- [x] 4.1 Add `tests/host-blocklist.test.ts` with unit tests for `isAllowedHost()`: cloud metadata IPs rejected, link-local rejected, loopback allowed with flag, loopback rejected without flag, public IPs allowed, hostname passthrough <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/host-blocklist.test.ts] -->
- [x] 4.2 Add IPC validation tests for blocklisted host rejection in `tests/ipc-validation.test.ts` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [tests/ipc-validation.test.ts] -->

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [1.4, 2.1, 3.1, 4.1, 4.2], touches: [] -->
