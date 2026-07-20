# gh-exec.ts API

## ghExec(options)

```ts
interface GhExecOptions {
  args: string[];
  cli?: "gh" | "az";
  preferredCli?: "gh" | "az" | null;
  i18nPrefix: "issues" | "editIssue" | "labels" | "review";
  maxBuffer?: number;
  requireGh?: boolean;
  validateInputs?: { title?: string; body?: string; labels?: string[]; repo?: string | undefined };
}

function ghExec(options: GhExecOptions): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: I18nMessage }>
```

Resolves platform CLI, validates inputs, runs `execFile`, handles ENOENT and error mapping. Returns parsed stdout on success, i18n error on failure.

When `requireGh` is true, returns error if resolved CLI is not `gh`.

## Sanitization exports

- `validateLabels(labels: string[]): void`
- `validateRepo(repo: string | undefined): void`
- `sanitizeText(value: string): string`
- `validateCliInputs(opts: { title?: string; body?: string; labels?: string[]; repo?: string | undefined }): void`
- `LABEL_RE`, `REPO_RE`, `CONTROL_CHAR_RE` (regexes)
