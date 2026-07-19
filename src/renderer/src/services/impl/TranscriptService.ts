import { injectable } from "inversify-hooks";
import type { TranscriptMessage } from "../../../../shared/ipc";
import type { ITranscriptService } from "../interfaces";

@injectable()
export class TranscriptService implements ITranscriptService {
  private get api() {
    return window.api!.transcript;
  }

  async getMessages(sessionId: string): Promise<TranscriptMessage[]> {
    return this.api.getMessages(sessionId);
  }

  async appendMessage(message: Omit<TranscriptMessage, "createdAt">): Promise<TranscriptMessage> {
    return this.api.appendMessage(message);
  }

  async appendMessages(messages: Array<Omit<TranscriptMessage, "createdAt">>): Promise<TranscriptMessage[]> {
    return this.api.appendMessages(messages);
  }

  async updateMessage(messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>): Promise<void> {
    return this.api.updateMessage(messageId, updates);
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.api.deleteSession(sessionId);
  }
}
