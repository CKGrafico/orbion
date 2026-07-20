# Tasks: Offer structural chain improvements to sibling loops

## Change ID

gh-147-sibling-structural-offers

## Tasks

### Task 1: Add shared types and IPC contract for sibling offer + decline store

- [ ] 1.1 Add `StructuralChangeFingerprint`, `StructuralDiff`, `SiblingCandidate` types to `src/shared/sibling-offer-types.ts` (new) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/sibling-offer-types.ts] -->
- [ ] 1.2 Add `SiblingOfferRow` type and `sibling-offer` row kind to chat types <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 1.3 Add `SiblingOfferBridge` and `SiblingDeclineBridge` to IPC contract <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.4 Expose `SiblingOfferBridge` and `SiblingDeclineBridge` in preload contextBridge <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/preload/index.ts] -->

### Task 2: Create main-process decline store + IPC handlers

- [ ] 2.1 Implement `sibling-decline-store.ts` in main process (electron-store, stores declined fingerprint triples) <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/main/sibling-decline-store.ts] -->
- [ ] 2.2 Register `siblingDecline:*` IPC handlers in main index <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/index.ts] -->

### Task 3: Create pure structural-diff and sibling-discovery functions

- [ ] 3.1 Implement `fleet-structural-diff.ts` — `detectStructuralChanges`, `computeStructuralDiff`, `findSiblingLoops`, `fingerprintStructuralChange` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/fleet-structural-diff.ts] -->
- [ ] 3.2 Add `ISiblingOfferService` interface + `SiblingOfferService` implementation <!-- agent: frontend-engineer.build, depends_on: [1.3, 3.1], touches: [src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/SiblingOfferService.ts] -->
- [ ] 3.3 Register `ISiblingOfferService` in the DI container <!-- agent: frontend-engineer.fast, depends_on: [3.2], touches: [src/renderer/src/services/container.ts] -->

### Task 4: Create SiblingOfferCard component + transcript integration

- [ ] 4.1 Build `SiblingOfferCard.tsx` — one card per sibling, shows loop name/instance, structural diff summary, Approve/Decline <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/components/SiblingOfferCard.tsx] -->
- [ ] 4.2 Add `insertSiblingOffer` / `updateSiblingOfferStatus` to useTranscript <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/chat/useTranscript.ts] -->

### Task 5: Wire everything into SessionChatView

- [ ] 5.1 On chain-edit-proposal "applied", trigger `detectStructuralChanges` + `findSiblingLoops` + decline-check, then insert sibling-offer rows <!-- agent: frontend-engineer.build, depends_on: [3.1, 3.2, 4.2], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 5.2 Render `SiblingOfferCard` rows in the chat stream <!-- agent: frontend-engineer.build, depends_on: [4.1, 5.1], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 5.3 Wire approve callback (calls `apply_structural_diff` via McpService on sibling's environment) <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 5.4 Wire decline callback (persists decline fingerprint via `SiblingOfferService`, marks row as declined) <!-- agent: frontend-engineer.build, depends_on: [5.1, 2.2], touches: [src/renderer/src/components/SessionChatView.tsx] -->

### Task 6: i18n, CSS, mock adapter

- [ ] 6.1 Add i18n keys for sibling offer (title, summary, approve, decline, applying, applied, declined, error, instance attribution) <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 6.2 Add CSS styles for sibling offer card matching existing visual language <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->
- [ ] 6.3 Add `SiblingOfferService` mock implementation <!-- agent: frontend-engineer.fast, depends_on: [3.2], touches: [src/renderer/src/services/mock/MockServices.ts] -->

### Task 7: Verification

- [ ] 7.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [6.3], touches: [] -->
