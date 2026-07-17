# Security Fix: Command Injection via Unvalidated Hash Parameter

## Summary

`readRemoteLog()` in `ssh-launch.ts` injected the `hash` parameter directly into a shell script template (`TAIL_LOG_SCRIPT`) using `.replace(/__HASH__/g, hash)` with **zero validation**. This script is then executed on the remote host via `sshExec`. A malicious or malformed hash containing shell metacharacters would be interpolated directly into a command executed on the user's VM — a classic **remote command injection** vulnerability.

## Risk Assessment

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Impact    | 10/10 | Remote code execution on user's VM |
| Likelihood | 9/10 | No validation barrier; any caller can pass arbitrary hash |
| Blast Radius | 9.5/10 | Full shell access on remote host, data destruction/exfiltration |

**Overall: 9.6/10 — Critical**

## Fix

1. Added `validateHash()` function that enforces `/^[a-f0-9]{1,12}$/` pattern (matches output of `hashForHost()`).
2. Applied validation in `readRemoteLog()` before template substitution (primary vulnerability).
3. Applied defensive validation in `launchOnVm()` (belt-and-suspenders: hash comes from `hashForHost` which always produces hex).
4. Exported `validateHash` for testability.
5. Added comprehensive tests covering injection vectors.

## Related

- Issue #36 addressed general SSH injection but missed this specific vector in `readRemoteLog()`.
- Issue #48 tracks this vulnerability.
