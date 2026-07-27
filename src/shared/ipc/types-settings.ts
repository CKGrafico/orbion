import type { GlobalSettings } from "./types-config.js";

export interface SettingsBridge {
  getSettings: () => Promise<GlobalSettings>;
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>;
}
