# LoopCard component spec

## Component: `LoopCard`

### Location
`src/renderer/src/components/LoopCard.tsx`

### Props
```typescript
interface LoopCardProps {
  loop: LoopMeta;
  reachability?: "connected" | "reconnecting" | "unreachable";
}
```

### Layout
```
┌──────────────────────────────────────────────┐
│  ● Loop Name / Description                   │
│  ⏱ 30s  │  ↻ 14  │  exit 0  │  next in 2m  │
└──────────────────────────────────────────────┘
```

1. **Header row**: Status dot (colored by STATUS_COLORS) + loop name (description or command line fallback).
2. **Meta row**: Four data points in a horizontal flex:
   - Interval (`intervalHuman`)
   - Run count (`runCount`, with optional `maxRuns` fraction)
   - Last exit code (colored green for 0, red for non-zero, muted for null)
   - Next run (countdown string via `useNextRunCountdown`)

### Failed state
When `loop.lastExitCode !== null && loop.lastExitCode !== 0`:
- Card gets a subtle danger-tinted background (`color-mix(in srgb, var(--danger) 8%, transparent)`)
- Left border or border highlight in danger color
- Exit code shown in danger color with emphasis

### Unreachable state
When `reachability !== "connected"`:
- Status dot shows unknown/grey
- Meta row shows "unknown" for dynamic fields
- Card is slightly muted

### Live updates
The card receives `loop` as a prop — the parent (SessionChatView) re-renders it when perEnvLoops updates from polling. No internal polling needed. The `useNextRunCountdown` hook drives the countdown timer.

## Chat integration

### New row kind
Add `loop-card` to `RowKind` union in `chat/types.ts`:
```typescript
| "loop-card"
```

Add `LoopCardRow` interface:
```typescript
interface LoopCardRow extends BaseRow {
  kind: "loop-card";
  loopId: string;
  environmentId: string;
}
```

Add to `TranscriptRow` union.

### SessionChatView rendering
When rendering rows of kind `loop-card`, look up the loop from perEnvLoops and render `<LoopCard>`.
