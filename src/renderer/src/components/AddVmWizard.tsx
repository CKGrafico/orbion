import { useEffect, useState } from "react";
import type { SshHost, VmWizardProgress, VmWizardStep } from "../../shared/ipc";
import { Icon } from "./Icon";

const STEP_LABELS: Record<VmWizardStep, string> = {
  idle: "",
  "pick-target": "Pick target",
  probing: "Probing VM",
  installing: "Installing services",
  forwarding: "Opening tunnel",
  pairing: "Pairing",
  done: "Done",
  error: "Error",
};

const STEP_ORDER: VmWizardStep[] = [
  "pick-target",
  "probing",
  "installing",
  "forwarding",
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
}): React.ReactNode {
  const { onDone, onCancel } = props;

  const [target, setTarget] = useState("");
  const [envName, setEnvName] = useState("");
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [progress, setProgress] = useState<VmWizardProgress | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!window.api) return;
    let cancelled = false;
    void window.api.vmWizard.listSshHosts().then((h: SshHost[]) => {
      if (cancelled) return;
      setHosts(h);
      setHostsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!window.api) return;
    const unsub = window.api.vmWizard.onProgress((p: VmWizardProgress) => {
      setProgress(p);
      if (p.step === "done" || p.step === "error") {
        setRunning(false);
      }
    });
    return unsub;
  }, []);

  const startWizard = async (): Promise<void> => {
    const trimmed = target.trim();
    if (!trimmed) return;

    setRunning(true);
    setProgress(null);

    try {
      const result = await window.api!.vmWizard.startWizard(trimmed, envName.trim() || undefined);
      onDone(result.environmentId, result.environmentName, result.daemonUrl);
    } catch {
      // progress already set via onProgress
    }
  };

  const selectHost = (h: SshHost): void => {
    setTarget(h.label);
    setEnvName(h.hostName ?? h.host);
  };

  const handleCancel = (): void => {
    if (running && window.api) {
      void window.api.vmWizard.cancelWizard();
    }
    onCancel();
  };

  const currentStep = progress?.step ?? "idle";
  const isDone = currentStep === "done";
  const isError = currentStep === "error";

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h2>Add VM wizard</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 14px" }}>
          Connect a fresh VM over SSH. Orbion will probe, install, forward, and pair automatically.
        </p>

        <div className="field">
          <label>Name</label>
          <input
            autoFocus
            placeholder="my-vm"
            value={envName}
            onChange={(e) => setEnvName(e.target.value)}
            disabled={running}
          />
        </div>

        <div className="field">
          <label>Target (user@host)</label>
          <input
            placeholder="ubuntu@192.168.1.50"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !running && target.trim()) void startWizard();
            }}
            disabled={running}
            className="mono"
          />
        </div>

        {hostsLoaded && hosts.length > 0 && !running ? (
          <div className="field">
            <label>SSH config hosts</label>
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
                  <Icon name="x" size={14} />
                  {progress.message}
                </span>
              ) : isDone ? (
                <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="check" size={14} />
                  {progress.message}
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="spinner" style={{ width: 12, height: 12, border: "2px solid var(--text-muted)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  {STEP_LABELS[currentStep]}: {progress.message}
                </span>
              )}
            </div>
            {progress.probe && !isDone ? (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-muted)" }}>
                {progress.probe.nodeFound ? `Node ${progress.probe.nodeVersion ?? "found"}` : "Node: not found"}
                {" · "}
                {progress.probe.daemonRunning ? `Daemon on :${progress.probe.daemonPort ?? "?"}` : "Daemon: not running"}
                {" · "}
                {progress.probe.opencodeRunning ? `OpenCode on :${progress.probe.opencodePort ?? "?"}` : "OpenCode: not running"}
              </div>
            ) : null}
            {progress.launch?.logTail ? (
              <pre style={{ marginTop: 8, fontSize: 11, color: "var(--danger)", background: "var(--bg-log)", padding: 8, borderRadius: 6, maxHeight: 100, overflow: "auto" }}>
                {progress.launch.logTail}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="btn" onClick={handleCancel} disabled={false}>
            {running ? "Cancel" : "Close"}
          </button>
          {!isDone ? (
            <button
              className="btn primary"
              onClick={() => void startWizard()}
              disabled={running || !target.trim()}
            >
              {running ? "Running…" : "Start wizard"}
            </button>
          ) : null}
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
