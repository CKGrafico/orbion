# Spec: log:write validator and rate limiter

## Validator (`ipc-validation.ts`)

The `log:write` validator checks `args[0]` as the log entry object:

- `args[0]` must be an object (not null, not array)
- `level` must be one of `"debug"`, `"info"`, `"warn"`, `"error"`
- `message` must be a non-empty string, max 10,000 chars
- `module` must match the allowlist OR be prefixed with `renderer/`:
  - Allowlist: `"renderer"`, `"chat"`, `"sidebar"`
  - Prefix rule: any string starting with `renderer/` and total length <= 100 chars
  - If `module` is undefined, it is valid (the handler will use the default logger)
- `context` must be an object (not null, not array) if provided

## Module name enforcement

Renderer-originated logs must not be able to forge module names like `credential-vault` or `ssh-probe`. The allowlist + prefix pattern ensures:
- Known renderer modules (`renderer`, `chat`, `sidebar`) are explicitly allowed
- New renderer modules can use `renderer/<name>` without allowlist updates
- No main-process-only module names can be forged

## Rate limiter

Token-bucket per environment (identified by sender webContents ID as proxy):
- Bucket size: 120 tokens
- Refill rate: 120 tokens per 60 seconds
- On limit exceeded: validator returns an issue string, `safeHandle` returns `{ ok: false, error: ... }`

The rate limiter is a pure function module within `ipc-validation.ts` (no external deps). A `Map<number, { tokens: number; lastRefill: number }>` tracks per-sender state. Cleanup runs on every check (evicts entries older than 5 minutes with 0 tokens).

## Handler (`index.ts`)

Migrated to `safeHandle`:

```ts
safeHandle("log:write", (_event, ...rawArgs) => {
  checkLogRateLimit(_event.sender.id);
  const [entry] = validateIpc<[LogEntry]>("log:write", rawArgs);
  const scopedLogger = entry.module ? createLogger(entry.module.slice(0, 100)) : logger;
  scopedLogger[entry.level](`${entry.message.slice(0, 10_000)}${formatLogContext(entry.context)}`);
});
```

`isLogEntry()` and `formatLogContext()` move from `index.ts` into the validator logic. `formatLogContext` stays in `index.ts` as a private helper since it contains sensitive-key redaction logic.

## Preload contract

Unchanged. The preload already sends `(entry: LogEntry)` as `args[0]`. The renderer `LogService` hardcodes `module: "renderer"` which is on the allowlist.
