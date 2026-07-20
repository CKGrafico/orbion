## 1. Core Sync Infrastructure

- [ ] 1.1 Add `scheduleConfigSyncToMainVm()` function with 2s debounce timer in `config-store.ts`, called from `bumpStamp()`, which skips sync when no main-VM is designated <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 1.2 Add `syncConfigToMainVm()` function that builds the sanitized JSON payload (environments + configStamp) and dispatches to SSH or local write based on endpoint kind <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 1.3 Extend `sshOnMainVm()` to support write commands with stdin pipe — add `sshOnMainVmWrite(command, stdinPayload)` that runs SSH with the JSON piped via stdin using `mkdir -p ~/.orbion && cat > ~/.orbion/config.json && chmod 600 ~/.orbion/config.json` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 1.4 Add local filesystem write path for direct endpoints using `fs.mkdirSync`, `fs.writeFileSync`, and `fs.chmodSync` with `0o600`, resolving `~` via `os.homedir()` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/config-store.ts] -->

## 2. Integration and Wiring

- [ ] 2.1 Hook `scheduleConfigSyncToMainVm()` into `bumpStamp()` so every config mutation triggers a debounced sync <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/config-store.ts] -->
- [ ] 2.2 Add `import` for `os` and `fs` modules at the top of `config-store.ts` (conditional: only needed if not already imported) <!-- agent: frontend-engineer.fast, depends_on: [1.4], touches: [src/main/config-store.ts] -->

## 3. Verification

- [ ] 3.1 Run `pnpm typecheck` and fix any type errors introduced by the new code <!-- agent: frontend-engineer.fast, depends_on: [2.1, 2.2], touches: [] -->
