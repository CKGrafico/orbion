# Tasks: gh-353-percent2f-bypass

## Task 1: Add %2F rejection to isAllowedPath
- **touches:** src/main/ipc-validation.ts
- **tier:** fast
- **depends_on:** none

Add `if (/%2f/i.test(v)) return false;` after the existing `%25` check (line 71) in `isAllowedPath()`.

## Task 2: Add unit tests for %2F rejection
- **touches:** tests/ipc-validation.test.ts, src/shared/__tests__/daemon-allowlist.test.ts, src/main/__tests__/daemon-allowlist-ipc.test.ts
- **tier:** fast
- **depends_on:** Task 1

Add test cases covering:
- `isAllowedPath("/api/loops/abc%2Fdef")` → false
- `isAllowedPath("/api/loops/abc%2fsecret")` → false
- `isAllowedApiOperation("GET", "/api/loops/abc%2Fdef")` still false at allowlist level
- Integration: api:request with %2F path rejected
