# Spec: add-label infra action

## Main Process

Add `"add-label"` to the `InfraAction` discriminated union in `shared/ipc.ts`.

### Parameters

```ts
interface AddLabelParams {
  /** Issue number on the platform. */
  issueNumber: number;
  /** Label(s) to apply. */
  labels: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
}
```

### Behavior (main/index.ts)

- In the `infra:executeAction` handler, add a `case "add-label"`.
- Validate `issueNumber` and `labels` are present.
- Use `checkPlatformCli()` to find an authenticated `gh` CLI.
- Execute: `gh issue edit <number> --add-label <label1>,<label2> [--repo <repo>]`
- Return `{ ok: true, data: { issueNumber, labels } }` on success.
- Return `{ ok: false, error: ... }` on failure.
