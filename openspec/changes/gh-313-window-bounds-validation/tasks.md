# Tasks

- [x] 1.1 Extract `validateBounds()` pure function with coordinate and size validation in `src/main/index.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/window-bounds.ts] -->
- [x] 1.2 Update `loadBounds()` to use `validateBounds()` instead of inline check in `src/main/index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 2.1 Add `tests/window-bounds.test.ts` covering valid bounds, out-of-range x/y, out-of-range width/height, null/undefined fields, corrupted JSON <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/window-bounds.test.ts] -->
- [x] 3.1 Run typecheck and fix errors <!-- agent: frontend-engineer.fast, depends_on: [1.2, 2.1], touches: [] -->
