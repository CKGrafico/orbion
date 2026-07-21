## 1. Extend detectPlatform return type

- [x] 1.1 Add `PlatformDetection` interface to `platform-classifier.ts` and change `detectPlatform()` return type from `Promise<PlatformType>` to `Promise<PlatformDetection>`. On error return `{ platform: "unknown", remotes: [] }`; on success return `{ platform: classifyPlatform(urls), remotes: urls }`. <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/platform-classifier.ts] -->

## 2. Remove duplicate git spawn in infra-handlers

- [x] 2.1 In `infra-handlers.ts` `detect-platform` case, destructure `const { platform, remotes } = await detectPlatform(directory)` and remove the standalone `execFile("git", ["remote", "-v"])` + `parseGitRemoteOutput()` block (lines 550-560). Keep the same `PlatformDetectionResult` shape for the IPC response. <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/main/infra-handlers.ts] -->

## 3. Verify

- [x] 3.1 Run `pnpm typecheck` and `pnpm vitest` to confirm no regressions. <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
