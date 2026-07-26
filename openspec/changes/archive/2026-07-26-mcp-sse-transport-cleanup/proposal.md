# fix: MCP SSE transport not cleaned up on connection failure

## Problem

The SSE transport in `src/main/mcp-client.ts` is not properly cleaned up when the connection fails after `connectSseTransport` resolves. The reader loop catches errors and rejects pending requests but never sets `transport.closed = true`, leaving the transport in a partially failed state where new requests can be added to `pending` but never resolved.

## Root Cause

Two gaps in `connectSseTransport` and `sseRpcRequest`:

1. **Line 240-247** — SSE reader error handler rejects pending requests but does not set `transport.closed = true`. New requests can still be enqueued into `transport.pending` and will hang indefinitely.
2. **Line 117-126** — `sseRpcRequest` has no guard for `transport.closed`. Requests submitted after stream failure are silently lost.

## Fix

1. Set `transport.closed = true` in the SSE reader error handler before rejecting pending requests.
2. Add an early-return guard in `sseRpcRequest` that throws when `transport.closed` is true.

## Scope

- Single file: `src/main/mcp-client.ts`
- Two small, surgical edits
- No API or interface changes

## References

- Issue #344
