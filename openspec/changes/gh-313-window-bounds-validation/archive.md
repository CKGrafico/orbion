# Archive: gh-313-window-bounds-validation

## Completed: 2026-07-21

### Summary

Added coordinate and size validation to `loadBounds()` to prevent off-screen window positioning from corrupted or tampered `window-bounds.json`.

### Changes

- **New file**: `src/main/window-bounds.ts` — exported `validateBounds()` pure function and `WindowBounds` type
- **Modified**: `src/main/index.ts` — `loadBounds()` now uses `validateBounds()` instead of inline width/height check; imports from `window-bounds.js`
- **New file**: `tests/window-bounds.test.ts` — 28 tests covering valid bounds, off-screen coordinates, out-of-range sizes, null/non-number fields, corrupted JSON

### Validation rules

| Field | Check | On failure |
|-------|-------|------------|
| width | number, > 0, <= 7680 | Return defaults |
| height | number, > 0, <= 4320 | Return defaults |
| x | number (or omitted), >= -1000, <= 10000 | Set to undefined |
| y | number (or omitted), >= -1000, <= 10000 | Set to undefined |
| maximized | boolean | Passthrough; omitted if not boolean |

### Verification

- 28/28 tests pass
- `pnpm typecheck` clean
- No push or gh actions performed (as instructed)
