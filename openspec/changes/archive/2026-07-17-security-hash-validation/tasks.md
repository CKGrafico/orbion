# Tasks

- [x] Add `validateHash()` function enforcing `/^[a-f0-9]{1,12}$/` pattern
- [x] Apply validation in `readRemoteLog()` before template substitution
- [x] Apply defensive validation in `launchOnVm()` 
- [x] Export `validateHash` for testability
- [x] Add comprehensive tests covering injection vectors ($(), backticks, semicolons, pipes, path traversal, flag injection, etc.)
- [x] Verify all existing and new tests pass
- [x] Verify TypeScript compiles cleanly
