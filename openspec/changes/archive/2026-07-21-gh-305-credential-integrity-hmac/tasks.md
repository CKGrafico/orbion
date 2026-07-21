# Tasks

- [ ] 1.1 Add vault key derivation, HMAC computation, and CredentialTamperedError to credential-vault.ts <!-- agent: general.build, depends_on: [], touches: [src/main/credential-vault.ts] -->
- [ ] 1.2 Update storeCredential() to compute and store HMAC alongside encryptedValue <!-- agent: general.build, depends_on: [1.1], touches: [src/main/credential-vault.ts] -->
- [ ] 1.3 Update getCredential() to verify HMAC before decrypting, throw CredentialTamperedError on mismatch, and migrate old records without HMAC <!-- agent: general.build, depends_on: [1.1], touches: [src/main/credential-vault.ts] -->
- [ ] 2.1 Update getSessionToken() and getSshKeyPassphrase() in config-store.ts to catch CredentialTamperedError and set auth state to blocked <!-- agent: general.build, depends_on: [1.3], touches: [src/main/config-store.ts] -->
- [ ] 2.2 Add "hmac" to SECRET_FIELD_NAMES and update sync allowlists <!-- agent: general.fast, depends_on: [1.3], touches: [src/main/config-store.ts] -->
- [ ] 3.1 Add tests: HMAC stored on write, verified on read, tamper detection throws, migration of old records <!-- agent: general.build, depends_on: [1.3, 2.1], touches: [tests/credential-vault.test.ts] -->
- [ ] 3.2 Add test: SECRET_FIELD_NAMES includes hmac <!-- agent: general.fast, depends_on: [2.2], touches: [tests/credential-vault.test.ts] -->
- [ ] 4.1 Run typecheck and fix errors <!-- agent: general.fast, depends_on: [2.1, 2.2, 3.1, 3.2], touches: [] -->
