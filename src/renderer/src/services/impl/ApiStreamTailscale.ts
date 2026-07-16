import { injectable } from "inversify-hooks";
import type { ApiRequestArgs, ApiResponse, StreamSubscribeArgs, StreamEventPayload, TailscalePeersResponse } from "../../../../shared/ipc";
import type { IApiService, IStreamService, ITailscaleService } from "../interfaces";

@injectable()
export class ApiService implements IApiService {
  async request<T = unknown>(args: ApiRequestArgs): Promise<ApiResponse<T>> {
    return window.api!.request<T>(args);
  }
}

@injectable()
export class StreamService implements IStreamService {
  async subscribeStream(args: StreamSubscribeArgs): Promise<void> {
    return window.api!.subscribeStream(args);
  }
  async unsubscribeStream(subId: string): Promise<void> {
    return window.api!.unsubscribeStream(subId);
  }
  onStreamEvent(cb: (payload: StreamEventPayload) => void): () => void {
    return window.api!.onStreamEvent(cb);
  }
}

@injectable()
export class TailscaleService implements ITailscaleService {
  async getPeers(): Promise<TailscalePeersResponse> {
    return window.api!.tailscalePeers();
  }
}
