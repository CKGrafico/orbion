## Context

`verified-install.ts` centralises pinned checksums and versions for all remote software Orbion installs via SSH. It already has a download-verify-execute flow for shell scripts (SHA-256 checksums) and a `pinnedNpmInstall()` function that produces `npm install -g <pkg>@<version>`. However, three of five `NPM_PACKAGES` entries use `version: "latest"`, which makes `pinnedNpmInstall()` emit `npm install -g pkg@latest` — defeating the entire security model.

The three unpinned packages (`opencode`, `@atlassian/acli`, `@gitlab-org/cli`) are not currently on the public npm registry (the code comments note this). They are optional tools installed conditionally based on user selection in the Add VM wizard.

## Goals / Non-Goals

**Goals:**
- Pin every `NPM_PACKAGES` entry to a specific version — no `"latest"`.
- Add a runtime guard that throws if any entry uses `"latest"`, preventing future regressions.
- Add a unit test that asserts no entry has `version: "latest"`.
- Keep the change minimal and focused — no new dependencies, no architectural shifts.

**Non-Goals:**
- Adding SHA-256 integrity hashes for npm packages (mentioned in the issue as a future consideration but out of scope for this change).
- Changing how optional tools are selected or installed in the UI.
- Migrating to a different package manager or install mechanism.

## Decisions

### D1: Pin unavailable packages to `"0.0.0"` with a descriptive comment

**Rationale**: The three packages don't exist on public npm yet. Using `"0.0.0"` makes it clear the version is a placeholder, and the runtime guard will still catch `"latest"` regressions. When upstream publishes, developers update the version following the existing JSDoc instructions.

**Alternative considered**: Remove the entries entirely. Rejected — `TOOL_DEFINITIONS` and `ssh-launch.ts` reference these keys; removing them causes compile errors and breaks the optional tool flow.

### D2: Runtime guard at module level

Add a `validateNpmPackages()` function that iterates `NPM_PACKAGES` and throws if any `version` is `"latest"`. Call it immediately after the `NPM_PACKAGES` declaration so the app fails fast at startup rather than silently sending insecure commands to remote VMs.

**Alternative considered**: Build-time only (CI test, no runtime guard). Rejected — the runtime guard catches the issue even in local dev before any VM is contacted.

### D3: Unit test in Vitest

A simple test that imports `NPM_PACKAGES` and asserts no entry has `version: "latest"`. This serves as the CI gate the issue requests.

## Risks / Trade-offs

- **[Risk]** `version: "0.0.0"` for unavailable packages will cause `npm install -g pkg@0.0.0` to fail if the tool is selected. → **Mitigation**: These packages were already broken (`@latest` on a non-existent package also fails). The fail-safe runtime guard + placeholder version is strictly better — it fails explicitly rather than silently fetching arbitrary code.
- **[Risk]** Developers might forget to update `0.0.0` when packages become available. → **Mitigation**: The JSDoc upgrade instructions already exist; we'll add a clearer comment. The unit test only gates `"latest"`, not `"0.0.0"`.
