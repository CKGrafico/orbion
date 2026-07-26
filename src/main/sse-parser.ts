import { createParser } from "eventsource-parser";
import type { EventSourceMessage } from "eventsource-parser";

export interface SseEvent {
  kind: "data" | "event";
  text: string;
}

export interface SseParser {
  feed(chunk: string): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  const parser = createParser({
    onEvent(message: EventSourceMessage) {
      if (message.event !== undefined && message.event !== "message") {
        onEvent({ kind: "event", text: message.event });
      }
      onEvent({ kind: "data", text: message.data });
    },
  });

  return {
    feed(chunk: string): void {
      parser.feed(chunk);
    },
  };
}

export async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const parser = createSseParser(onEvent);

  const decoder = new TextDecoder();

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
}
