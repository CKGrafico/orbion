## 1. Shell-safe validation in verified-install.ts

- [x] 1.1 Add `validateNpmIdentifier()` function with allowlist regexes for `pkg` and `version` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/verified-install.ts] -->
- [x] 1.2 Call `validateNpmIdentifier()` from `validateNpmPackages()` at module-load time <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/verified-install.ts] -->
- [x] 1.3 Call `validateNpmIdentifier()` from `pinnedNpmInstall()` before building the command string <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/verified-install.ts] -->

## 2. Quote shell variables in ssh-launch.ts

- [x] 2.1 Double-quote `${binary}` in all apt-get, brew, snap, and pip3 command templates within `generateInstallBlock()` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-launch.ts] -->

## 3. Quote check_tool arguments in ssh-probe.ts

- [x] 3.1 Quote `${t.id}` and `${t.binary}` in the `check_tool` call lines of `TOOLS_PROBE_SCRIPT` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-probe.ts] -->

## 4. Unit tests

- [x] 4.1 Add unit tests for `validateNpmIdentifier()` — valid entries, shell injection payloads, "latest" rejection <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/verified-install.test.ts] -->
- [x] 4.2 Add unit test asserting all `NPM_PACKAGES` entries pass allowlist validation <!-- agent: frontend-engineer.fast, depends_on: [1.2, 4.1], touches: [src/main/verified-install.test.ts] -->

## 5. Verification

- [x] 5.1 Run TypeScript compilation and existing tests to verify no regressions <!-- agent: frontend-engineer.fast, depends_on: [1.3, 2.1, 3.1, 4.1], touches: [] -->
