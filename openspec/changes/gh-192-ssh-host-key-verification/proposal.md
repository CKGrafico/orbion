# Change: SSH Host Key Verification Before First Connection

**Change ID:** gh-192-ssh-host-key-verification  
**Issue:** #192  
**Severity:** 8.4/10 (Medium-High, Security)

## Problem

Both `ssh-config.ts:181` and `ssh-tunnel.ts:78` set `StrictHostKeyChecking=accept-new`, which silently accepts any unknown host key on the first SSH connection without user confirmation. In Orbion, the user connects to arbitrary user-specified hosts via the VM wizard, and they never see the host key fingerprint before it is accepted. If an attacker can intercept the first connection (DNS poisoning, ARP spoofing, rogue WiFi), they gain a full MITM position on the SSH session, including access to pairing codes and session tokens.

Unlike automation tools that pair `accept-new` with pre-seeded `known_hosts` (Terraform, Ansible), Orbion has no pre-seeding mechanism and no out-of-band verification step.

## Proposed Fix

Replace the silent `accept-new` with an interactive host-key verification flow:

1. **New `ssh-keyscan` probe step** before the SSH connection: Run `ssh-keyscan` to fetch the host key fingerprint without connecting. This is safe because `ssh-keyscan` does not authenticate or open a session.

2. **New wizard step `"host-key-verify"`**: Show the host key fingerprint to the user in the VM wizard UI and ask them to confirm or reject it. This follows the same consent/resolve pattern already used for Node.js version consent and loop-task install consent.

3. **After confirmation**: Write the verified key to the user's `~/.ssh/known_hosts` file, so all subsequent SSH connections use standard `StrictHostKeyChecking=yes` (the SSH default) with a trusted key. If the host key ever changes, SSH will warn and refuse the connection, exactly as it should.

4. **Skip verification if host is already in `known_hosts`**: If the host already has a known key, proceed immediately without the verification step. This preserves the current UX for already-trusted hosts.

5. **Remove `StrictHostKeyChecking=accept-new`** from both `buildSshArgs()` and `openTunnel()`, replacing it with the default SSH behavior (which verifies against `known_hosts`).

## Security Properties

- First connection to any host now requires explicit user confirmation of the fingerprint
- Subsequent connections use standard `known_hosts` verification (SSH default)
- Key changes are detected and rejected by SSH itself
- `ssh-keyscan` is read-only and does not create an SSH session or authenticate
- The fingerprint is shown in the Orbion UI (not a terminal) so the user can verify it out-of-band

## Files Affected

- `src/main/ssh-config.ts` -- remove `accept-new`, add keyscan/known_hosts helpers
- `src/main/ssh-tunnel.ts` -- remove `accept-new`, use `yes` with pre-seeded known_hosts
- `src/main/ssh-probe.ts` -- add host key fingerprint fetching
- `src/main/vm-wizard.ts` -- add verification step and resolver
- `src/shared/ipc.ts` -- new step type, new progress fields
- `src/main/ipc-validation.ts` -- new IPC channel for host-key response
- `src/main/index.ts` -- new IPC handler
- `src/preload/index.ts` -- new bridge method
- `src/renderer/src/components/AddVmWizard.tsx` -- host-key verification UI
- `src/renderer/src/services/impl/VmWizardService.ts` -- new bridge method
- `src/renderer/src/services/interfaces.ts` -- new interface method
- `src/main/i18n.ts` (no changes, msg() already exists)

## Out of Scope

- Pre-sharingknown fingerprints out-of-band (long-term enhancement)
- Tailscale SSH (already has its own trust mechanism)
