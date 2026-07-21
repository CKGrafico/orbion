# Tasks

- [ ] 1.1 Wrap askConsent resolver in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.2 Wrap askServiceSelection resolver in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.3 Wrap hostKeyResolver inline Promise in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.4 Wrap runtimeConsentResolver inline Promise in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 2.1 Add unit tests for resolver cleanup on exception <!-- agent: frontend-engineer.build, depends_on: [1.1,1.2,1.3,1.4], touches: [tests/vm-wizard-resolver-cleanup.test.ts] -->
- [ ] 3.1 Run typecheck and fix errors <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
