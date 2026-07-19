# Specification: Merged project node model

## MergedProjectNode

```typescript
interface ProjectInstanceSlice {
  envId: string;
  envName: string;
  projectId: string;
  loops: LoopMeta[];
}

interface MergedProjectNode {
  key: string;              // `merged:${projectName}`
  projectName: string;
  projectColor: string;
  instances: ProjectInstanceSlice[];
  allLoops: LoopMeta[];     // aggregated from every instance
}
```

## Merge algorithm

1. Iterate all environments; for each, collect `(envId, envName, project, loops)` tuples.
2. Merge tuples by `project.name` into a `Map<string, MergedProjectNode>`.
3. First-wins for color (all instances should agree on color for same-named projects).

## Rendering

- **Single-instance project**: same as before — chevron, dot, name, loop count pill.
- **Multi-instance project**: same layout but replaces the old `envName` badge with a numeric instance-count badge. On expand, shows instance group headers (uppercase env name) above each instance's loops.
- **Instance count badge**: uses existing `.tree-instance-badge` class, shows number, title via `sidebar.instanceCount` i18n key.
