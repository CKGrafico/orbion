# Fleet Health Footer — Component Spec

## Component: `FleetHealthFooter`

### Props
```typescript
interface FleetHealthFooterProps {
  environments: { id: string; name: string }[];
  health: Record<string, EnvironmentHealth>;
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvProjects: Record<string, Project[]>;
  onNavigateToLoop: (envId: string, loopId: string) => void;
  onNavigateToProject: (envId: string, projectId: string) => void;
  onNavigateToInbox: () => void;
  onSelectEnvironment: (envId: string) => void;
}
```

### Computed values
1. **instanceCount**: `environments.length`
2. **connectedCount**: environments where `health[env.id] === "ok"`
3. **failedLoops**: loops where `loopStatusToFleetItem(status, lastExitCode) === "failed"` across reachable instances
4. **unreachableEnvs**: environments where health is `"offline"` | `"blocked"` | `"unknown"`
5. **failedLoopDetails**: array of `{ envId, envName, projectId, loopId, loopDescription }` for each failing loop
6. **unreachableEnvDetails**: array of `{ envId, envName }` for each unreachable environment

### Rendering
- Always visible row in the sidebar footer area
- Left section:
  - Instance count + connected summary: "3 instances · 2 connected" (muted text)
  - Failure pill (conditional): "1 loop failing" or "{N} loops failing" — danger-styled background/text
  - Unreachable pill (conditional): "1 unreachable" or "{N} unreachable" — distinct muted/warning styled
- The `FleetActivityReadout` stays to the right

### Click behavior
- **Failure pill click**:
  - Exactly 1 failing loop → `onNavigateToLoop(envId, loopId)`
  - Multiple failures within same project → `onNavigateToProject(envId, projectId)`  
  - Multiple failures across projects/envs → `onNavigateToInbox()`
- **Unreachable pill click**: `onSelectEnvironment(firstUnreachableEnvId)`

### Styling
- Pills use `var(--danger)` tinted background for failures, `var(--health-unknown)` tinted background for unreachable
- Cursor pointer, hover brightens
- Compact sizing matching existing sidebar footer elements
