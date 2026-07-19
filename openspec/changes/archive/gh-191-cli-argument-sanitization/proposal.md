# Security: CLI argument injection via unsanitized user input

## Change ID
gh-191-cli-argument-sanitization

## Issue
#191

## Severity
8.8/10 — High (argument injection)

## Summary
User-controlled data (issue title, body, labels, repo) was passed directly to `execFile("gh", ...)` and `execFile("az", ...)` without validation or sanitization. While `execFile` is not vulnerable to shell injection, there was no defense against argument injection through the CLI tools themselves.

## Attack Vectors
1. **Label argument injection**: Labels like `--repo evil/repo` could be parsed by `gh` as a separate flag
2. **Comma-join ambiguity**: `params.labels.join(",")` could split into unexpected values if a label contains a comma
3. **Newline injection**: title/body containing newlines could confuse CLI output parsing
4. **Repo format manipulation**: Malformed repo values could confuse downstream parsing

## Fix
1. **validateLabels()**: Reject labels containing commas, whitespace, or `--` prefix. Only allow `^[a-zA-Z0-9_.:/-]+$`
2. **validateRepo()**: Only allow `owner/repo` pattern matching `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`
3. **sanitizeText()**: Strip control characters (newlines, null bytes, tabs) from title/body
4. **validateCliInputs()**: Shared validation entry point applied at all 4 CLI invocation sites

## Files Touched
- `src/main/index.ts` — added validators + applied at create-issue (gh+az), add-label, edit-issue (gh+az)
