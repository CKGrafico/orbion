import { injectable } from "inversify-hooks";
import type { AgentSendPromptArgs, AgentSendPromptResult, AgentStreamEvent, ListModelsResult } from "../../../../shared/ipc";
import type { IAgentService } from "../interfaces";

@injectable()
export class AgentService implements IAgentService {
  private get api() {
    return window.api!.agent;
  }

  async sendPrompt(args: AgentSendPromptArgs): Promise<AgentSendPromptResult> {
    return this.api.sendPrompt(args);
  }

  async interrupt(environmentId: string, sessionId?: string): Promise<void> {
    return this.api.interrupt(environmentId, sessionId);
  }

  onStreamEvent(cb: (event: AgentStreamEvent) => void): () => void {
    return this.api.onStreamEvent(cb);
  }

  async listModels(environmentId: string): Promise<ListModelsResult> {
    return this.api.listModels(environmentId);
  }
}
