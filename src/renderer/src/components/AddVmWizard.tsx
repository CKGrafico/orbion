import { useEffect, useState, useRef } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { AgentRuntime, ReachMethod, SshHost, VmWizardProgress, VmWizardServiceSelection, VmWizardServiceStatus, VmWizardStep, BootstrapSeed } from "../../../shared/ipc";
import { TOOL_DEFINITIONS, type ToolDefinition } from "../../../shared/tool-definitions";
import { ShieldCheck, X, Check, Loader, SkipForward, Lock, Globe, Terminal } from "lucide-react";
import { translateMessage } from "../i18n";
import type { IVmWizardService, IConfigService, ILogService } from "../services/interfaces";

const STEP_LABEL_KEYS: Record<VmWizardStep, string> = {
  idle: "",
  "pick-reach-method": "vmWizard.stepPickReachMethod",
  "pick-target": "vmWizard.stepPickTarget",
  probing: "vmWizard.stepProbing",
  "host-key-verify": "vmWizard.stepHostKeyVerify",
  "pick-services": "vmWizard.stepPickServices",
  "runtime-provision": "vmWizard.stepRuntimeProvision",
  "runtime-consent": "vmWizard.stepRuntimeConsent",
  installing: "vmWizard.stepInstalling",
  forwarding: "vmWizard.stepForwarding",
  pairing: "vmWizard.stepPairing",
  consent: "vmWizard.stepConsent",
  "loop-task-consent": "vmWizard.stepLoopTaskConsent",
  done: "vmWizard.stepDone",
  error: "vmWizard.stepError",
};

function stepLabel(intl: IntlShape, step: VmWizardStep): string {
  const key = STEP_LABEL_KEYS[step];
  return key ? intl.formatMessage({ id: key }) : "";
}

const STEP_ORDER: VmWizardStep[] = [
  "pick-reach-method",
  "pick-target",
  "host-key-verify",
  "probing",
  "consent",
  "loop-task-consent",
  "pick-services",
  "runtime-provision",
  "runtime-consent",
  "installing",
  "pairing",
  "done",
];

function stepIndex(step: VmWizardStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? idx : 0;
}

