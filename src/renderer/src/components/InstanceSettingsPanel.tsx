import { useState, useCallback } from "react";
import { useIntl } from "react-intl";
import type { AgentRuntime, Environment, EndpointKind, AccessEndpoint } from "../../../shared/ipc";
import { Settings, Trash2, Plus, X, Check, Globe, Terminal } from "lucide-react";
import { translateMessage } from "../i18n";

interface InstanceSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  environment: Environment | null;
  onUpdateEnvironment: (id: string, updates: { name?: string; agentRuntime?: AgentRuntime }) => void;
  onAddEndpoint: (environmentId: string, url: string, kind: EndpointKind) => void;
  onRemoveEndpoint: (environmentId: string, endpointId: string) => void;
  onSetActiveEndpoint: (environmentId: string, endpointId: string) => void;
  onRemoveEnvironment: (id: string) => void;
  onExchangePairingCode: (baseUrl: string, code: string) => Promise<{ ok: boolean; error?: unknown }>;
  onRemoveSessionToken: (environmentId: string) => void;
}

export function InstanceSettingsPanel({
  open,
  onClose,
  environment,
  onUpdateEnvironment,
  onAddEndpoint,
  onRemoveEndpoint,
  onSetActiveEndpoint,
  onRemoveEnvironment,
  onExchangePairingCode,
  onRemoveSessionToken,
}: InstanceSettingsPanelProps): React.ReactNode {
  const intl = useIntl();

  const [nameInput, setNameInput] = useState("");
  const [nameDirty, setNameDirty] = useState(false);

  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newEndpointKind, setNewEndpointKind] = useState<EndpointKind>("direct");

  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeEndpointId, setRemoveEndpointId] = useState<string | null>(null);

  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [clearCredConfirm, setClearCredConfirm] = useState(false);

  const activeEndpoint = environment?.endpoints.find((ep) => ep.id === environment.activeEndpointId);

  const syncName = useCallback(() => {
    if (environment) {
      setNameInput(environment.name);
      setNameDirty(false);
    }
  }, [environment]);

  if (!open || !environment) return null;

  const handleNameCommit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== environment.name) {
      onUpdateEnvironment(environment.id, { name: trimmed });
    }
    setNameDirty(false);
  };

  const handleRuntimeChange = (runtime: AgentRuntime) => {
    if (runtime !== environment.agentRuntime) {
      onUpdateEnvironment(environment.id, { agentRuntime: runtime });
    }
  };

  const handleAddEndpoint = () => {
    const url = newEndpointUrl.trim();
    if (!url) return;
    onAddEndpoint(environment.id, url, newEndpointKind);
    setNewEndpointUrl("");
  };

  const handleRemoveEndpoint = (endpointId: string) => {
    onRemoveEndpoint(environment.id, endpointId);
    setRemoveEndpointId(null);
  };

  const handlePair = async () => {
    if (!pairingCode.trim() || !activeEndpoint) return;
    setPairingBusy(true);
    setPairingError(null);
    try {
      const result = await onExchangePairingCode(activeEndpoint.url, pairingCode.trim());
      if (!result.ok) {
        setPairingError(
          typeof result.error === "string"
            ? result.error
            : result.error && typeof result.error === "object" && "key" in result.error
              ? translateMessage(intl, result.error as { key: string; params?: Record<string, string | number> })
              : intl.formatMessage({ id: "instanceSettings.pairingCode" }),
        );
      } else {
        setPairingCode("");
      }
    } catch {
      setPairingError(intl.formatMessage({ id: "instanceSettings.pairingCode" }));
    }
    setPairingBusy(false);
  };

  const handleRemoveInstance = () => {
    if (!removeConfirm) {
      setRemoveConfirm(true);
      return;
    }
    onRemoveEnvironment(environment.id);
    setRemoveConfirm(false);
    onClose();
  };

  const authStateLabel = (state: string | undefined) => {
    switch (state) {
      case "paired": return intl.formatMessage({ id: "instanceSettings.authStateAuthenticated" });
      case "unauthenticated": return intl.formatMessage({ id: "instanceSettings.authStateUnauthenticated" });
      case "blocked": return intl.formatMessage({ id: "instanceSettings.authStateBlocked" });
      default: return intl.formatMessage({ id: "instanceSettings.authStateUnknown" });
    }
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{intl.formatMessage({ id: "instanceSettings.title" })}</h2>
          <button className="icon-btn" onClick={() => { syncName(); onClose(); }} title={intl.formatMessage({ id: "settings.close" })}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body">
          {/* Instance name */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.nameLabel" })}</span>
            </div>
            <input
              className="settings-threshold-input"
              style={{ width: "100%" }}
              value={nameDirty ? nameInput : environment.name}
              onChange={(e) => { setNameInput(e.target.value); setNameDirty(true); }}
              onBlur={handleNameCommit}
              onKeyDown={(e) => { if (e.key === "Enter") handleNameCommit(); }}
            />
          </div>

          {/* ── Reach section ── */}
          <div className="settings-section-header">
            <Settings size={13} />
            <span className="settings-section-title">{intl.formatMessage({ id: "instanceSettings.reachSection" })}</span>
          </div>
          <div className="settings-row-description">{intl.formatMessage({ id: "instanceSettings.reachSectionDesc" })}</div>

          <div className="settings-endpoints">
            {environment.endpoints.length === 0 ? (
              <div className="settings-endpoint-empty">{intl.formatMessage({ id: "instanceSettings.noEndpoints" })}</div>
            ) : (
              environment.endpoints.map((ep) => (
                <div key={ep.id} className="settings-endpoint-row">
                  <span className="settings-endpoint-kind">
                    {ep.kind === "ssh" ? <Terminal size={12} /> : <Globe size={12} />}
                    <span>{ep.kind}</span>
                  </span>
                  <span className="settings-endpoint-url mono" title={ep.url}>{ep.url}</span>
                  {ep.id === environment.activeEndpointId ? (
                    <span className="settings-endpoint-active">{intl.formatMessage({ id: "instanceSettings.activeEndpoint" })}</span>
                  ) : (
                    <button
                      className="btn settings-endpoint-action"
                      onClick={() => onSetActiveEndpoint(environment.id, ep.id)}
                    >
                      {intl.formatMessage({ id: "instanceSettings.switchActive" })}
                    </button>
                  )}
                  {removeEndpointId === ep.id ? (
                    <div className="settings-endpoint-confirm">
                      <span>{intl.formatMessage({ id: "instanceSettings.removeEndpointConfirm" })}</span>
                      <button className="btn primary" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => handleRemoveEndpoint(ep.id)}>
                        <Check size={10} />
                      </button>
                      <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setRemoveEndpointId(null)}>
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="icon-btn settings-endpoint-remove"
                      onClick={() => setRemoveEndpointId(ep.id)}
                      title={intl.formatMessage({ id: "instanceSettings.removeEndpoint" })}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {ep.lastError ? (
                    <span className="settings-endpoint-error">
                      {typeof ep.lastError === "string" ? ep.lastError : translateMessage(intl, ep.lastError as { key: string; params?: Record<string, string | number> })}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {/* Add endpoint form */}
          <div className="settings-add-endpoint">
            <input
              className="settings-threshold-input"
              style={{ flex: 1 }}
              placeholder={intl.formatMessage({ id: "instanceSettings.endpointUrl" })}
              value={newEndpointUrl}
              onChange={(e) => setNewEndpointUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddEndpoint(); }}
            />
            <select
              className="settings-select"
              style={{ width: 100 }}
              value={newEndpointKind}
              onChange={(e) => setNewEndpointKind(e.target.value as EndpointKind)}
            >
              <option value="direct">direct</option>
              <option value="ssh">ssh</option>
              <option value="tailscale">tailscale</option>
            </select>
            <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={handleAddEndpoint} disabled={!newEndpointUrl.trim()}>
              <Plus size={12} />
            </button>
          </div>

          {/* ── Runtime section ── */}
          <div className="settings-section-header">
            <Settings size={13} />
            <span className="settings-section-title">{intl.formatMessage({ id: "instanceSettings.runtimeSection" })}</span>
          </div>
          <div className="settings-row-description">{intl.formatMessage({ id: "instanceSettings.runtimeSectionDesc" })}</div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.agentRuntime" })}</span>
            </div>
            <div className="segmented">
              {(["opencode", "claude"] as const).map((runtime) => {
                const isSelected = environment.agentRuntime === runtime;
                return (
                  <button
                    key={runtime}
                    className={`segment${isSelected ? " active" : ""}`}
                    onClick={() => handleRuntimeChange(runtime)}
                  >
                    {runtime === "opencode" ? "OpenCode" : "Claude Code"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.runtimeState" })}</span>
            </div>
            <span className="settings-row-desc">{environment.runtimeState ?? "unknown"}</span>
          </div>

          {/* ── Credentials section ── */}
          <div className="settings-section-header">
            <Settings size={13} />
            <span className="settings-section-title">{intl.formatMessage({ id: "instanceSettings.credentialsSection" })}</span>
          </div>
          <div className="settings-row-description">{intl.formatMessage({ id: "instanceSettings.credentialsSectionDesc" })}</div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.authState" })}</span>
            </div>
            <span className="settings-row-desc">{authStateLabel(environment.authState)}</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.repairCode" })}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="settings-threshold-input"
                style={{ width: 140 }}
                placeholder={intl.formatMessage({ id: "instanceSettings.repairCodePlaceholder" })}
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handlePair(); }}
              />
              <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => void handlePair()} disabled={pairingBusy || !pairingCode.trim()}>
                {intl.formatMessage({ id: "instanceSettings.repairSubmit" })}
              </button>
            </div>
          </div>
          {pairingError ? <div className="settings-pairing-error">{pairingError}</div> : null}

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{intl.formatMessage({ id: "instanceSettings.clearCredentials" })}</span>
            </div>
            {clearCredConfirm ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--danger)" }}>{intl.formatMessage({ id: "instanceSettings.clearCredentialsConfirm" })}</span>
                <button className="btn primary" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => { onRemoveSessionToken(environment.id); setClearCredConfirm(false); }}>
                  <Check size={10} />
                </button>
                <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setClearCredConfirm(false)}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setClearCredConfirm(true)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* ── Remove section ── */}
          <div className="settings-section-header" style={{ color: "var(--danger)" }}>
            <Trash2 size={13} />
            <span className="settings-section-title">{intl.formatMessage({ id: "instanceSettings.removeSection" })}</span>
          </div>
          <div className="settings-row-description">{intl.formatMessage({ id: "instanceSettings.removeSectionDesc" })}</div>

          {removeConfirm ? (
            <div className="settings-remove-confirm">
              <span>{intl.formatMessage({ id: "instanceSettings.removeConfirm" }, { name: environment.name })}</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn primary" style={{ background: "var(--danger)" }} onClick={handleRemoveInstance}>
                  {intl.formatMessage({ id: "instanceSettings.removeButton" })}
                </button>
                <button className="btn" onClick={() => setRemoveConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ fontSize: 12, padding: "4px 10px", color: "var(--danger)", border: "1px solid var(--danger)" }} onClick={handleRemoveInstance}>
              <Trash2 size={12} style={{ marginRight: 4 }} />
              {intl.formatMessage({ id: "instanceSettings.removeButton" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
