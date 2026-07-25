import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { GlobalSettings, AgentRuntime, Environment } from "../../../shared/ipc";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  onUpdateSettings: (updates: Partial<GlobalSettings>) => void;
  environments: Environment[];
  /** Current notification mute state (managed separately in App.tsx) */
  notificationMuted: boolean;
  /** Toggle notification mute */
  onToggleNotificationMute: () => void;
  /** Change the config-home VM (same as main-VM) */
  onSetMainVm: (environmentId: string) => void;
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onUpdateSettings,
  environments,
  notificationMuted,
  onToggleNotificationMute,
  onSetMainVm,
}: SettingsPanelProps): React.ReactNode {
  const { t } = useTranslation();

  // Local state for ephemeral threshold (debounced on blur/enter)
  const [thresholdInput, setThresholdInput] = useState(
    String(settings.ephemeralThresholdHours),
  );

  useEffect(() => {
    setThresholdInput(String(settings.ephemeralThresholdHours));
  }, [settings.ephemeralThresholdHours]);

  const handleThemeChange = useCallback(
    (theme: GlobalSettings["theme"]) => {
      onUpdateSettings({ theme });
    },
    [onUpdateSettings],
  );

  const handleRuntimeChange = useCallback(
    (runtime: AgentRuntime) => {
      onUpdateSettings({ defaultAgentRuntime: runtime });
    },
    [onUpdateSettings],
  );

  const handleConfigHomeChange = useCallback(
    (envId: string) => {
      if (envId === "__none__") {
        onUpdateSettings({ configHomeVmId: null });
      } else {
        onUpdateSettings({ configHomeVmId: envId });
        onSetMainVm(envId);
      }
    },
    [onUpdateSettings, onSetMainVm],
  );

  const handleThresholdCommit = useCallback(() => {
    const parsed = parseInt(thresholdInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 168) {
      if (parsed !== settings.ephemeralThresholdHours) {
        onUpdateSettings({ ephemeralThresholdHours: parsed });
      }
    } else {
      // Reset to current value on invalid input
      setThresholdInput(String(settings.ephemeralThresholdHours));
    }
  }, [thresholdInput, settings.ephemeralThresholdHours, onUpdateSettings]);

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{t("settings.close")}</SheetDescription>
        </SheetHeader>

        <div className="settings-body">
          {/* Theme */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("settings.theme")}</span>
              <span className="settings-row-desc">{t("settings.themeDesc")}</span>
            </div>
            <div className="segmented">
              <button
                className={`segment${settings.theme === "dark" ? " active" : ""}`}
                onClick={() => handleThemeChange("dark")}
              >
                {t("settings.themeDark")}
              </button>
              <button
                className={`segment${settings.theme === "light" ? " active" : ""}`}
                onClick={() => handleThemeChange("light")}
              >
                {t("settings.themeLight")}
              </button>
              <button
                className={`segment${settings.theme === "system" ? " active" : ""}`}
                onClick={() => handleThemeChange("system")}
              >
                {t("settings.themeSystem")}
              </button>
            </div>
          </div>

          {/* Default Agent Runtime */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("settings.defaultAgent")}</span>
              <span className="settings-row-desc">{t("settings.defaultAgentDesc")}</span>
            </div>
            <div className="segmented">
              <button
                className={`segment${settings.defaultAgentRuntime === "opencode" ? " active" : ""}`}
                onClick={() => handleRuntimeChange("opencode")}
              >
                {t("agentSwitcher.opencode")}
              </button>
              <button
                className={`segment${settings.defaultAgentRuntime === "claude" ? " active" : ""}`}
                onClick={() => handleRuntimeChange("claude")}
              >
                {t("agentSwitcher.claude")}
              </button>
            </div>
          </div>

          {/* Config-home VM */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("settings.configHome")}</span>
              <span className="settings-row-desc">{t("settings.configHomeDesc")}</span>
            </div>
            <select
              className="settings-select"
              value={settings.configHomeVmId ?? "__none__"}
              onChange={(e) => handleConfigHomeChange(e.target.value)}
            >
              <option value="__none__">{t("settings.configHomeNone")}</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                  {env.role === "main-vm" ? ` (${t("settings.configHomeCurrent")})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Notification mute */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("settings.notifications")}</span>
              <span className="settings-row-desc">{t("settings.notificationsDesc")}</span>
            </div>
            <button
              className={`settings-toggle${notificationMuted ? " active" : ""}`}
              onClick={onToggleNotificationMute}
              role="switch"
              aria-checked={notificationMuted}
              title={
                notificationMuted
                  ? t("app.unmuteNotifications")
                  : t("app.muteNotifications")
              }
            >
              <span className="settings-toggle-dot" />
            </button>
          </div>

          {/* Ephemeral threshold */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("settings.ephemeralThreshold")}</span>
              <span className="settings-row-desc">{t("settings.ephemeralThresholdDesc")}</span>
            </div>
            <div className="settings-threshold-input-wrap">
              <input
                type="number"
                className="settings-threshold-input"
                min={1}
                max={168}
                step={1}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                onBlur={handleThresholdCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleThresholdCommit();
                }}
              />
              <span className="settings-threshold-unit">{t("settings.hours")}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
