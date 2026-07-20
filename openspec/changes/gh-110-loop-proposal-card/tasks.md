# Tasks

- [ ] 1.1 Add LoopProposalRow type and `loop-proposal` row kind to chat/types.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 1.2 Add LoopProposalCard component with proposal UI, approve/reject, max-runs suggestion <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/LoopProposalCard.tsx] -->
- [ ] 1.3 Add createLoop API function and isAgentCommand detection helper <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/api.ts] -->
- [ ] 1.4 Add loop-proposal handling in useTranscript (insertLoopProposal, resolveLoopProposal) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [ ] 1.5 Wire LoopProposalCard into SessionChatView row renderer <!-- agent: frontend-engineer.build, depends_on: [1.2, 1.4], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 1.6 Add i18n keys for loop proposal card <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 1.7 Add CSS styles for LoopProposalCard in theme.css <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/theme.css] -->
- [ ] 1.8 Add mock support: mock create_loop MCP tool result and POST /api/loops <!-- agent: frontend-engineer.fast, depends_on: [1.3], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 1.9 Run typecheck and fix errors <!-- agent: frontend-engineer.fast, depends_on: [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8], touches: [] -->
