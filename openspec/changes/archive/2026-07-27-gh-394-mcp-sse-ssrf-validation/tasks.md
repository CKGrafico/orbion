# Tasks: gh-394-mcp-sse-ssrf-validation

## Task 1: Add SSRF validation to connectSseTransport postEndpoint
- **touches:** src/main/mcp-client.ts
- **tier:** fast
- **depends_on:** none

In `connectSseTransport()`, after constructing the `path` value from the `endpoint` event (lines 210-214):
1. Import `isUrlAllowedForFetch` from `./ssrf-allowlist.js`.
2. Parse the constructed `path` as a `URL`.
3. Call `isUrlAllowedForFetch(url, { allowLoopback: true })`.
4. If it returns `false`, abort the transport controller, reject the promise with an SSRF error, and do NOT store `transport.postEndpoint`.
5. If it returns `true`, store `transport.postEndpoint = path` as before.

## Task 2: Add tests for MCP SSE SSRF validation
- **touches:** tests/mcp-client.test.ts
- **tier:** fast
- **depends_on:** Task 1

Add test cases covering:
- `endpoint` event with `http://169.254.169.254/latest` → connection rejected
- `endpoint` event with `http://metadata.google.internal/computeMetadata/v1/` → connection rejected
- `endpoint` event with `http://[fe80::1]/path` → connection rejected
- `endpoint` event with relative path `/messages` → accepted
- `endpoint` event with `http://localhost:8846/messages` → accepted (loopback allowed)
- `endpoint` event with `http://example.com/messages` → accepted
