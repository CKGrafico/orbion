## 1. Backend & Allowlist

- [ ] 1.1 Add `POST /api/loops/:id/stop` to daemon allowlist in `src/shared/daemon-allowlist.ts` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/shared/daemon-allowlist.ts] -->
- [ ] 1.2 Add positive test for stop allowlist entry in `src/shared/__tests__/daemon-allowlist.test.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/shared/__tests__/daemon-allowlist.test.ts] -->

## 2. API Layer

- [ ] 2.1 Add `pauseLoop`, `resumeLoop`, `stopLoop`, `triggerLoop` functions to `src/renderer/src/api.ts` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/api.ts] -->
- [ ] 2.2 Add i18n keys for loop card actions in `src/renderer/src/i18n/en.json` (button labels, confirmation messages, result messages) <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## 3. Mock Adapter

- [ ] 3.1 Update mock request handler in `src/renderer/src/services/mock/MockServices.ts` to handle POST requests to `/api/loops/:id/pause`, `/resume`, `/stop`, `/trigger` by mutating in-memory loop status <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 4. Loop Card Actions UI

- [ ] 4.1 Add action button row, confirmation overlay, and inline result feedback to `LoopCard.tsx` with state-dependent visibility per spec <!-- agent: frontend-engineer.build, depends_on: [2.1, 2.2, 3.1], touches: [src/renderer/src/components/LoopCard.tsx] -->
- [ ] 4.2 Add CSS for loop card action buttons, confirmation overlay, and result text to `src/renderer/src/theme.css` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->

## 5. Verification

- [ ] 5.1 Run TypeScript type check and verify no errors <!-- agent: frontend-engineer.fast, depends_on: [4.1, 4.2], touches: [] -->