export function AddVmWizard(props: {
  onDone: (environmentId: string, environmentName: string, daemonUrl: string) => void;
  onCancel: () => void;
  /** Optional pre-filled values from an imported bootstrap seed. */
  initialSeed?: BootstrapSeed | null;
}): React.ReactNode {
  const { onDone, onCancel, initialSeed } = props;
  const intl = useIntl();
  const [vmWizardService] = useInject<IVmWizardService>(cid.IVmWizardService);
  const [configService] = useInject<IConfigService>(cid.IConfigService);
  const [logService] = useInject<ILogService>(cid.ILogService);

  const [target, setTarget] = useState(initialSeed?.kind === "ssh" ? initialSeed.target : "");
  const [envName, setEnvName] = useState(initialSeed?.name ?? "");
  const [reachMethod, setReachMethod] = useState<ReachMethod>(initialSeed?.kind === "ssh" ? "ssh" : initialSeed?.kind === "direct" ? "local" : "ssh");
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntime>("opencode");
  const [sshKeyPassphrase, setSshKeyPassphrase] = useState("");
  const [localUrl, setLocalUrl] = useState(initialSeed?.kind === "direct" ? initialSeed.target : "");
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [progress, setProgress] = useState<VmWizardProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [doneResult, setDoneResult] = useState<{ environmentId: string; environmentName: string; daemonUrl: string } | null>(null);
  const doneResultRef = useRef(doneResult);
  doneResultRef.current = doneResult;
  const [serviceSelection, setServiceSelection] = useState<VmWizardServiceSelection>(() => {
    const installTools: Record<string, boolean> = {};
    for (const tool of TOOL_DEFINITIONS) {
      installTools[tool.id] = true;
    }
    return { installTools };
  });

  useEffect(() => {
    let cancelled = false;
    void vmWizardService.listSshHosts().then((h: SshHost[]) => {
      if (cancelled) return;
      setHosts(h);
      setHostsLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setHostsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [vmWizardService]);

  useEffect(() => {
    const unsub = vmWizardService.onProgress((p: VmWizardProgress) => {
      logService.debug("VM wizard progress", { step: p.step, message: p.message });
      setProgress(p);
      if (p.serviceSelection) setServiceSelection(p.serviceSelection);
      if (p.step === "done" || p.step === "error") {
        setRunning(false);
      }
    });
    return unsub;
  }, [logService, vmWizardService]);

  const startWizard = async (): Promise<void> => {
    if (reachMethod === "local") {
      const url = localUrl.trim();
      if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return;
      setRunning(true);
      setProgress(null);
      try {
        const result = await vmWizardService.startWizard({
          target: "",
          name: envName.trim() || undefined,
          reachMethod: "local",
          directUrl: url,
          agentRuntime,
        });
        setDoneResult(result);
      } catch {
        // progress already set via onProgress
      }
    } else {
      const trimmed = target.trim();
      if (!trimmed) return;
      setRunning(true);
      setProgress(null);
      try {
        const result = await vmWizardService.startWizard({
          target: trimmed,
          name: envName.trim() || undefined,
          reachMethod: "ssh",
          agentRuntime,
          ...(sshKeyPassphrase ? { sshKeyPassphrase } : {}),
        });
        setDoneResult(result);
      } catch {
        // progress already set via onProgress
      }
    }
  };

  const selectHost = (h: SshHost): void => {
    setTarget(h.label);
    setEnvName(h.hostName ?? h.host);
  };

  const handleCancel = (): void => {
    if (running) {
      vmWizardService.cancelWizard();
    }
    onCancel();
  };

  const handleDoneFinal = (): void => {
    if (!doneResult) return;
    if (setAsMain) {
      void configService.setMainVm(doneResult.environmentId);
    }
    onDone(doneResult.environmentId, doneResult.environmentName, doneResult.daemonUrl);
  };

  const handleClose = (): void => {
    if (doneResult) {
      handleDoneFinal();
    } else if (isDone) {
      // Wizard reached "done" step but the IPC promise hasn't resolved yet
      // (seedEnvironmentInfrastructure may still be running in the main process).
      // Poll for doneResult, then complete.
      let attempts = 0;
      const poll = (): void => {
        if (doneResultRef.current) {
          handleDoneFinal();
          return;
        }
        if (attempts++ < 50) {
          setTimeout(poll, 100);
        }
      };
      poll();
    } else {
      handleCancel();
    }
  };

  const currentStep = progress?.step ?? "idle";
  const isDone = currentStep === "done";
  const isError = currentStep === "error";
  const isNodeConsent = currentStep === "consent";
  const isLoopTaskConsent = currentStep === "loop-task-consent";
  const isRuntimeConsent = currentStep === "runtime-consent";
  const isConsentStep = isNodeConsent || isLoopTaskConsent || isRuntimeConsent;
  const isHostKeyVerify = currentStep === "host-key-verify";
  const isPickServices = currentStep === "pick-services";
  const isInstalling = currentStep === "installing";
  const [setAsMain, setSetAsMain] = useState(true);
  const [envCount, setEnvCount] = useState(0);

  useEffect(() => {
    void configService.getEnvironments().then((envs) => setEnvCount(envs.length));
  }, [configService]);
  const isFirstEnv = envCount === 0;

  function serviceStatusIcon(status: VmWizardServiceStatus): React.ReactNode {
    switch (status) {
      case "already-running": return <Check size={12} style={{ color: "var(--accent)" }} />;
      case "installed":
      case "started": return <Check size={12} style={{ color: "var(--accent)" }} />;
      case "installing":
      case "pending": return <Loader size={12} className="spinning" style={{ color: "var(--text-muted)" }} />;
      case "skipped": return <SkipForward size={12} style={{ color: "var(--text-muted)" }} />;
      case "failed": return <X size={12} style={{ color: "var(--danger)" }} />;
      default: return null;
    }
  }

  function serviceStatusLabel(status: VmWizardServiceStatus): string {
    switch (status) {
      case "already-running": return intl.formatMessage({ id: "vmWizard.serviceStatusAlreadyRunning" });
      case "installing": return intl.formatMessage({ id: "vmWizard.serviceStatusInstalling" });
      case "installed": return intl.formatMessage({ id: "vmWizard.serviceStatusInstalled" });
      case "started": return intl.formatMessage({ id: "vmWizard.serviceStatusStarted" });
      case "skipped": return intl.formatMessage({ id: "vmWizard.serviceStatusSkipped" });
      case "failed": return intl.formatMessage({ id: "vmWizard.serviceStatusFailed" });
      default: return "";
    }
  }

  // Service definitions for the pick-services and installing panels
  type ServiceCategory = "core" | "ai" | "platform" | "devops" | "networking" | "utilities";

  interface ServiceDef {
    toolId: string;
    nameKey: string;
    descKey: string;
    category: ServiceCategory;
    mandatory?: boolean;
  }

  const SERVICES: ServiceDef[] = TOOL_DEFINITIONS.map((t: ToolDefinition) => ({
    toolId: t.id,
    nameKey: t.nameKey,
    descKey: t.descKey,
    category: t.category,
  }));

  const CATEGORY_KEYS: Record<ServiceCategory, string> = {
    core: "vmWizard.categoryCore",
    ai: "vmWizard.categoryAI",
    platform: "vmWizard.categoryPlatform",
    devops: "vmWizard.categoryDevOps",
    networking: "vmWizard.categoryNetworking",
    utilities: "vmWizard.categoryUtilities",
  };

  // Group services by category, preserving order
  const groupedServices = SERVICES.reduce<Record<ServiceCategory, ServiceDef[]>>((acc, svc) => {
    (acc[svc.category] ??= []).push(svc);
    return acc;
  }, {} as Record<ServiceCategory, ServiceDef[]>);

  function isServiceInstalled(svc: ServiceDef): boolean {
    if (!progress?.probe) return false;
    return Boolean(progress.probe.installedTools[svc.toolId]);
  }

  function getLaunchStatus(svc: ServiceDef): VmWizardServiceStatus | null {
    if (!progress?.launch) return null;
    return progress.launch.toolStatuses[svc.toolId] ?? null;
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 860, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
        <h2>{intl.formatMessage({ id: "vmWizard.title" })}</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 14px" }}>
          {intl.formatMessage({ id: "vmWizard.description" })}
        </p>

        <div className="field">
          <label>{intl.formatMessage({ id: "vmWizard.name" })}</label>
          <input
            autoFocus
            placeholder={intl.formatMessage({ id: "vmWizard.namePlaceholder" })}
            value={envName}
            onChange={(e) => setEnvName(e.target.value)}
            disabled={running}
          />
        </div>

        {/* ── Reach method choice ────────────────────────────── */}
        <div className="field">
          <label>{intl.formatMessage({ id: "vmWizard.reachMethodLabel" })}</label>
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <button
              type="button"
              className={`btn ${reachMethod === "local" ? "primary" : ""}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 8px", background: reachMethod === "local" ? "var(--bg-active)" : "var(--bg-input)", border: reachMethod === "local" ? "1px solid var(--accent)" : "1px solid var(--border-subtle)", borderRadius: 8 }}
              onClick={() => { if (!running) setReachMethod("local"); }}
              disabled={running}
            >
              <Globe size={18} style={{ color: reachMethod === "local" ? "var(--accent)" : "var(--text-muted)" }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: reachMethod === "local" ? "var(--text-primary)" : "var(--text-secondary)" }}>{intl.formatMessage({ id: "vmWizard.reachMethodLocal" })}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.3 }}>{intl.formatMessage({ id: "vmWizard.reachMethodLocalDesc" })}</span>
            </button>
            <button
              type="button"
              className={`btn ${reachMethod === "ssh" ? "primary" : ""}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 8px", background: reachMethod === "ssh" ? "var(--bg-active)" : "var(--bg-input)", border: reachMethod === "ssh" ? "1px solid var(--accent)" : "1px solid var(--border-subtle)", borderRadius: 8 }}
              onClick={() => { if (!running) setReachMethod("ssh"); }}
              disabled={running}
            >
              <Terminal size={18} style={{ color: reachMethod === "ssh" ? "var(--accent)" : "var(--text-muted)" }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: reachMethod === "ssh" ? "var(--text-primary)" : "var(--text-secondary)" }}>{intl.formatMessage({ id: "vmWizard.reachMethodSsh" })}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.3 }}>{intl.formatMessage({ id: "vmWizard.reachMethodSshDesc" })}</span>
            </button>
          </div>
        </div>

        <div className="field">
          <label id="vm-wizard-runtime-label">{intl.formatMessage({ id: "vmWizard.runtimeLabel" })}</label>
          <div
            role="radiogroup"
            aria-labelledby="vm-wizard-runtime-label"
            aria-describedby="vm-wizard-runtime-description"
            style={{
              display: "flex",
              padding: 3,
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 999,
              opacity: running ? 0.65 : 1,
            }}
          >
            {(["opencode", "claude"] as const).map((runtime) => {
              const isSelected = agentRuntime === runtime;
              return (
                <button
                  key={runtime}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  disabled={running}
                  onClick={() => setAgentRuntime(runtime)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    setAgentRuntime(runtime === "opencode" ? "claude" : "opencode");
                  }}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    border: 0,
                    borderRadius: 999,
                    background: isSelected ? "var(--bg-active)" : "transparent",
                    color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 12.5,
                    fontWeight: isSelected ? 600 : 400,
                    cursor: running ? "default" : "pointer",
                    boxShadow: isSelected ? "inset 0 0 0 1px var(--border)" : "none",
                  }}
                >
                  {intl.formatMessage({ id: runtime === "opencode" ? "vmWizard.runtimeOpenCode" : "vmWizard.runtimeClaudeCode" })}
                </button>
              );
            })}
          </div>
          <div id="vm-wizard-runtime-description" style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>
            {intl.formatMessage({ id: "vmWizard.runtimeDescription" })}
          </div>
        </div>

        {/* ── Conditional fields based on reach method ─────── */}
        {reachMethod === "local" ? (
          <div className="field">
            <label>{intl.formatMessage({ id: "vmWizard.localUrlLabel" })}</label>
            <input
              placeholder={intl.formatMessage({ id: "vmWizard.localUrlPlaceholder" })}
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              onKeyDown={(e) => {
                const url = localUrl.trim();
                if (e.key === "Enter" && !running && url && (url.startsWith("http://") || url.startsWith("https://"))) void startWizard();
              }}
              disabled={running}
              className="mono"
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label>{intl.formatMessage({ id: "vmWizard.target" })}</label>
              <input
                placeholder={intl.formatMessage({ id: "vmWizard.targetPlaceholder" })}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running && target.trim()) void startWizard();
                }}
                disabled={running}
                className="mono"
              />
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                <ShieldCheck size={13} />
                <span>
                  {intl.formatMessage({ id: "vmWizard.securityNote" })}
                </span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="vm-wizard-ssh-key-passphrase">
                {intl.formatMessage({ id: "vmWizard.sshKeyPassphraseLabel" })}
              </label>
              <input
                id="vm-wizard-ssh-key-passphrase"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                placeholder={intl.formatMessage({ id: "vmWizard.sshKeyPassphrasePlaceholder" })}
                value={sshKeyPassphrase}
                onChange={(event) => setSshKeyPassphrase(event.target.value)}
                disabled={running}
                aria-describedby="vm-wizard-ssh-key-passphrase-description"
              />
              <div id="vm-wizard-ssh-key-passphrase-description" style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>
                {intl.formatMessage({ id: "vmWizard.sshKeyPassphraseDescription" })}
              </div>
            </div>

            {hostsLoaded && hosts.length > 0 && !running ? (
              <div className="field">
                <label>{intl.formatMessage({ id: "vmWizard.sshConfigHosts" })}</label>
                <div className="tailscale-peers" style={{ maxHeight: 160 }}>
                  {hosts.map((h) => (
                    <div
                      key={h.host}
                      className={`tailscale-peer ${target === h.label ? "selected" : ""}`}
                      onClick={() => selectHost(h)}
                    >
                      <span className="peer-name">{h.host}</span>
                      <span className="peer-ip mono">{h.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {progress ? (
          <div className="vm-wizard-progress" style={{ marginTop: 12 }}>
            <div className="vm-wizard-steps" style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {STEP_ORDER.map((step) => {
                const idx = stepIndex(step);
                const currentIdx = stepIndex(currentStep);
                const active = step === currentStep;
                const completed = idx < currentIdx || isDone;
                return (
                  <div
                    key={step}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: completed ? "var(--accent)" : active ? "var(--bg-active)" : "var(--bg-input)",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 12.5, color: isError ? "var(--danger)" : "var(--text-secondary)" }}>
              {isError ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <X size={14} />
                  {translateMessage(intl, progress.message)}
                </span>
              ) : isDone ? (
                <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={14} />
                  {translateMessage(intl, progress.message)}
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="spinner" style={{ width: 12, height: 12, border: "2px solid var(--text-muted)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  {stepLabel(intl, currentStep)}: {translateMessage(intl, progress.message)}
                </span>
              )}
            </div>
            {progress.probe && !isDone ? (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-muted)" }}>
                {progress.probe.nodeFound ? intl.formatMessage({ id: "vmWizard.nodeFound" }, { version: progress.probe.nodeVersion ?? "found" }) : intl.formatMessage({ id: "vmWizard.nodeNotFound" })}
                {" · "}
                {progress.probe.daemonRunning ? intl.formatMessage({ id: "vmWizard.daemonOnPort" }, { port: progress.probe.daemonPort ?? "?" }) : intl.formatMessage({ id: "vmWizard.daemonNotRunning" })}
                {" · "}
                {progress.probe.opencodeRunning ? intl.formatMessage({ id: "vmWizard.opencodeOnPort" }, { port: progress.probe.opencodePort ?? "?" }) : intl.formatMessage({ id: "vmWizard.opencodeNotRunning" })}
              </div>
            ) : null}
            {isError && progress.launch?.logTail ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                  {intl.formatMessage({ id: "vmWizard.diagnosticOutput" })}
                </div>
                <pre
                  aria-label={intl.formatMessage({ id: "vmWizard.diagnosticOutput" })}
                  style={{ margin: 0, fontSize: 11, color: "var(--danger)", background: "var(--bg-log)", padding: 8, borderRadius: 6, maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {progress.launch.logTail}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {isPickServices ? (
          <div style={{ marginTop: 12, padding: 12, background: "var(--bg-log)", borderRadius: 8, border: "1px solid var(--bg-active)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              {intl.formatMessage({ id: "vmWizard.pickServicesTitle" })}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
              {intl.formatMessage({ id: "vmWizard.pickServicesDescription" })}
            </div>

            {/* Mandatory: Node.js + loop-task */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
                {intl.formatMessage({ id: "vmWizard.categoryCore" })}, {intl.formatMessage({ id: "vmWizard.mandatoryLabel" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.7 }}>
                  <Lock size={12} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontWeight: 500 }}>{intl.formatMessage({ id: "vmWizard.serviceNodeJs" })}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {progress?.probe?.nodeFound
                      ? `${intl.formatMessage({ id: "vmWizard.nodeFound" }, { version: progress.probe.nodeVersion ?? "?" })}`
                      : intl.formatMessage({ id: "vmWizard.nodeNotFound" })}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.7 }}>
                  <Lock size={12} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontWeight: 500 }}>{intl.formatMessage({ id: "vmWizard.serviceLoopTask" })}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{intl.formatMessage({ id: "vmWizard.serviceLoopTaskDesc" })}</span>
                </div>
              </div>
            </div>

            {/* Optional services grouped by category */}
            {Object.entries(groupedServices).filter(([cat]) => cat !== "core").map(([category, services]) => (
              <div key={category} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
                  {intl.formatMessage({ id: CATEGORY_KEYS[category as ServiceCategory] })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
                  {services.map((svc) => {
                    const installed = isServiceInstalled(svc);
                    return (
                      <label
                        key={svc.toolId}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          cursor: installed ? "default" : "pointer",
                          opacity: installed ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={serviceSelection.installTools[svc.toolId] ?? false}
                          disabled={installed}
                          onChange={(e) => setServiceSelection((s) => ({ installTools: { ...s.installTools, [svc.toolId]: e.target.checked } }))}
                          style={{ marginTop: 3, flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {intl.formatMessage({ id: svc.nameKey })}
                            {installed ? (
                              <span style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-bg, rgba(0,200,100,0.12))", padding: "1px 6px", borderRadius: 4 }}>
                                {intl.formatMessage({ id: "vmWizard.alreadyInstalled" })}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.3 }}>{intl.formatMessage({ id: svc.descKey })}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
        ) : null}

        {isInstalling && progress?.launch ? (
          <div style={{ marginTop: 12, padding: 12, background: "var(--bg-log)", borderRadius: 8, border: "1px solid var(--bg-active)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Mandatory: loop-task */}
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 2 }}>
                {intl.formatMessage({ id: "vmWizard.categoryCore" })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                {serviceStatusIcon(progress.launch.loopTaskStatus)}
                <span>{intl.formatMessage({ id: "vmWizard.serviceLoopTask" })}</span>
                {progress.launch.loopTaskStatus !== "pending" ? (
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>, {serviceStatusLabel(progress.launch.loopTaskStatus)}</span>
                ) : null}
              </div>

              {/* All other services grouped by category */}
              {(["ai", "platform", "devops", "networking", "utilities"] as ServiceCategory[]).map((category) => {
                const services = groupedServices[category];
                if (!services?.length) return null;
                const visibleServices = services.filter((svc) => {
                  // Show if status is not pending (i.e., something is happening)
                  const status = getLaunchStatus(svc);
                  return status && status !== "pending";
                });
                if (!visibleServices.length) return null;
                return (
                  <div key={category}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 2, marginTop: 4 }}>
                      {intl.formatMessage({ id: CATEGORY_KEYS[category] })}
                    </div>
                    {visibleServices.map((svc) => {
                      const status = getLaunchStatus(svc);
                      if (!status) return null;
                      return (
                        <div key={svc.toolId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          {serviceStatusIcon(status)}
                          <span>{intl.formatMessage({ id: svc.nameKey })}</span>
                          {status !== "pending" ? (
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>, {serviceStatusLabel(status)}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {isNodeConsent && progress?.consentPrompt ? (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: "var(--bg-log)",
            borderRadius: 8,
            border: "1px solid var(--bg-active)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <ShieldCheck size={16} />
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {translateMessage(intl, progress.consentPrompt)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                onClick={() => vmWizardService.respondConsent("install")}
              >
                {intl.formatMessage({ id: "vmWizard.installViaMise" })}
              </button>
              <button
                className="btn"
                onClick={() => vmWizardService.respondConsent("skip")}
              >
                {intl.formatMessage({ id: "vmWizard.skip" })}
              </button>
            </div>
          </div>
        ) : null}

        {isLoopTaskConsent && progress?.consentPrompt ? (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: "var(--bg-log)",
            borderRadius: 8,
            border: "1px solid var(--bg-active)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <ShieldCheck size={16} />
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {translateMessage(intl, progress.consentPrompt)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                onClick={() => vmWizardService.respondConsent("install")}
              >
                {intl.formatMessage({ id: "vmWizard.installAndStartLoopTask" })}
              </button>
              <button
                className="btn"
                onClick={() => {
                  vmWizardService.respondConsent("skip");
                  onCancel();
                }}
              >
                {intl.formatMessage({ id: "vmWizard.cancel" })}
              </button>
            </div>
          </div>
        ) : null}

        {isRuntimeConsent && progress?.consentPrompt ? (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: "var(--bg-log)",
            borderRadius: 8,
            border: "1px solid var(--bg-active)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <ShieldCheck size={16} />
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {translateMessage(intl, progress.consentPrompt)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                onClick={() => vmWizardService.respondRuntimeConsent("install")}
              >
                {intl.formatMessage({ id: "vmWizard.installRuntime" })}
              </button>
              <button
                className="btn"
                onClick={() => vmWizardService.respondRuntimeConsent("skip")}
              >
                {intl.formatMessage({ id: "vmWizard.skip" })}
              </button>
            </div>
          </div>
        ) : null}

        {isHostKeyVerify && progress?.hostKeyFingerprint ? (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: "var(--bg-log)",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {intl.formatMessage({ id: "vmWizard.hostKeyVerifyDescription" })}
              </span>
            </div>
            <div style={{
              padding: "8px 10px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              marginBottom: 10,
              fontFamily: "monospace",
              fontSize: 12,
              color: "var(--text-primary)",
              wordBreak: "break-all",
              lineHeight: 1.5,
            }}>
              {progress.hostKeyFingerprint}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                onClick={() => vmWizardService.respondHostKey(true)}
              >
                {intl.formatMessage({ id: "vmWizard.trustHost" })}
              </button>
              <button
                className="btn"
                onClick={() => vmWizardService.respondHostKey(false)}
              >
                {intl.formatMessage({ id: "vmWizard.cancel" })}
              </button>
            </div>
          </div>
        ) : null}

        {isDone && doneResult ? (
          <div style={{ marginTop: 12, padding: 12, background: "var(--bg-log)", borderRadius: 8, border: "1px solid var(--bg-active)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: isFirstEnv ? "default" : "pointer", opacity: isFirstEnv ? 0.7 : 1 }}>
              <input
                type="checkbox"
                checked={setAsMain}
                disabled={isFirstEnv}
                onChange={(e) => setSetAsMain(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {intl.formatMessage({ id: "vmWizard.setAsMain" })}
                  {isFirstEnv ? (
                    <span style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-bg, rgba(0,200,100,0.12))", padding: "1px 6px", borderRadius: 4 }}>
                      {intl.formatMessage({ id: "vmWizard.firstEnvMainBadge" })}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {isFirstEnv
                    ? intl.formatMessage({ id: "vmWizard.setAsMainFirstDesc" })
                    : intl.formatMessage({ id: "vmWizard.setAsMainDesc" })}
                </div>
              </div>
            </label>
          </div>
        ) : null}

        <div className="modal-actions">
          {isError ? (
            <>
              <button className="btn" onClick={handleCancel}>
                {intl.formatMessage({ id: "vmWizard.cancel" })}
              </button>
              <button className="btn primary" onClick={() => void startWizard()}>
                {intl.formatMessage({ id: "vmWizard.retry" })}
              </button>
            </>
          ) : !isConsentStep && !isHostKeyVerify ? (
            <button className="btn" onClick={handleClose}>
              {running ? intl.formatMessage({ id: "vmWizard.cancel" }) : intl.formatMessage({ id: "vmWizard.close" })}
            </button>
          ) : null}
          {!isError && isPickServices ? (
            <button
              className="btn primary"
              onClick={() => vmWizardService.respondServiceSelection(serviceSelection)}
            >
              {intl.formatMessage({ id: "vmWizard.confirmServices" })}
            </button>
          ) : !isError && !isDone && !isConsentStep ? (
            <button
              className="btn primary"
              onClick={() => void startWizard()}
              disabled={running || (reachMethod === "local" ? !localUrl.trim() || (!localUrl.trim().startsWith("http://") && !localUrl.trim().startsWith("https://")) : !target.trim())}
            >
              {running ? intl.formatMessage({ id: "vmWizard.running" }) : intl.formatMessage({ id: "vmWizard.startWizard" })}
            </button>
          ) : null}
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .spinning {
            animation: spin 1s linear infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
