# Tasks

- [x] 1.1 Add Azure metadata DNS hostnames to `CLOUD_METADATA_DNS_HOSTS` in `ssrf-allowlist.ts`; add `isHostAllowed` and `isAllowedBaseUrl` exports moved from blocklist <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssrf-allowlist.ts] -->
- [x] 1.2 Update `ipc-validation.ts` import from `ssrf-blocklist.js` to `ssrf-allowlist.js` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [x] 1.3 Delete `src/main/ssrf-blocklist.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/main/ssrf-blocklist.ts] -->
- [x] 2.1 Add Azure metadata DNS test cases to `tests/host-blocklist.test.ts`; add Azure hosts to cross-path consistency tests <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/host-blocklist.test.ts] -->
- [x] 3.1 Run `rtk pnpm typecheck`, `rtk pnpm test`, and `rtk pnpm build` <!-- agent: frontend-engineer.fast, depends_on: [1.3, 2.1], touches: [] -->
