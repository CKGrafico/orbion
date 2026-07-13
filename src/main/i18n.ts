import type { I18nMessage } from "../shared/ipc.js";

export function msg(key: string, params?: Record<string, string | number>): I18nMessage {
  return { key, params };
}
