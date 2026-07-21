# GH-319: HMAC integrity check uses non-constant-time comparison

## Summary

Replace the plain `!==` string comparison in `getCredential()` with `crypto.timingSafeEqual()` to eliminate a timing side-channel that could allow HMAC recovery and credential tampering.

## Problem

`src/main/credential-vault.ts:90` uses `expected !== record.hmac` for HMAC verification. String `!==` is not constant-time; JavaScript engines perform lexicographic comparison with early exit on the first differing byte. An attacker measuring comparison timing (co-located process, network latency analysis) can recover the HMAC byte-by-byte in ~2^16 requests, bypassing the integrity check and tampering with stored secrets (session tokens, SSH key passphrases, OpenCode passwords).

## Fix

Replace `!==` with `crypto.timingSafeEqual()`, converting both strings to `Buffer` first. Length check before comparison is safe because HMAC output length is a deterministic property of the algorithm, not the secret.

## Scope

- `src/main/credential-vault.ts`: one-line change in `getCredential()`, add `timingSafeEqual` import
- `tests/credential-vault.test.ts`: add constant-time comparison verification test

## Risk

Low. The fix is a drop-in replacement with identical semantics. HMAC output is always deterministic length. Existing tests cover correct HMAC validation, tamper detection, and migration.
