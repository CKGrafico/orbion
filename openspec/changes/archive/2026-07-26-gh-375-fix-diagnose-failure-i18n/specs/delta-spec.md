# Delta Spec: diagnoseFailure i18n consistency

## Current Behavior

### Pattern-match path (lines 154-158)
Returns i18n keys: `rule.summaryKey`, `rule.nextStepKey`.
These translate correctly via `t()`.

### Exit-code path (diagnoseFromExitCode, lines 101-133)
Returns raw English strings with embedded exit codes:
- `"The command or interpreter was not found (exit 127)."`
- `"The command exists but is not executable (exit 126)."`
- `"The process was killed (likely OOM or manual kill, exit 137)."`
- `"The command timed out (exit 124, typical of the \`timeout\` command)."`

### Fallback path (lines 168-184)
Returns raw English strings with embedded exit code and command name:
- `"The command exited with code ${exitCode} but produced no output."`
- `"Run \`${command}\` manually on the target machine to see the error."`
- `"The command exited with code ${exitCode}."`
- `"Check the log output above or run \`${command}\` manually for details."`

### Non-failed path (lines 138-144)
Returns raw English:
- `"The loop is not in a failed state."`
- `"No action needed."`

### Consumer: FailureDiagnosisPanel
Uses `formatText` heuristic (dot-no-space check) to guess whether to call `t()`. Fragile — breaks if raw text contains dots or i18n keys lack dots.

## Target Behavior

All `summary`/`nextStep` fields from `diagnoseFailure()` are i18n keys. Callers call `t()` unconditionally.

### New i18n keys (en.json under "diagnosis")

| Key | Value |
|-----|-------|
| `summaryExit127` | `"The command or interpreter was not found (exit {{exitCode}})."` |
| `nextStepExit127` | `"Verify the command is installed and in the PATH on the target machine."` |
| `summaryExit126` | `"The command exists but is not executable (exit {{exitCode}})."` |
| `nextStepExit126` | `"Check file permissions on the command script or binary."` |
| `summaryExit137` | `"The process was killed (likely OOM or manual kill, exit {{exitCode}})."` |
| `nextStepExit137` | `"Check system memory usage; the process may have been killed by the OOM killer."` |
| `summaryExit124` | `"The command timed out (exit {{exitCode}}, typical of the \`timeout\` command)."` |
| `nextStepExit124` | `"Increase the timeout or investigate why the command is taking too long."` |
| `summaryNoOutput` | `"The command exited with code {{exitCode}} but produced no output."` |
| `nextStepNoOutput` | `"Run \`{{command}}\` manually on the target machine to see the error."` |
| `summaryGeneric` | `"The command exited with code {{exitCode}}."` |
| `nextStepGeneric` | `"Check the log output above or run \`{{command}}\` manually for details."` |
| `summaryNotFailed` | `"The loop is not in a failed state."` |
| `nextStepNotFailed` | `"No action needed."` |

### Change to FailureDiagnosis interface

Add optional `params` field for i18n interpolation:

```typescript
export interface FailureDiagnosis {
  category: FailureCategory;
  summary: string;
  nextStep: string;
  params?: Record<string, string | number>;
  confidence: "high" | "medium" | "low";
}
```

### Changes to FailureDiagnosisPanel

- Remove `formatText` helper.
- Use `t(row.summary, row.params)` and `t(row.nextStep, row.params)` unconditionally.

### Changes to FailureDiagnosisRow

Add optional `params` field mirroring `FailureDiagnosis`:

```typescript
export interface FailureDiagnosisRow extends BaseRow {
  // ... existing fields
  params?: Record<string, string | number>;
}
```

### Changes to SessionChatView

Pass `params` through when calling `insertFailureDiagnosis`.
