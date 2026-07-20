# Design: Fleet Similar Loops

## Type Definitions

### `SimilarLoopMatch`
```typescript
interface SimilarLoopMatch {
  loop: LoopMeta;
  environmentId: string;
  environmentName: string;
  projectName: string;
  score: number;              // 0-1 similarity score
  matchReasons: string[];     // Why it matched, e.g. ["same command", "same interval"]
}
```

### `LoopProposalRow` extension
Add optional field:
```typescript
similarLoops?: SimilarLoopMatch[];
```

This field is NOT persisted in the transcript message. It is computed transiently when the component renders. The `insertLoopProposal` function does not include it.

## Similarity Algorithm

### Normalization
- Strip path prefix from commands (keep basename)
- Strip common extensions (.exe, .cmd, .bat, .sh)
- Lowercase comparison

### Scoring weights
| Factor | Weight | Reason |
|--------|--------|--------|
| Command match | 0.50 | Primary signal: same tool/pattern |
| Interval match | 0.20 | Same cadence = same intent |
| Project match | 0.15 | Cross-project reuse is common |
| Description overlap | 0.15 | Human-intent signal if available |

### Threshold
Minimum score of 0.4 to be shown. Top 3 matches.

### Match reasons
Each contributing factor above its threshold generates a human-readable reason:
- `commandNameMatch`: "Same command: {baseCommand}"
- `intervalMatch`: "Same interval: {interval}"
- `projectNameMatch`: "Also in project: {projectName}"

## Component Design

### LoopProposalCard "Similar loops" section
Located between the meta row and the options row. Collapsed by default when 1+ matches exist; shows count badge ("2 similar"). Expanded shows a compact list:

```
┌─────────────────────────────────────────┐
│ ≡ Loop proposal                         │
│ ─────────────────────────────────────── │
│ npm run build                           │
│ interval: 5m  ·  project: Default       │
│ ─────────────────────────────────────── │
│ ⚡ 2 similar loops              [Show ▾] │
│ ┌─────────────────────────────────────┐ │
│ │ 🖥 prod-vm · Default                │ │
│ │ npm run build · 10m                │ │
│ │ [Use as starting point]            │ │
│ ├─────────────────────────────────────┤ │
│ │ 🖥 staging-vm · ETL               │ │
│ │ npm run build:prod · 5m            │ │
│ │ [Use as starting point]            │ │
│ └─────────────────────────────────────┘ │
│ ─────────────────────────────────────── │
│ □ Run immediately   Max runs: [     ]   │
│          [Reject]  [Approve]            │
└─────────────────────────────────────────┘
```

### "Use as starting point" behavior
On click:
1. Update the proposal's command and interval fields to match the selected similar loop
2. The command and interval in the card update visually
3. The similar loops section collapses
4. User can still edit before approving

This is purely a local state change in `LoopProposalCard`. The `command` and `interval` become editable state (they already are partially: `maxRuns` and `runImmediately` are local state). We add `command` and `interval` to the local state.

## Data Flow

```
SessionChatView
  ├─ perEnvLoops (from App.tsx polling)
  ├─ environments
  ├─ reachability
  │
  ├─ computeSimilarLoops(proposal, fleetLoops, environments, reachability)
  │   └─ fleet-similarity.ts (pure function)
  │
  └─ <LoopProposalCard similarLoops={matches} ... />
       └─ User clicks "Use as starting point"
           └─ Local state: command + interval update
```

No IPC. No main process changes. No new bridge methods. Pure renderer enhancement.
