# Tasks: gh-82-detect-install-loop-task

- [x] 1.1 Extend the shared probe and progress contract with loop-task command detection and dedicated install consent state <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Update the SSH probe to detect the loop-task command and require Node.js 20 or newer <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ssh-probe.ts] -->
- [x] 2.1 Preserve remote stdout, stderr, and installer or daemon log output in loop-task launch failures <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ssh-launch.ts] -->
- [ ] 2.2 Add the explicit missing-loop-task install-and-start checkpoint to the SSH wizard while leaving local onboarding unchanged <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.1], touches: [src/main/vm-wizard.ts] -->
- [ ] 3.1 Render dedicated install-loop-task, retry, and cancel actions with actual failure output in the add-machine wizard <!-- agent: frontend-engineer.build, depends_on: [1.1, 2.2], touches: [src/renderer/src/components/AddVmWizard.tsx] -->
- [ ] 3.2 Add localized copy for loop-task detection, install/start consent, retry, and diagnostic output <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 4.1 Add focused Vitest coverage for command detection, Node 20 enforcement, install/start success, diagnostic failure output, retry readiness, and local-path exclusion <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.2, 3.1], touches: [tests/ssh-loop-task-onboarding.test.ts, tests/vm-wizard-runtime.test.ts] -->
- [ ] 5.1 Run the focused tests, full Vitest suite, typecheck, and production build; fix regressions <!-- agent: frontend-engineer.fast, depends_on: [4.1, 3.2], touches: [] -->
