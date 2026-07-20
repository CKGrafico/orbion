# Spec: Loop card auto-collapse behavior

## Component: `LoopCard`

### Current behavior
- Always renders at full size (header + meta + log tail + actions)
- Uses IntersectionObserver for SSE visibility gating only

### New behavior

#### States
| State | Condition | Visual |
|-------|-----------|--------|
| **expanded** | Card is within the viewport OR was clicked to expand | Full card (current rendering) |
| **collapsed** | Card has scrolled above the viewport AND was not recently clicked to expand | One-line: `● Name — status` |

#### Transition rules
1. Card starts **expanded** on mount
2. When the card's bottom edge scrolls above the scroll container's top edge → **collapsed**
3. When the card is in the viewport (bottom edge is below scroll container's top edge) → **expanded**
4. User clicks the collapsed one-liner → **expanded** + scroll-into-view (smooth, centered)
5. After a click-expand, the card stays expanded until it scrolls above the viewport again

#### Collapsed one-liner layout
```
[8px status dot] [loop name (truncated)] [—] [status label]
```
- Same dot styling as the full card (including pulse animation for running)
- Loop name uses `.loop-card-name` styling (13px, font-weight 600, text-overflow ellipsis)
- Status label uses `.loop-card-status-chip` styling (10.5px, font-weight 600, colored by status)
- Em dash separator (`—`) in `.text-muted`
- Entire row is clickable (cursor: pointer)
- Hover: slight background shift to `var(--bg-hover)`

#### IntersectionObserver configuration
- **Root**: The scroll container `.session-chat-scroll` (passed as a ref prop from `SessionChatView`)
- **RootMargin**: `"0px 0px 0px 0px"` (no margin)
- **Threshold**: `[0, 1]` — track both partial and full visibility
- **Visible determination**: `intersectionRect.top >= 0` within the root — if the card's top is below the root's top, it's at least partially visible (expanded); if the card's bottom is above the root's top, it's scrolled past (collapsed)

#### SSE and data streaming
- Collapsed cards **do not** subscribe to SSE log streams (the existing `isVisible` gating already handles this)
- Collapsed cards **continue to receive** updated `loop` props from the parent's polling cycle, so the status dot and text stay live
- Re-expanding a card triggers the existing `isVisible` effect, which re-subscribes to SSE and fetches the initial log tail

#### Props changes
```typescript
interface LoopCardProps {
  loop: LoopMeta;
  reachability?: "connected" | "reconnecting" | "unreachable";
  instance?: Environment;
  /** The scroll container element for IntersectionObserver rooting. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}
```

## Component: `SessionChatView`

### Change
- Pass `scrollRef` (the existing ref for `.session-chat-scroll`) as `scrollContainerRef` to each `LoopCard` rendered via the `loop-card` row case.

```tsx
case "loop-card": {
  // ... existing loop lookup ...
  return (
    <div key={row.id} className="transcript-loop-card">
      <LoopCard
        loop={loop}
        reachability={reachability}
        instance={instance}
        scrollContainerRef={scrollRef}
      />
    </div>
  );
}
```

## CSS: `theme.css`

### New class: `.loop-card--collapsed`
- Applied alongside `.loop-card` when the card is in collapsed state
- Reduces padding to `5px 14px`
- Changes the card to a single-row flex layout
- Hides `.loop-card-meta`, `.loop-card-log-tail`, `.loop-card-actions`, `.loop-card-action-result`, `.loop-card-confirm-overlay` via `display: none`
- Adds cursor: pointer and hover background
- Adds separator element `.loop-card-collapsed-sep` (em dash in `--text-muted`)

## i18n: `en.json`

No new keys required. The collapsed one-liner reuses:
- Status labels: `loopCard.statusRunning`, `loopCard.statusWaiting`, etc.
- The separator is a literal em dash ` — ` (no i18n needed)
