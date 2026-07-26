# Spec: isAllowedPath %2F rejection

## Function: isAllowedPath (src/main/ipc-validation.ts)

### Current behavior

Lines 69–71 reject `%2e` and `%25` patterns:
```ts
if (/%2e/i.test(v)) return false;
if (/%25/i.test(v)) return false;
```

### New behavior

Add after line 71:
```ts
if (/%2f/i.test(v)) return false;
```

This rejects both `%2F` (uppercase) and `%2f` (lowercase) URL-encoded slashes.

### Rationale

- `%2F` decodes to `/`, creating extra path segments after daemon URL-decodes
- Allowlist regexes use `[^/]+` to constrain segment counts — `%2F` bypasses this
- Consistent with existing `%2e` (encoded dot) and `%25` (double-encoding) checks

## Tests

### tests/ipc-validation.test.ts

Add inside `isAllowedPath` describe block:
- "rejects URL-encoded slash %2F in path"
- "rejects URL-encoded slash %2f (lowercase) in path"
- "valid paths without encoded slashes still pass" (already covered)

### src/shared/__tests__/daemon-allowlist.test.ts

Add describe block for %2F bypass:
- "rejects GET /api/loops/abc%2Fdef (%2F bypass)"
- "rejects GET /api/loops/abc%2fsecret (%2f bypass)"

### src/main/__tests__/daemon-allowlist-ipc.test.ts

Add inside isAllowedPath describe:
- "rejects URL-encoded slash %2F"

### tests/ipc-validation.test.ts integration

Add inside validateIpc api:request describe:
- "rejects api:request with URL-encoded slash %2F"
