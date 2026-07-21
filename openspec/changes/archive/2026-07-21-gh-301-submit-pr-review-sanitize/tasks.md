# Tasks — gh-301-submit-pr-review-sanitize

- [ ] 1.1 Sanitize body in handleSubmitPrReview: apply `sanitizeText()` to body param, use sanitized value in both gh `--body` and az `--comment` paths, skip arg when sanitized body is empty <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/infra-handlers.ts] -->
- [ ] 1.2 Move validateCliInputs({ repo }) before CLI branch so it covers both gh and az paths <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/main/infra-handlers.ts] -->
- [ ] 2.1 Add test for sanitize behavior in submit-pr-review <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [tests/infra-handlers.test.ts] -->
- [ ] 3.1 Run typecheck and fix errors <!-- agent: frontend-engineer.fast, depends_on: [1.2, 2.1], touches: [] -->
