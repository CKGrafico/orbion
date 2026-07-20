# Archive: gh-146-fleet-shaped-loops

**Archived:** 2026-07-20
**Issue:** #146 — Propose fleet-shaped loops adapted to the local project

## Summary

Extended the loop proposal flow so that when creation intent matches a cached `LoopShape` from another instance, the proposal is pre-shaped with the chain structure and adapts platform-specific parts using the project's detected platform.

## Acceptance criteria

- ✅ When creation intent matches a cached shape, the proposal reuses the chain structure and adapts platform-specific parts using the project's detected platform.
- ✅ The proposal states provenance ("based on your implement-issue loop on prod-vm, adapted for Azure DevOps").
- ✅ Standard approve-before-create applies.

## Files changed

- `src/renderer/src/fleet-shape-adapt.ts` — New module with `matchShapeToFleetIntent`, `adaptShapeForPlatform`, `detectCommandPlatform`, `buildProvenance` functions
- `src/renderer/src/chat/types.ts` — Added `provenance` and `adaptedFrom` fields to `LoopProposalRow`
- `src/renderer/src/chat/useTranscript.ts` — Updated `parseLoopProposalMessage` and `insertLoopProposal` to handle new fields
- `src/renderer/src/components/FleetShapedProposalCard.tsx` — New wrapper component for async shape match + adaptation
- `src/renderer/src/components/SessionChatView.tsx` — Uses `FleetShapedProposalCard` for loop-proposal rows
- `src/renderer/src/components/LoopProposalCard.tsx` — Renders provenance badge when `row.provenance` is set
- `src/renderer/src/theme.css` — Added `.loop-proposal-provenance` styles
- `src/renderer/src/i18n/en.json` — Added `loopProposal.provenance` and `loopProposal.provenanceSamePlatform` keys
- `src/renderer/src/services/mock/MockServices.ts` — Added second environment mock shapes with GitHub commands; fixed `getPlatform` signature
- `src/visual-evidence/scenarios/gh-146-fleet-shaped-loops.ts` — New visual evidence scenario
- `src/visual-evidence/scenario-registry.ts` — Registered new scenario
- `tests/fleet-shape-adapt.test.ts` — 26 unit tests for shape matching and platform adaptation

## Evidence

See `evidence/evidence.json` for full assertion results.
