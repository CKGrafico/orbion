import type { LoopTaskBridge } from "../../shared/ipc";

declare global {
  interface Window {
    api: LoopTaskBridge;
  }
}
