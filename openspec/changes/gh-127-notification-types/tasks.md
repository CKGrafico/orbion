# Tasks: gh-127-notification-types

- [x] 1.1 Add NotificationType and kindToNotificationType() to shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Add notificationType field to InboxItem in shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [x] 1.3 Add "digest" to InboxItemKind and "watch-cleared" to InboxItemResolutionReason <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [x] 2.1 Create useLoopTransitions hook for detecting loop state transitions <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/use-loop-transitions.ts] -->
- [x] 2.2 Wire useLoopTransitions in App.tsx with OS notification callbacks <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.1], touches: [src/renderer/src/App.tsx] -->
- [x] 3.1 Add notificationType to all derived items in InboxService.deriveItems() <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [x] 3.2 Update resolution reasons and query patterns for watch/cleared types <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [x] 3.3 Add finished and watch query patterns to answerFleetQuery <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [x] 4.1 Add notificationType to MockInboxService.buildItems() <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [x] 4.2 Update mock resolution reasons for watch-cleared <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [x] 5.1 Update InboxView KindIcon/kindColor to accept and use notificationType <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/features/inbox/InboxView.tsx] -->
- [x] 5.2 Update InboxPanel InboxItemRow to use notificationType for dot icon/color <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->
- [x] 6.1 Add i18n keys for notification type labels, transition messages, and watch-cleared resolution <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 6.2 Add notification type CSS custom properties to theme.css <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/theme.css] -->
- [x] 7.1 Typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [all], touches: [] -->
