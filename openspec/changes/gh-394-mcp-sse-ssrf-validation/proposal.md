# Proposal: MCP SSE transport postEndpoint SSRF validation

**Change ID:** gh-394-mcp-sse-ssrf-validation
**Issue:** #394
**Scope:** focused (1 file fix + 1 test file)

## Problem

`connectSseTransport` in `src/main/mcp-client.ts:210-214` reads the `endpoint` event from the remote MCP server and constructs a POST URL with no SSRF validation:

```typescript
if (pendingEventType === "endpoint" && !transport.postEndpoint) {
  const path = event.text.startsWith("http")
    ? event.text
    : `${baseUrl}${event.text.startsWith("/") ? "" : "/"}${event.text}`;
  transport.postEndpoint = path;
}
```

If the MCP server is compromised or malicious, it can send `event.text = "http://169.254.169.540/latest/meta-data/..."` and the client will POST JSON-RPC requests (including the `initialize` handshake with client info) to the attacker-controlled host. The `postEndpoint` is never checked against the SSRF allowlist (`ssrf-allowlist.ts`).

This is exploitable because:
1. The MCP server URL is derived from user-configured environment endpoints.
2. A man-in-the-middle or compromised daemon can inject arbitrary `endpoint` events.
3. All subsequent `sseRpcRequest` calls POST to this unvalidated URL.

## Solution

Validate `transport.postEndpoint` against `isUrlAllowedForFetch()` (from `ssrf-allowlist.ts`) before storing it. Use `{ allowLoopback: true }` since MCP connections go through SSH tunnels to localhost. If validation fails, reject the SSE connection by aborting and rejecting the promise.

Two cases need validation:
- **Absolute URL** (`event.text` starts with `http`): validate the parsed URL directly.
- **Relative path** (combined with `baseUrl`): validate the constructed URL.

## Affected Files

- `src/main/mcp-client.ts` — `connectSseTransport()` function
- `tests/mcp-client.test.ts` — add SSRF rejection tests for postEndpoint

## Acceptance Criteria

- SSE `endpoint` event with `http://169.254.169.254/...` → connection rejected
- SSE `endpoint` event with `http://metadata.google.internal/...` → connection rejected
- SSE `endpoint` event with `http://[fe80::1]/...` → connection rejected
- SSE `endpoint` event with relative path (e.g., `/messages`) → accepted (same-host, already validated by baseUrl check)
- SSE `endpoint` event with `http://localhost:...` → accepted (allowLoopback: true)
- SSE `endpoint` event with `http://example.com/...` → accepted
