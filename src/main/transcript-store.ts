import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { TranscriptMessage, ToolCallRecord } from "../shared/ipc.js";

// ---------------------------------------------------------------------------
// Per-session file storage for chat transcripts
// ---------------------------------------------------------------------------

let _transcriptDir: string | null = null;

function getTranscriptDir(): string {
  if (!_transcriptDir) {
    _transcriptDir = path.join(app.getPath("userData"), "transcripts");
    fs.mkdirSync(_transcriptDir, { recursive: true });
  }
  return _transcriptDir;
}

function sessionFilePath(sessionId: string): string {
  // Sanitize sessionId to prevent path traversal
  const safeId = sessionId.replace(/[^a-zA-Z0-9\-_]/g, "_");
  return path.join(getTranscriptDir(), `${safeId}.json`);
}

// ---------------------------------------------------------------------------
// Write serialization per session
// ---------------------------------------------------------------------------

const writeQueues = new Map<string, Promise<void>>();

function serializeSession<T>(sessionId: string, fn: () => T): Promise<T> {
  const current = writeQueues.get(sessionId) ?? Promise.resolve();
  const next = current.then(() => fn());
  writeQueues.set(
    sessionId,
    next.then(
      () => undefined,
      (err) => {
        console.error(`[transcript-store] serialized write failed for session ${sessionId}:`, err);
      },
    ),
  );
  return next;
}

// ---------------------------------------------------------------------------
// Debounced writes for streaming updates
// ---------------------------------------------------------------------------

const pendingWrites = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 200;

function scheduleFlush(sessionId: string): void {
  const existing = pendingWrites.get(sessionId);
  if (existing) clearTimeout(existing);

  pendingWrites.set(
    sessionId,
    setTimeout(() => {
      pendingWrites.delete(sessionId);
      // The debounce is only a signal to allow batching; actual writes
      // happen through the serializeSession queue. Nothing extra to flush
      // because every mutation already writes immediately through the queue.
    }, DEBOUNCE_MS),
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function readSessionFile(sessionId: string): TranscriptMessage[] {
  const filePath = sessionFilePath(sessionId);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TranscriptMessage[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function writeSessionFile(sessionId: string, messages: TranscriptMessage[]): void {
  const filePath = sessionFilePath(sessionId);
  if (messages.length === 0) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist
    }
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(messages), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getMessages(sessionId: string): TranscriptMessage[] {
  return readSessionFile(sessionId);
}

export function appendMessage(message: Omit<TranscriptMessage, "createdAt">): Promise<TranscriptMessage> {
  return serializeSession(message.sessionId, () => {
    const messages = readSessionFile(message.sessionId);
    const withTimestamp: TranscriptMessage = {
      ...message,
      createdAt: new Date().toISOString(),
    };
    messages.push(withTimestamp);
    writeSessionFile(message.sessionId, messages);
    scheduleFlush(message.sessionId);
    return withTimestamp;
  });
}

export function appendMessages(batch: Array<Omit<TranscriptMessage, "createdAt">>): Promise<TranscriptMessage[]> {
  if (batch.length === 0) return Promise.resolve([]);

  // All messages in a batch must belong to the same session
  const sessionId = batch[0].sessionId;

  return serializeSession(sessionId, () => {
    const messages = readSessionFile(sessionId);
    const withTimestamps: TranscriptMessage[] = batch.map((msg) => ({
      ...msg,
      createdAt: new Date().toISOString(),
    }));
    messages.push(...withTimestamps);
    writeSessionFile(sessionId, messages);
    scheduleFlush(sessionId);
    return withTimestamps;
  });
}

export function updateMessage(
  messageId: string,
  updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>,
): Promise<void> {
  // We need to find which session holds this message. Scan known session files.
  // For efficiency, the caller should also pass sessionId, but the IPC bridge
  // only passes messageId + updates. We search the transcript directory.
  return findSessionForMessage(messageId).then((sessionId) => {
    if (!sessionId) return;

    return serializeSession(sessionId, () => {
      const messages = readSessionFile(sessionId);
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      messages[idx] = { ...messages[idx], ...updates };
      writeSessionFile(sessionId, messages);
      scheduleFlush(sessionId);
    });
  });
}

/** Update a message when the session is already known (avoids file scanning). */
export function updateMessageInSession(
  sessionId: string,
  messageId: string,
  updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>,
): Promise<void> {
  return serializeSession(sessionId, () => {
    const messages = readSessionFile(sessionId);
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    messages[idx] = { ...messages[idx], ...updates };
    writeSessionFile(sessionId, messages);
    scheduleFlush(sessionId);
  });
}

export function deleteSession(sessionId: string): Promise<void> {
  return serializeSession(sessionId, () => {
    const filePath = sessionFilePath(sessionId);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Already deleted or not accessible
    }
  });
}

// ---------------------------------------------------------------------------
// Message lookup helper
// ---------------------------------------------------------------------------

async function findSessionForMessage(messageId: string): Promise<string | null> {
  const dir = getTranscriptDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const sessionId = file.slice(0, -".json".length);
    try {
      const messages = readSessionFile(sessionId);
      if (messages.some((m) => m.id === messageId)) {
        return sessionId;
      }
    } catch {
      continue;
    }
  }

  return null;
}
