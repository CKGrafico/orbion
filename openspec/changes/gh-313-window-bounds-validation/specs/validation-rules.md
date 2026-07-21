# Specification: Window Bounds Validation

## Interface

```ts
interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}
```

Unchanged. The fix works within the existing type.

## Validation rules

| Field | Type check | Range | On failure |
|-------|-----------|-------|------------|
| `width` | `typeof === "number"` | `> 0 && <= 7680` | Return defaults |
| `height` | `typeof === "number"` | `> 0 && <= 4320` | Return defaults |
| `x` | `typeof === "number"` or `undefined` | `>= -1000 && <= 10000` | Set to `undefined` |
| `y` | `typeof === "number"` or `undefined` | `>= -1000 && <= 10000` | Set to `undefined` |
| `maximized` | Passthrough (boolean or absent) | N/A | Passthrough |

When `width`/`height` fail validation, the entire bounds object is rejected and defaults `{ width: 1440, height: 900 }` are returned (existing behavior preserved).

When `x`/`y` fail, they are set to `undefined` and the rest of the bounds are preserved. This lets Electron reposition the window automatically.

## Extracted function

```ts
function validateBounds(parsed: unknown): WindowBounds | null
```

Pure function. Returns validated `WindowBounds` or `null` (caller falls back to defaults). Extracted from `loadBounds()` for testability without filesystem/Electron mocks.
