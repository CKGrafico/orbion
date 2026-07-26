# Tasks

- [x] 1.1 Change `perPrNotes` type in `src/shared/ipc.ts` from `Map<string, string[]>` to `Record<string, string[]>` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Replace `new Map()` + `.set()` + `.get()` with plain object in `detect-overlaps.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/review/detect-overlaps.ts] -->
- [x] 1.3 Replace `.get(key)` with bracket access in `ReviewQueueStrip.tsx` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/review/ReviewQueueStrip.tsx] -->
- [x] 1.4 Replace `new Map()` with `{}` in `ReviewModeService.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/impl/ReviewModeService.ts] -->
