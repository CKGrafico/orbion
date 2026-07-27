# Proposal: Fix transcript-store findSessionForMessage O(n*m) scan

## Summary

Replace the full-directory scan in `findSessionForMessage` with an in-memory reverse index (`messageId → sessionId`) so `updateMessage` does O(1) lookup instead of reading every session file.

## Problem

`updateMessage(messageId, updates)` calls `findSessionForMessage` which:

1. Reads all files in the transcript directory (`fs.readdirSync`)
2. For each `.json` file, reads and parses the entire file (`readSessionFile`)
3. Searches every message in the file for a matching `messageId`

This is O(n * m) where n = number of session files and m = average messages per session. During agent streaming, `updateMessage` is called frequently (tool-call progress, content deltas, finishedAt timestamps). A burst of updates creates compounding quadratic scans.

With many sessions (100+ × 50+ messages each), each `updateMessage` reads and parses ~5MB of JSON across 100 files. Under load: latency spikes, EMFILE risk from synchronous file I/O, writeQueues pile up.

## Fix

Add a module-level `Map<string, string>` (`messageId → sessionId`) populated lazily:

- `appendMessage` / `appendMessages` — already have sessionId and messageId. Index after write.
- `findSessionForMessage` — Map lookup first; on miss, fall back to directory scan and index all messages from scanned files.
- `deleteSession` — remove all entries for that sessionId from the index.
- `updateMessageInSession` — index the messageId→sessionId mapping since sessionId is known.

No IPC changes. No new files. One file changed: `src/main/transcript-store.ts`.

## Scope

- Scope classification: **focused**
- Affected files: `src/main/transcript-store.ts`
- Issue: #396
