# Tasks — gh-109-collapsed-loop-cards

## 1. LoopCard collapse state + IntersectionObserver
- [ ] 1.1 Add `isScrolledPast` state and `scrollContainerRef` prop to LoopCard; replace the existing IntersectionObserver with a root-aware observer that detects when the card scrolls above the scroll container viewport, setting `isScrolledPast` accordingly. Wire the new prop through the component. <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/LoopCard.tsx] -->
- [ ] 1.2 Add collapsed rendering branch in LoopCard: when `isScrolledPast` is true, render a compact one-liner (status dot + loop name + em dash + status label) instead of the full card. Add click handler on the collapsed view that sets expanded and scrolls into view. <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/LoopCard.tsx] -->

## 2. SessionChatView prop threading
- [ ] 2.1 Pass `scrollRef` as `scrollContainerRef` prop from SessionChatView to each LoopCard rendered in the `loop-card` row case. <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/components/SessionChatView.tsx] -->

## 3. Styling
- [ ] 3.1 Add `.loop-card--collapsed` and `.loop-card-collapsed-sep` CSS classes to theme.css for the one-line collapsed view (reduced padding, single-row flex, hidden meta/log/actions, hover state, cursor pointer, separator styling). <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/theme.css] -->

## 4. Verification
- [ ] 4.1 Run typecheck (`pnpm typecheck`) and fix any TypeScript errors introduced by the new props and state. <!-- agent: frontend-engineer.fast, depends_on: [1.2, 2.1, 3.1], touches: [] -->
