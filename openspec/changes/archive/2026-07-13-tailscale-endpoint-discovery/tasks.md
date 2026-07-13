# Tasks: tailscale-endpoint-discovery

## Completed

- [x] T1: Add TailscalePeer/TailscalePeersResponse types and IPC channel to shared/ipc.ts
- [x] T2: Add tailscalePeers to LoopTaskBridge preload contract
- [x] T3: Implement detectTailscaleCLI() and fetchPeers() in main/tailscale.ts with 60s TTL cache
- [x] T4: Register tailscale:peers IPC handler in main/index.ts
- [x] T5: Expose tailscalePeers in preload/index.ts bridge
- [x] T6: Update AddInstanceModal with Tailnet machines section (peer list, port input, probe, save-with-warning)
- [x] T7: Update store.ts add() to pass endpointKind through
- [x] T8: Add CSS for peer list UI components
- [x] T9: Verify build and typecheck pass
