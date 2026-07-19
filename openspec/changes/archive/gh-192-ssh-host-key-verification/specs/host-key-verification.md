# Spec: SSH Host Key Verification Flow

## 1. Host Key Fingerprint Fetching

### `ssh-config.ts` additions

```ts
/** Known hosts file path (~/.ssh/known_hosts) */
export function knownHostsPath(): string

/** Check if a host already has an entry in ~/.ssh/known_hosts */
export function isHostInKnownHosts(hostName: string, port: number): boolean

/** Append a host key line to ~/.ssh/known_hosts (creates file if absent) */
export function appendToKnownHosts(keyLine: string): void

/** Run ssh-keyscan to fetch the host key for a host:port, return the raw keyscan output */
export async function fetchHostKey(hostName: string, port: number): Promise<string | null>
```

**`fetchHostKey` implementation:**
- Spawns `ssh-keyscan` with `-T 10` (timeout) and `-p <port>` for non-22 ports
- Returns the raw output (lines like `[host]:port ssh-ed25519 AAAA...`)
- Returns `null` if keyscan fails (host unreachable, etc.)

**`isHostInKnownHosts` implementation:**
- Reads `~/.ssh/known_hosts` 
- Checks if any line starts with `[hostName]:port` or `hostName` (for port 22)
- Uses `ssh-keygen -F` for reliable matching (handles hashed known_hosts)

**`appendToKnownHosts` implementation:**
- Appends the verified keyscan line to `~/.ssh/known_hosts`
- Ensures the `~/.ssh/` directory exists with mode 0700
- Sets known_hosts file mode 0644

### `ssh-config.ts` changes to `buildSshArgs`

Remove the line:
```ts
args.push("-o", "StrictHostKeyChecking=accept-new");
```

No replacement needed. SSH's default (`yes`) will verify against `known_hosts`. Since we pre-seed `known_hosts` after user confirmation, the connection will succeed.

## 2. Host Key Verification Step in VM Wizard

### IPC additions (`src/shared/ipc.ts`)

Add new step to `VmWizardStep`:
```ts
| "host-key-verify"
```

Add fields to `VmWizardProgress`:
```ts
/** Host key fingerprint for user verification (shown on host-key-verify step) */
hostKeyFingerprint?: string | null;
/** The raw known_hosts line to write on acceptance */
hostKeyLine?: string | null;
```

### Main process flow (`src/main/vm-wizard.ts`)

Before the existing "probing" step, insert a new step sequence:

1. **Check if host is in known_hosts**: Call `isHostInKnownHosts(host.hostName, host.port)`. If yes, skip to probing.
2. **Fetch host key**: Call `fetchHostKey(host.hostName, host.port)`. If null (host unreachable at keyscan level), proceed to probing; the subsequent SSH probe will surface the connectivity error naturally.
3. **Derive fingerprint**: Run `ssh-keygen -lf -` on the keyscan output to get the human-readable fingerprint (e.g., `SHA256:abc123...`). If keygen is unavailable, use a best-effort parse.
4. **Emit host-key-verify step**: Show the fingerprint to the user and wait for acceptance or rejection.

```ts
// New resolver for host key verification
let hostKeyResolver: ((accepted: boolean) => void) | null = null;

export function respondHostKey(accepted: boolean): void {
  if (hostKeyResolver) {
    hostKeyResolver(accepted);
    hostKeyResolver = null;
  }
}
```

5. **On acceptance**: Write the keyscan line to `known_hosts` via `appendToKnownHosts()`. Proceed to probing.
6. **On rejection**: Emit error step with appropriate i18n message. Abort wizard.

### IPC channel

New channel: `vmWizard:respondHostKey` accepting a boolean.

### Preload bridge addition

Add to `VmWizardBridge`:
```ts
respondHostKey: (accepted: boolean) => void;
```

## 3. ssh-tunnel.ts Changes

Remove from `openTunnel()`:
```ts
args.push("-o", "StrictHostKeyChecking=accept-new");
```

No replacement needed. By the time a tunnel is opened, the host key is already in `known_hosts` (it was verified during the wizard). If a tunnel is opened outside the wizard (connection supervisor reconnect), we rely on `known_hosts` being pre-seeded. If the key is missing, SSH will refuse the connection, which is the correct security behavior. The supervisor's error handling already covers this case.

## 4. Renderer UI (AddVmWizard.tsx)

Add a new consent-like panel for the `host-key-verify` step:

- Display the host name and fingerprint
- Show a security warning icon and explanation
- Two buttons: "Trust this host" (primary) and "Cancel" 
- Follow the same pattern as the existing consent panels

## 5. i18n Keys

New keys needed:
- `vmWizard.stepHostKeyVerify` -- step label
- `vmWizard.hostKeyFingerprint` -- "Fingerprint for {host}:"
- `vmWizard.hostKeyVerifyDescription` -- explanation text
- `vmWizard.trustHost` -- "Trust this host" button
- `vmWizard.hostKeyRejected` -- error when rejected

## 6. Test Plan

- Unit tests for `isHostInKnownHosts`, `appendToKnownHosts`, `fetchHostKey` in `tests/ssh-validation.test.ts`
- Unit tests for the flow: when host is in known_hosts, skip verification
- Integration-style test for the full wizard step sequence (mock keyscan/keygen)
