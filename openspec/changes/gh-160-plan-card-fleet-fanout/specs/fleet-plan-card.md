# FleetPlanCard Specification

## 1. FleetPlanTarget

Each target in the plan card represents a single `(project x instance)` operation:

| Field | Type | Description |
|---|---|---|
| `targetId` | `string` | Unique ID for this target (e.g. `envId:projectId`) |
| `environmentId` | `string` | The instance (environment) this target runs on |
| `environmentName` | `string` | Display name for the instance |
| `projectId` | `string` | Project ID on that instance |
| `projectName` | `string` | Display name for the project |
| `operation` | `string` | Human-readable description of the concrete operation |
| `checked` | `boolean` | Whether the target is selected (default: `true`) |
| `status` | `FleetPlanTargetStatus` | Execution status |

## 2. FleetPlanTargetStatus

A target goes through these states:

- `"pending"` - not yet executed (initial state)
- `"running"` - currently executing
- `"ok"` - succeeded
- `"failed"` - failed (error message populated)
- `"skipped"` - unchecked by user, will not execute

## 3. FleetPlanStatus

The overall card status:

- `"pending"` - showing targets, waiting for user to apply or cancel
- `"applying"` - executing selected targets
- `"applied"` - all selected targets completed (some may have failed)
- `"cancelled"` - user cancelled without applying

## 4. Card layout

```
┌──────────────────────────────────────────────┐
│  ⇶ Fleet Plan                                │
│  "Add test-watch to all Node projects"        │
├──────────────────────────────────────────────┤
│  ☑ prod-vm · web-app     npm test            │
│  ☑ staging · api-server  npm test            │
│  ☐ dev-box · playground  npm test            │
├──────────────────────────────────────────────┤
│  [Cancel]          [Apply to 2 selected]      │
└──────────────────────────────────────────────┘
```

After applying:

```
┌──────────────────────────────────────────────┐
│  ⇶ Fleet Plan                     ✓ Applied │
│  "Add test-watch to all Node projects"        │
├──────────────────────────────────────────────┤
│  ✓ prod-vm · web-app     npm test            │
│  ✗ staging · api-server  npm test            │
│    Error: loop-task connection refused        │
│  — dev-box · playground  (skipped)           │
└──────────────────────────────────────────────┘
```

## 5. Transcript row type

New row kind: `"fleet-plan"` with a `FleetPlanRow` interface added to `TranscriptRow` union.

## 6. Execution model

- The parent component (`SessionChatView`) holds the callback for applying targets.
- `FleetPlanCard` manages its own local state for checkboxes (which targets are checked).
- On "Apply to N selected", the card iterates over checked targets, setting each to `"running"` then `"ok"/"failed"` as results come back.
- The actual API calls re-use existing infrastructure: `createLoop()` for loop creation, `apiRequest()` for other daemon operations.
- Unchecked targets are set to `"skipped"` and never called.
