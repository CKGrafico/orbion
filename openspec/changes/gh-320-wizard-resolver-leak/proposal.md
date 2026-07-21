# gh-320: Wizard resolver closures leak on mid-step errors

## Problem

Module-level mutable resolver closures (`consentResolver`, `serviceSelectionResolver`, `runtimeConsentResolver`, `hostKeyResolver`) in `src/main/vm-wizard.ts` are only nulled by `resetWizardState()`, called at the top of `runWizard()`. If the wizard throws mid-step (network timeout, SSH auth failure, daemon crash), the current resolver stays assigned. On the next `runWizard()` call, `resetWizardState()` clears them, but if the renderer sends a response between the exception and the next start, `respondConsent()` resolves the orphaned Promise from the previous run. The new wizard step never gets its answer, causing silent UI deadlock.

## Fix

Wrap each `await new Promise(resolve => { resolver = resolve; })` in `try/finally` that nullifies the resolver on any exit (normal return, throw, cancel). Apply to all four resolver closures: `askConsent`, `askServiceSelection`, `askHostKey`, and the inline `runtimeConsentResolver` Promise.

## Tasks

- [ ] 1.1 Wrap askConsent resolver in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.2 Wrap askServiceSelection resolver in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.3 Wrap hostKeyResolver inline Promise in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 1.4 Wrap runtimeConsentResolver inline Promise in try/finally for cleanup <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/vm-wizard.ts] -->
- [ ] 2.1 Add unit tests for resolver cleanup on exception <!-- agent: frontend-engineer.build, depends_on: [1.1,1.2,1.3,1.4], touches: [tests/vm-wizard-resolver-cleanup.test.ts] -->
- [ ] 3.1 Run typecheck and fix errors <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
