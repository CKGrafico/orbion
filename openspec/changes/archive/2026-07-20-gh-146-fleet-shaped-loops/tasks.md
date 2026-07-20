# Tasks: gh-146-fleet-shaped-loops

- [ ] 1.1 Add `provenance` and `adaptedFrom` fields to `LoopProposalRow` in `chat/types.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 1.2 Add `provenance` / `adaptedFrom` fields to the loop-proposal message serialization in `useTranscript.ts` (insert + update paths) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [ ] 2.1 Create `src/renderer/src/fleet-shape-adapt.ts` with pure `matchShapeToFleetIntent(command, shapes)` function <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/fleet-shape-adapt.ts] -->
- [ ] 2.2 Add `adaptShapeForPlatform(shape, platform)` function to `fleet-shape-adapt.ts` with gh↔az substitution rules <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/fleet-shape-adapt.ts] -->
- [ ] 2.3 Add `AdaptedShape` and `ShapeMatch` types to `fleet-shape-adapt.ts` and export <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/fleet-shape-adapt.ts] -->
- [ ] 3.1 Integrate shape matching + adaptation in `SessionChatView.tsx` when computing `similar` for loop-proposal rows — pre-populate command/args and set provenance on `LoopProposalRow` <!-- agent: frontend-engineer.build, depends_on: [1.1, 2.2, 2.3], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 4.1 Add provenance badge rendering to `LoopProposalCard.tsx` under the header when `row.provenance` is set and status is pending <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/LoopProposalCard.tsx] -->
- [ ] 4.2 Add CSS styles for the provenance badge in `theme.css` (chip style: bg_active, text_secondary, meta font) <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->
- [ ] 5.1 Add i18n keys `loopProposal.provenance` and `loopProposal.provenanceSamePlatform` to `en.json` <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 6.1 Add mock `LoopShape` data for a second environment in `MockServices.ts` (with gh commands for cross-platform testing) <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 7.1 Write Vitest unit tests for `matchShapeToFleetIntent` and `adaptShapeForPlatform` in `tests/fleet-shape-adapt.test.ts` <!-- agent: frontend-engineer.build, depends_on: [2.2, 2.3], touches: [tests/fleet-shape-adapt.test.ts] -->
- [ ] 7.2 Run existing test suite and typecheck to ensure no regressions <!-- agent: frontend-engineer.fast, depends_on: [7.1, 3.1, 4.1, 5.1, 6.1], touches: [] -->
