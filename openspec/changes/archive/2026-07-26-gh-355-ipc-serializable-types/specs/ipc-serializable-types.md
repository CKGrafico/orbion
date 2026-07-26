# Spec: IPC Serializable Types

## SerializableValue type

A recursive type that only permits values safe for Electron's structured-clone algorithm:

```typescript
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };
```

Applied to `LogEntry.context`:

```typescript
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, SerializableValue>;
  module?: string;
}
```

## McpToolInfo.inputSchema

Change from `unknown` to `Record<string, unknown>` — JSON Schema is always a plain object. This rejects `null`, `string`, `undefined` at the type level while still allowing nested schema values.

## log:write IPC validator context value check

After the existing `isObject(e.context)` check, validate each context value is JSON-serializable:

```typescript
if (isObject(e.context)) {
  for (const [key, val] of Object.entries(e.context)) {
    if (val !== undefined) {
      try {
        JSON.stringify(val);
      } catch {
        issues.push(`context.${key} contains a non-serializable value`);
        break;
      }
    }
  }
}
```

Pattern follows the existing `api:request` body serialization check at line 227-234 of ipc-validation.ts.

## ApiResponse default

Leave `ApiResponse<T = unknown>` unchanged. The generic `T` gives callers typed access to `data`. Add a TSDoc note that `T` should be a structured-clone-safe type for IPC usage. Same for `McpToolCallResult.data`.
