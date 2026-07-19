# CLI Input Sanitization Spec

## Validator Functions

### `validateLabels(labels: string[]): void`
- Throws on invalid label
- Regex: `^[a-zA-Z0-9_.:/-]+$`
- Rejects labels starting with `--`
- Prevents: comma injection, flag injection via labels

### `validateRepo(repo: string | undefined): void`
- No-op if repo is undefined/empty
- Regex: `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`
- Prevents: malformed repo strings, flag-like repo values

### `sanitizeText(value: string): string`
- Replaces all control characters (0x00-0x1F, 0x7F) with space
- Trims leading/trailing whitespace
- Prevents: newline injection in title/body

### `validateCliInputs(opts): void`
- Orchestrates: validateLabels + validateRepo
- Called before every CLI invocation

## Application Sites

| Case | CLI | Labels | Repo | Title/Body |
|------|-----|--------|------|------------|
| create-issue | gh | validated individually per `--label` push | validated | sanitized |
| create-issue | az | N/A | N/A | sanitized |
| add-label | gh | validated (comma-joined) | validated | N/A |
| edit-issue | gh | validated (addLabels + removeLabels) | validated | sanitized |
| edit-issue | az | N/A | N/A | sanitized |

## Error Handling
- All validation errors return `{ ok: false, error: message }` — never throw to the IPC boundary
- Error messages include the invalid value for debugging
