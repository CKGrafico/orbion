## Why

Three npm packages in `verified-install.ts` use `version: "latest"` instead of pinned versions, contradicting the file's own security mandate: _"Every `npm install -g` executed on remote VMs MUST pin an exact version."_ This exposes every VM Orbion connects to supply-chain attacks — an attacker who compromises the npm registry or typosquats a package can execute arbitrary code on all remote VMs.

## What Changes

- Pin `opencode`, `@atlassian/acli`, and `@gitlab-org/cli` to specific version strings instead of `"latest"`.
- Add runtime guard: if any entry in `NPM_PACKAGES` has `version: "latest"`, throw at import time instead of silently producing an insecure `npm install -g pkg@latest` command.
- Add a unit test asserting no entry in `NPM_PACKAGES` uses `version: "latest"`.
- Update JSDoc comments to reflect the actual status of each package.

## Capabilities

### New Capabilities
- `pinned-npm-guard`: Runtime assertion and unit-test guard that no `NPM_PACKAGES` entry uses `version: "latest"`, preventing future regressions.

### Modified Capabilities
<!-- No existing specs are modified — this is a security hardening of existing behavior, not a spec-level requirement change. -->

## Impact

- **Code**: `src/main/verified-install.ts` (version pinning + guard), new test file.
- **Dependencies**: None — no new packages required.
- **Security**: Eliminates supply-chain attack vector on remote VM infrastructure.
- **Breaking**: None — the guard throws at startup if `version: "latest"` is present, which is a fail-safe; legitimate pinned configs are unaffected.
