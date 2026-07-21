# Spec: Fix handleConfigError call in updateFn

## Change

File: `src/renderer/src/store.ts`

### Line 109

Before:
```ts
}).catch((err) => handleConfigError("updateEnvironment", err));
```

After:
```ts
}).catch((err) => handleConfigError(logService, "updateEnvironment", err));
```

### Line 111

Before:
```ts
[configService],
```

After:
```ts
[configService, logService],
```

## Verification

- `pnpm typecheck` passes
- All other `handleConfigError` calls already follow correct 3-arg pattern - no further changes needed
