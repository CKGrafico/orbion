## 1. Stream cleanup on renderer destruction

- [ ] 1.1 Change `streams` Map type from `Map<string, AbortController>` to `Map<string, { controller: AbortController; sender: Electron.WebContents }>` and update all read/write sites (handleStreamSubscribe, stream:unsubscribe, abortStreamsForEnvironment, window-all-closed) <!-- agent: fullstack-engineer, depends_on: [], touches: [src/main/index.ts] -->
- [ ] 1.2 Add `sender.once("destroyed", ...)` listener in `handleStreamSubscribe` after creating the AbortController, aborting the controller and deleting both Map entries <!-- agent: fullstack-engineer, depends_on: [1.1], touches: [src/main/index.ts] -->

## 2. Tests and verification

- [ ] 2.1 Write Vitest test for `handleStreamSubscribe` renderer-destroyed cleanup (mock WebContents destroyed event, verify AbortController aborted, Maps cleaned) <!-- agent: fullstack-engineer, depends_on: [1.2], touches: [tests/sse-stream-cleanup.test.ts] -->
- [ ] 2.2 Run `pnpm typecheck` and `pnpm vitest` to verify no regressions <!-- agent: fullstack-engineer, depends_on: [2.1], touches: [] -->
