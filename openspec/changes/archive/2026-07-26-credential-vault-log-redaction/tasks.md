## 1. Log redaction

- [ ] 1.1 Remove `reference` argument from `logger.info` at line 87 in `src/main/credential-vault.ts` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/credential-vault.ts] -->
- [ ] 1.2 Remove `reference` argument from `logger.error` at line 93 in `src/main/credential-vault.ts` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/credential-vault.ts] -->
- [ ] 1.3 Remove `orphans` array argument from `logger.warn` at line 124 in `src/main/credential-vault.ts` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/credential-vault.ts] -->

## 2. Verification

- [ ] 2.1 Run `pnpm typecheck`, `pnpm test`, and `pnpm build` — all must pass <!-- agent: frontend-engineer.fast, depends_on: [1.1,1.2,1.3], touches: [] -->
