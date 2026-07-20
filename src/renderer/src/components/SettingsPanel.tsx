import { useState, useCallback, useEffect } from "react";
import { useIntl } from "react-intl";
import type { GlobalSettings, AgentRuntime, Environment } from "../../../shared/ipc";
import { X } from "lucide-react";

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
  const intl = useIntl();

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
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{intl.formatMessage({ id: "settings.title" })}</h2>
          <button className="icon-btn" onClick={onClose} title={intl.formatMessage({ id: "settings.close" })}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body">
          {/* Theme */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "settings.theme" })}</span>
              <span className="settings-row-desc">{intl.formatMessage({ id: "settings.themeDesc" })}</span>
            </div>
            <div className="segmented">
              <button
                className={`segment${settings.theme === "dark" ? " active" : ""}`}
                onClick={() => handleThemeChange("dark")}
              >
                {intl.formatMessage({ id: "settings.themeDark" })}
              </button>
              <button
                className="segment disabled"
                title={intl.formatMessage({ id: "settings.themeComingSoon" })}
                style={{ pointerEvents: "none", opacity: 0.4 }}
              >
                {intl.formatMessage({ id: "settings.themeLight" })}
                <span className="settings-soon-badge">{intl.formatMessage({ id: "settings.soon" })}</span>
              </button>
              <button
                className="segment disabled"
                title={intl.formatMessage({ id: "settings.themeComingSoon" })}
                style={{ pointerEvents: "none", opacity: 0.4 }}
              >
                {intl.formatMessage({ id: "settings.themeSystem" })}
                <span className="settings-soon-badge">{intl.formatMessage({ id: "settings.soon" })}</span>
              </button>
            </div>
          </div>

          {/* Default Agent Runtime */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "settings.defaultAgent" })}</span>
              <span className="settings-row-desc">{intl.formatMessage({ id: "settings.defaultAgentDesc" })}</span>
            </div>
            <div className="segmented">
              <button
                className={`segment${settings.defaultAgentRuntime === "opencode" ? " active" : ""}`}
                onClick={() => handleRuntimeChange("opencode")}
              >
                {intl.formatMessage({ id: "agentSwitcher.opencode" })}
              </button>
              <button
                className={`segment${settings.defaultAgentRuntime === "claude" ? " active" : ""}`}
                onClick={() => handleRuntimeChange("claude")}
              >
                {intl.formatMessage({ id: "agentSwitcher.claude" })}
              </button>
            </div>
          </div>

          {/* Config-home VM */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "settings.configHome" })}</span>
              <span className="settings-row-desc">{intl.formatMessage({ id: "settings.configHomeDesc" })}</span>
            </div>
            <select
              className="settings-select"
              value={settings.configHomeVmId ?? "__none__"}
              onChange={(e) => handleConfigHomeChange(e.target.value)}
            >
              <option value="__none__">{intl.formatMessage({ id: "settings.configHomeNone" })}</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                  {env.role === "main-vm" ? ` (${intl.formatMessage({ id: "settings.configHomeCurrent" })})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Notification mute */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "settings.notifications" })}</span>
              <span className="settings-row-desc">{intl.formatMessage({ id: "settings.notificationsDesc" })}</span>
            </div>
            <button
              className={`settings-toggle${notificationMuted ? " active" : ""}`}
              onClick={onToggleNotificationMute}
              role="switch"
              aria-checked={notificationMuted}
              title={
                notificationMuted
                  ? intl.formatMessage({ id: "app.unmuteNotifications" })
                  : intl.formatMessage({ id: "app.muteNotifications" })
              }
            >
              <span className="settings-toggle-dot" />
            </button>
          </div>

          {/* Ephemeral threshold */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "settings.ephemeralThreshold" })}</span>
              <span className="settings-row-desc">{intl.formatMessage({ id: "settings.ephemeralThresholdDesc" })}</span>
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
              <span className="settings-threshold-unit">{intl.formatMessage({ id: "settings.hours" })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
