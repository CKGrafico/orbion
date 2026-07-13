# Tasks: vm-wizard-ssh-bootstrap

## Completed

- [x] T1: Add VM wizard types (VmWizardStep, SshHost, VmWizardProbeResult, VmWizardLaunchResult, VmWizardTunnelResult, VmWizardPairResult, VmWizardProgress, VmWizardResult, VmWizardBridge) to shared/ipc.ts and wire into LoopTaskBridge
- [x] T2: Implement SSH config parser (listSshHosts, parseTarget, buildSshArgs) in main/ssh-config.ts
- [x] T3: Implement SSH probe module (probeVm, Node version manager detection for nvm/fnm/asdf/mise/volta, daemon/opencode running check, error classification) in main/ssh-probe.ts
- [x] T4: Implement SSH remote launcher (launchOnVm, createPairingCodeOnRemote, readRemoteLog, launch state dir ~/.orbion/ssh-launch/<hash>/{pid,port,log,.managed}) in main/ssh-launch.ts
- [x] T5: Implement SSH tunnel forwarder with keepalives (openTunnel, closeTunnel, ServerAliveInterval) in main/ssh-tunnel.ts
- [x] T6: Implement add-VM wizard orchestrator (runWizard: probe→install→forward→pair→save environment, progress emission, cancellation) in main/vm-wizard.ts
- [x] T7: Register vmWizard:listSshHosts, vmWizard:start, vmWizard:cancel IPC handlers in main/index.ts
- [x] T8: Add vmWizard bridge to preload/index.ts
- [x] T9: Add AddVmWizard renderer component with step progress bar, SSH host picker, probe details, log tail display
- [x] T10: Wire AddVmWizard into App.tsx (vmWizardOpen state, handleVmWizardDone callback)
- [x] T11: Add "Add VM wizard" button to Sidebar with terminal icon
- [x] T12: Add terminal and check icons to Icon.tsx
- [x] T13: Verify typecheck passes
