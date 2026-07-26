# Spec: IPC-Safe Record Type

Replace `Map<string, string[]>` with `Record<string, string[]>` throughout the `BatchOverlapResult` contract.

## Migration Pattern

- `new Map<string, string[]>()` → `{} as Record<string, string[]>`
- `perPrNotes.set(key, value)` → `perPrNotes[key] = value`
- `perPrNotes.get(key)` → `perPrNotes[key]` (returns `undefined` when missing, same as Map)
- `perPrNotes.get(key)!` → `perPrNotes[key]!` or `perPrNotes[key] ?? []`

## Safety

`Record<string, string[]>` is plain-serializable. No structured-clone edge cases. No JSON.stringify edge cases.
