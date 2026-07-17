# Tasks: inbox-type-specific-actions

- [ ] 1.1 Extend InboxItem with availableActions field and InboxAction type in shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add InboxBuildParams.loopStatusMap for per-loop status lookup <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts, src/renderer/src/services/interfaces.ts] -->
- [ ] 2.1 Add getAvailableActions helper mapping item kind + loop status to action list <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 2.2 Add executeInboxAction to IInboxService + InboxService implementation <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 2.3 Update deriveItems to include availableActions on each item <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 3.1 Add MockInboxService.executeInboxAction mock <!-- agent: frontend-engineer.fast, depends_on: [2.2], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 4.1 Update InboxPanel InboxItemRow to render inline action buttons <!-- agent: frontend-engineer.build, depends_on: [2.2], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->
- [ ] 4.2 Implement Open in chat action handler in InboxPanel <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->
- [ ] 5.1 Add i18n keys for all action labels <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 5.2 Add CSS styles for inbox action buttons <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->
- [ ] 6.1 Typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [5.1, 5.2], touches: [] -->
