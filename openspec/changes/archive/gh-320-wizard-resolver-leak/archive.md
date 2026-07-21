# gh-320: Wizard resolver closures leak on mid-step errors

## Completed

Wrapped all four resolver closures in `src/main/vm-wizard.ts` with `try/finally` blocks that nullify the resolver on any exit path (normal return, throw, cancel):

- `askConsent` → `consentResolver`
- `askServiceSelection` → `serviceSelectionResolver`
- Inline `runtimeConsentResolver` Promise
- Inline `hostKeyResolver` Promise

Also fixed pre-existing test gaps in `tests/vm-wizard-runtime.test.ts` (missing `isHostInKnownHosts`, `setEnvironmentRuntimeState`, and `runtime-adapter` mocks).

Added `tests/vm-wizard-resolver-cleanup.test.ts` with 6 tests covering:
- consentResolver null after throw and after normal completion
- serviceSelectionResolver null after post-selection failure
- hostKeyResolver null after host key rejection
- runtimeConsentResolver null after skip
- Wizard retry after mid-step exception works without deadlock
