# Tasks

- [ ] 1.1 Replace `!==` comparison with `timingSafeEqual` in `getCredential()` and add import <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/credential-vault.ts] -->
- [ ] 2.1 Add test verifying constant-time comparison behavior <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/credential-vault.test.ts] -->
- [ ] 3.1 Run typecheck and existing tests <!-- agent: frontend-engineer.fast, depends_on: [1.1, 2.1], touches: [] -->
