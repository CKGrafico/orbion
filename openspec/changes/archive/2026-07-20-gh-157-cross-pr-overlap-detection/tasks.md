# Tasks: Cross-PR conflict and overlap detection

## Change: gh-157-cross-pr-overlap-detection

- [ ] 1.1 Add overlap detection types to shared IPC contract (PrOverlap, OverlapKind, BatchOverlapResult, ReviewOrderEntry) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Implement pure overlap detection algorithm (detectBatchOverlaps function) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/review/detect-overlaps.ts] -->
- [ ] 1.3 Add overlap state to ReviewModeService (fetch overlaps on batch enter, expose perPrNotes and suggestedOrder) <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/renderer/src/services/impl/ReviewModeService.ts, src/renderer/src/services/interfaces.ts] -->
- [ ] 2.1 Add overlap indicator chip to ReviewQueueStrip rows <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/features/review/ReviewQueueStrip.tsx] -->
- [ ] 2.2 Add review order banner to ReviewModeOverlay <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->
- [ ] 2.3 Add file-level overlap note in ReviewBriefingView <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/features/review/ReviewBriefingView.tsx] -->
- [ ] 3.1 Add CSS for overlap chip, review order banner, and file-level overlap note <!-- agent: frontend-engineer.build, depends_on: [2.1, 2.2, 2.3], touches: [src/renderer/src/theme.css] -->
- [ ] 4.1 Add i18n keys for overlap detection UI <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/**] -->
- [ ] 4.2 Update mock infra service with overlap scenario (4 PRs batch, 2 with shared files, 1 near-duplicate) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
