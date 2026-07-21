# gh-330: Fragile duplicated port-parsing logic in ssh-launch.ts stdout handling

## Summary

The `launchOnVm()` function in `src/main/ssh-launch.ts` parses remote script stdout line-by-line. The same `parseInt(trimmed.split("|")[1])` pattern for extracting port numbers from pipe-delimited markers appears 6 times across two separate parsing blocks (success path lines 546-571, error path lines 518-541). No shared helper exists. If the pipe-delimited field is empty, `parseInt("", 10)` returns `NaN`, which propagates into `VmWizardLaunchResult.daemonPort` and URL construction like `http://host:NaN`.

## Root Cause

1. Duplicated `parseInt` + `split("|")` pattern with inconsistent fallbacks
2. No NaN protection on parseInt results
3. Error and success paths parse the same stdout independently

## Fix

1. Extract `parsePipeInt(line, prefix, fallback)` helper with NaN/empty/range protection
2. Unify both success and error stdout parsing into a single pass
3. Add unit tests for the new helper and unified parsing logic

## Acceptance Criteria

- All 6 duplicated `parseInt` calls replaced with `parsePipeInt`
- Single pass over `launchResult.stdout` instead of two loops
- `parsePipeInt` returns fallback for empty, NaN, or out-of-range (1-65535) values
- Existing tests continue to pass
- New unit tests cover edge cases (empty field, non-numeric, out of range, valid ports)
