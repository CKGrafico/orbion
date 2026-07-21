# Spec: Timing-safe HMAC comparison

## Change

In `src/main/credential-vault.ts`, the `getCredential()` function at line 90:

```ts
// BEFORE
if (expected !== record.hmac) {
```

Replaced with:

```ts
// AFTER
const expectedBuf = Buffer.from(expected, "utf8");
const actualBuf = Buffer.from(record.hmac, "utf8");
if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
```

Import added: `timingSafeEqual` from `node:crypto` (already imports `crypto` default).

## Invariants

- HMAC output is always base64-encoded SHA-256, deterministic length per key
- Length check is safe to leak (algorithm property, not secret)
- All existing behavior preserved: tamper detection, migration, error throwing
