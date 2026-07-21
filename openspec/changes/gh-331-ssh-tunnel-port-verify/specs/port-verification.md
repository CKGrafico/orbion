# Port Verification Spec

## checkLocalPort(localPort, timeoutMs)

Asynchronous TCP connect check to `127.0.0.1:localPort`.

- Returns `Promise<boolean>`: `true` if connection established within timeout, `false` otherwise
- Uses `net.createConnection()` with a timeout
- Cleans up socket on both success and failure paths
- Exported for testability

## Integration into openTunnel timeout handler

In the 15-second timeout handler (line ~98-110):

1. Before resolving as `forwarded: true`, call `await checkLocalPort(localPort, 2000)`
2. If `false`:
   - Kill the SSH process
   - Resolve `{ forwarded: false, localPort: null, errorDetail: msg("vmWizard.mainTunnelForwardingFailed", { detail: "Port verification failed" }) }`
3. If `true`: proceed with existing `forwarded: true` resolution

## Invariant

After `openTunnel` resolves with `forwarded: true`, the local port is guaranteed to be accepting TCP connections.
