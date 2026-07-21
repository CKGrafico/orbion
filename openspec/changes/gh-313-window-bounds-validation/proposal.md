# gh-313-window-bounds-validation

## Summary

Validate `x`/`y` coordinates and `width`/`height` size bounds in `loadBounds()` to prevent off-screen window positioning from corrupted or tampered `window-bounds.json`.

## Problem

`loadBounds()` only checks that `width` and `height` are numbers. It does not validate `x`/`y` coordinates, allowing:
- Off-screen window (unrecoverable UX failure)
- Tampered file DOS
- Corrupted values from crash during `saveBounds()`

## Fix

1. Add positive + upper-bound clamps for `width`/`height` (max 7680x4320 = 8K).
2. Clamp out-of-range `x`/`y` to `undefined` so Electron picks a default position.
3. Reject `null`/non-number `x`/`y` values.
4. Extract validation into a pure `validateBounds()` function for testability.
5. Add Vitest tests covering edge cases.

## Scope

- `src/main/index.ts` — `loadBounds()` and new `validateBounds()`
- `tests/window-bounds.test.ts` — new test file

## References

- Issue #313
