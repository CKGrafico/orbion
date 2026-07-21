# fix-api-request-body-size-limit

## Summary

Add body payload size validation to the `api:request` IPC trust boundary to prevent OOM attacks from a compromised renderer process.

## Problem

The IPC validation layer for `api:request` validates `baseUrl`, `path`, `method`, and `timeoutMs` but does not validate `args.body`. A compromised renderer can pass an arbitrarily large object through `args.body`, which is serialized via `JSON.stringify(body)` in `fetchAndUnwrap` and held in main-process memory, causing an OOM crash or system-level memory pressure.

This is a trust-boundary gap because the renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`), and the IPC validation layer is explicitly designed as the runtime trust boundary between the sandboxed renderer and the privileged main process.

## Fix

1. Add `MAX_BODY_SIZE` constant (1 MB) to `ipc-validation.ts` and validate `a.body` in the `api:request` validator: reject non-object/non-array bodies, reject bodies exceeding 1 MB when serialized, and reject non-JSON-serializable bodies (circular references).
2. Add defense-in-depth guard in `fetchAndUnwrap()` (`http-utils.ts`): check serialized body length against `MAX_BODY_SIZE` before passing to `fetch()`.

## Files Changed

- `src/main/ipc-validation.ts` — body validation in `api:request` validator
- `src/main/http-utils.ts` — defense-in-depth size check
- `tests/ipc-validation.test.ts` — test coverage for body validation

## Severity

High — missing validation on the primary trust boundary between sandboxed renderer and privileged main process.
