import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AgentRuntime, Environment, EndpointKind } from "../../../shared/ipc";
import { Settings, Trash2, Plus, Check, Globe, Terminal, X } from "lucide-react";
import { translateMessage } from "../i18n";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface InstanceSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  environment: Environment | null;
  onUpdateEnvironment: (id: string, updates: { name?: string; agentRuntime?: AgentRuntime; sshControlTarget?: string | null }) => void;
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
  const { t } = useTranslation();

  const [nameInput, setNameInput] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [sshControlTarget, setSshControlTarget] = useState("");

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
      setSshControlTarget(environment.sshControlTarget ?? "");
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

  const handleSshControlTargetCommit = () => {
    const target = sshControlTarget.trim();
    if (target !== (environment.sshControlTarget ?? "")) {
      onUpdateEnvironment(environment.id, { sshControlTarget: target || null });
    }
  };

  const handleSaveAndClose = () => {
    handleNameCommit();
    handleSshControlTargetCommit();
    onClose();
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
              ? translateMessage(result.error as { key: string; params?: Record<string, string | number> })
              : t("instanceSettings.pairingCode"),
        );
      } else {
        setPairingCode("");
      }
    } catch {
      setPairingError(t("instanceSettings.pairingCode"));
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
      case "paired": return t("instanceSettings.authStateAuthenticated");
      case "unauthenticated": return t("instanceSettings.authStateUnauthenticated");
      case "blocked": return t("instanceSettings.authStateBlocked");
      case "tampered": return t("instanceSettings.authStateTampered");
      default: return t("instanceSettings.authStateUnknown");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) { syncName(); onClose(); } }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("instanceSettings.title")}</SheetTitle>
          <SheetDescription>{t("settings.close")}</SheetDescription>
        </SheetHeader>
        <Button className="mb-4" onClick={handleSaveAndClose}>
          {t("instanceSettings.saveAndClose")}
        </Button>

        <div className="settings-body">
          {/* Instance name */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.nameLabel")}</span>
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
            <span className="settings-section-title">{t("instanceSettings.reachSection")}</span>
          </div>
          <div className="settings-row-description">{t("instanceSettings.reachSectionDesc")}</div>

          <div className="settings-endpoints">
            {environment.endpoints.length === 0 ? (
              <div className="settings-endpoint-empty">{t("instanceSettings.noEndpoints")}</div>
            ) : (
              environment.endpoints.map((ep) => (
                <div key={ep.id} className="settings-endpoint-row">
                  <span className="settings-endpoint-kind">
                    {ep.kind === "ssh" ? <Terminal size={12} /> : <Globe size={12} />}
                    <span>{ep.kind}</span>
                  </span>
                  <span className="settings-endpoint-url mono" title={ep.url}>{ep.url}</span>
                  {ep.id === environment.activeEndpointId ? (
                    <span className="settings-endpoint-active">{t("instanceSettings.activeEndpoint")}</span>
                  ) : (
                    <button
                      className="btn settings-endpoint-action"
                      onClick={() => onSetActiveEndpoint(environment.id, ep.id)}
                    >
                      {t("instanceSettings.switchActive")}
                    </button>
                  )}
                  {removeEndpointId === ep.id ? (
                    <div className="settings-endpoint-confirm">
                      <span>{t("instanceSettings.removeEndpointConfirm")}</span>
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
                      title={t("instanceSettings.removeEndpoint")}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {ep.lastError ? (
                    <span className="settings-endpoint-error">
                      {typeof ep.lastError === "string" ? ep.lastError : translateMessage(ep.lastError as { key: string; params?: Record<string, string | number> })}
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
              placeholder={t("instanceSettings.endpointUrl")}
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

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.sshControlTarget")}</span>
              <span className="settings-row-description">{t("instanceSettings.sshControlTargetDesc")}</span>
            </div>
            <input
              className="settings-threshold-input"
              style={{ width: "100%" }}
              placeholder={t("instanceSettings.sshControlTargetPlaceholder")}
              value={sshControlTarget || environment.sshControlTarget || ""}
              onChange={(event) => setSshControlTarget(event.target.value)}
              onBlur={handleSshControlTargetCommit}
              onKeyDown={(event) => { if (event.key === "Enter") handleSshControlTargetCommit(); }}
            />
          </div>

          {/* ── Runtime section ── */}
          <div className="settings-section-header">
            <Settings size={13} />
            <span className="settings-section-title">{t("instanceSettings.runtimeSection")}</span>
          </div>
          <div className="settings-row-description">{t("instanceSettings.runtimeSectionDesc")}</div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.agentRuntime")}</span>
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
              <span className="settings-row-title">{t("instanceSettings.runtimeState")}</span>
            </div>
            <span className="settings-row-desc">{environment.runtimeState ?? "unknown"}</span>
          </div>

          {/* ── Credentials section ── */}
          <div className="settings-section-header">
            <Settings size={13} />
            <span className="settings-section-title">{t("instanceSettings.credentialsSection")}</span>
          </div>
          <div className="settings-row-description">{t("instanceSettings.credentialsSectionDesc")}</div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.authState")}</span>
            </div>
            <span className="settings-row-desc">{authStateLabel(environment.authState)}</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.repairCode")}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="settings-threshold-input"
                style={{ width: 140 }}
                placeholder={t("instanceSettings.repairCodePlaceholder")}
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handlePair(); }}
              />
              <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => void handlePair()} disabled={pairingBusy || !pairingCode.trim()}>
                {t("instanceSettings.repairSubmit")}
              </button>
            </div>
          </div>
          {pairingError ? <div className="settings-pairing-error">{pairingError}</div> : null}

          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t("instanceSettings.clearCredentials")}</span>
            </div>
            {clearCredConfirm ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--danger)" }}>{t("instanceSettings.clearCredentialsConfirm")}</span>
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
            <span className="settings-section-title">{t("instanceSettings.removeSection")}</span>
          </div>
          <div className="settings-row-description">{t("instanceSettings.removeSectionDesc")}</div>

          {removeConfirm ? (
            <div className="settings-remove-confirm">
              <span>{t("instanceSettings.removeConfirm", { name: environment.name })}</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn primary" style={{ background: "var(--danger)" }} onClick={handleRemoveInstance}>
                  {t("instanceSettings.removeButton")}
                </button>
                <button className="btn" onClick={() => setRemoveConfirm(false)}>
                  {t("instanceSettings.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ fontSize: 12, padding: "4px 10px", color: "var(--danger)", border: "1px solid var(--danger)" }} onClick={handleRemoveInstance}>
              <Trash2 size={12} style={{ marginRight: 4 }} />
              {t("instanceSettings.removeButton")}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
