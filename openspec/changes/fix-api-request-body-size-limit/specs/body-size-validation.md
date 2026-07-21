# Body Size Validation Spec

## Constants

- `MAX_BODY_SIZE = 1_000_000` (1 MB) — defined in both `ipc-validation.ts` and `http-utils.ts`

## IPC Validator (`api:request` body validation)

When `a.body` is provided:

1. Reject if body is not an object and not an array → `"body must be an object or array if provided"`
2. Serialize with `JSON.stringify(body)`:
   - If serialization throws (circular reference) → `"body must be JSON-serializable"`
   - If serialized length > `MAX_BODY_SIZE` → `"body exceeds maximum size of ${MAX_BODY_SIZE} bytes when serialized"`
3. If `a.body` is `undefined`, skip validation (body is optional)

## Defense-in-Depth (`fetchAndUnwrap`)

Before passing `body` to `fetch()`:

1. Serialize body to `serializedBody`
2. If `serializedBody.length > MAX_BODY_SIZE`, return `{ ok: false, status: 0, error: string }` immediately
3. Use `serializedBody` in the `fetch()` call instead of inline `JSON.stringify(body)`
