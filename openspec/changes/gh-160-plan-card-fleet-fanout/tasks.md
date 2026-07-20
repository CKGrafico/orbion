# Tasks — Plan card with per-target approval for fleet fan-out

- [ ] 1.1 Add FleetPlanTarget and FleetPlanRow types to chat/types.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 1.2 Add "fleet-plan" to RowKind union and FleetPlanRow to TranscriptRow union <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 2.1 Create FleetPlanCard component with per-target checkboxes, apply/cancel, and inline result reporting <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/FleetPlanCard.tsx] -->
- [ ] 3.1 Add i18n keys for FleetPlanCard (title, apply, cancel, status labels, error prefix, target count) <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/**] -->
- [ ] 3.2 Add CSS styles for FleetPlanCard in theme.css following existing card conventions <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/theme.css] -->
- [ ] 4.1 Integrate FleetPlanCard rendering in SessionChatView transcript rows <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 4.2 Add mock FleetPlanRow data in mock transcript for dev:web <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/services/mock/**] -->
- [ ] 5.1 Run pnpm typecheck and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [] -->
