# tasks.md

## Tasks

- [ ] 1.1 Fix scheduleTunnelReconnect to look up fresh registry entry after openTunnelForEndpoint returns <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/tunnel-registry.ts] -->
- [ ] 1.2 Add regression test verifying stale-entry reconnect state drift is fixed <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/tunnel-reconnect.test.ts] -->
- [ ] 1.3 Run pnpm typecheck and pnpm vitest to verify <!-- agent: frontend-engineer.fast, depends_on: [1.1, 1.2], touches: [] -->
