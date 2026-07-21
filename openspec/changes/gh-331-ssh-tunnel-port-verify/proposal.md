# SSH Tunnel Port Verification on Timeout

## Problem

In `src/main/ssh-tunnel.ts`, `openTunnel()` resolves `{ forwarded: true }` after a 15-second connect timeout **even when no forwarding confirmation was received from SSH**. Only specific stderr patterns (auth failure, forwarding failure) cause short-circuit rejection. A slow, hung, or partially-failed connection silently appears healthy.

**Impact:**
- Security: app routes daemon API traffic through a local port that may not actually be forwarding
- UX: VM wizard shows "connected" but loops/daemons remain unreachable
- Reliability: `tunnelExitCallback` never triggered for ghost tunnel

## Solution

Before the timeout handler resolves as `forwarded: true`, verify the local port is actually listening via a TCP connect check to `127.0.0.1:localPort`. If unreachable within a 2-second window, resolve as failed.

## Scope

- `src/main/ssh-tunnel.ts`: add `checkLocalPort()` helper, integrate into timeout handler
- `src/main/i18n.ts`: add `vmWizard.mainTunnelPortVerifyFailed` i18n key (if needed; reuse existing `vmWizard.mainTunnelForwardingFailed`)
- `tests/ssh-tunnel-port-verify.test.ts`: pure-logic tests for port verification

## References

- GitHub Issue #331
