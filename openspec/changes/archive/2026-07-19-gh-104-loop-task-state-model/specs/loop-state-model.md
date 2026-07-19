# Spec: Loop-task state model representation

## States

The loop-task daemon reports exactly 6 states. Orbion must represent all 6 with distinct colors and labels.

| Status    | Label in UI | Color Token             | TUI Color  | Semantic                             |
|-----------|-------------|-------------------------|------------|--------------------------------------|
| running   | Running     | --status-running (#9fef00 lime-green) | bright green | Currently executing a task        |
| waiting   | Waiting     | --status-waiting (#5cb2ff blue)       | blue        | Idle between scheduled runs       |
| paused    | Paused      | --status-paused  (#ffcc5c amber)      | yellow      | Schedule kept, can resume         |
| stopped   | Stopped     | --status-stopped (#e8a24e warm-amber) | dim orange  | Schedule cleared, must re-create  |
| failed    | Failed      | --status-failed  (#ff8484 red)        | red         | Non-zero exit code                |
| finished  | Finished    | --status-finished (#a9d95c green)     | bright green| Hit max-runs (success)            |

## Fleet mapping

| LoopStatus | FleetItemStatus | Rationale                                      |
|------------|-----------------|------------------------------------------------|
| running    | working         | Active work                                    |
| waiting    | idle            | Between runs, healthy                          |
| paused     | paused          | New FleetItemStatus — distinct from idle/failed|
| stopped    | stopped         | New FleetItemStatus — distinct from paused/failed|
| failed     | failed          | Non-zero exit                                  |
| finished   | completed       | Hit max-runs (success)                         |

When instance is unreachable/reconnecting, all loops → `"unknown"` (unchanged).

## Summary bar

- **Healthy** (collapsed count): running, waiting
- **Exception** (individual colored segments): failed, paused, stopped, finished
- Stopped and paused each get their own segment color so the user can see the difference at a glance.

## Removal of "idle"

The `"idle"` variant on `LoopStatus` is removed. The daemon never emits this state — `waiting` is the correct idle-between-runs state. Any existing mock data using `"idle"` is updated to `"waiting"`.
