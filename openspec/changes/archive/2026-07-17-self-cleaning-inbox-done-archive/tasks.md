## 1. Shared types and IPC contract

- [ ] 1.1 Add `ResolvedInboxItem` interface and `InboxItemResolutionReason` type to `src/shared/ipc.ts` (resolvedAt, resolution fields plus original InboxItem data) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Extend `InboxBridge` in `src/shared/ipc.ts` with `resolveItem`, `getResolvedItems`, and `pruneResolvedItems` methods <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->

## 2. Main process persistence and IPC handlers

- [ ] 2.1 Add resolved-item store functions to `src/main/config-store.ts` (addResolvedItem, getResolvedItems, pruneResolvedItems with 30-day TTL) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 2.2 Add IPC handlers in `src/main/index.ts` for `inbox:resolveItem`, `inbox:getResolvedItems`, `inbox:pruneResolvedItems` <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/main/index.ts] -->

## 3. Preload bridge

- [ ] 3.1 Wire new `InboxBridge` methods in `src/preload/index.ts` for resolveItem, getResolvedItems, pruneResolvedItems <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/preload/index.ts] -->

## 4. Renderer service layer

- [ ] 4.1 Extend `IInboxService` interface in `src/renderer/src/services/interfaces.ts` with resolveItem, getResolvedItems, pruneResolvedItems methods <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 4.2 Implement auto-resolution detection and resolved-item methods in `src/renderer/src/services/impl/InboxService.ts` (diff previous/current active item sets, emit resolve events, query Done archive) <!-- agent: frontend-engineer.build, depends_on: [4.1, 2.2, 3.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 4.3 Add mock implementations in `src/renderer/src/services/mock/MockServices.ts` for new IInboxService methods <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 5. InboxPanel UI - Done toggle and resolved items display

- [ ] 5.1 Add Done/Active toggle to InboxPanel header and implement Done view rendering with resolved items <!-- agent: frontend-engineer.build, depends_on: [4.2], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->
- [ ] 5.2 Add i18n keys for Done view strings in `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [5.1], touches: [src/renderer/src/i18n/en.json] -->

## 6. Styling

- [ ] 6.1 Add CSS styles for Done toggle and resolved-item rows in `src/renderer/src/theme.css` <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/theme.css] -->

## 7. Integration and verification

- [ ] 7.1 Wire auto-resolution useEffect in App.tsx or InboxPanel to detect condition clearing and call resolveItem; wire Done view data loading <!-- agent: frontend-engineer.build, depends_on: [4.2, 5.1], touches: [src/renderer/src/features/inbox/InboxPanel.tsx, src/renderer/src/App.tsx] -->
- [ ] 7.2 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [7.1], touches: [] -->
