import { useEffect, useState } from "react";
import type { Environment, EnvironmentAuthState, OpenCodeEndpoint } from "../types";
import type { TailscalePeer, TailscalePeersResponse, PairingCodeExchangeResponse } from "../types";
import { apiRequest } from "../api";

type PairingStep = "url" | "pairing" | "done";

function parsePairingUrl(input: string): { baseUrl: string; code: string } | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hash = url.hash.slice(1);
    if (!hash) return null;
    const code = new URLSearchParams(hash).get("code") ?? hash;
    if (!code) return null;
    const baseUrl = `${url.protocol}//${url.host}${url.pathname !== "/" ? url.pathname : ""}`;
    return { baseUrl: baseUrl.replace(/\/+$/, ""), code };
  } catch {
    return null;
  }
}

interface PeerPort {
  hostName: string;
  dnsName: string;
  tailscaleIPs: string[];
  online: boolean;
  os: string;
  port: string;
}

export function AddEnvironmentModal(props: {
  onSubmit: (name: string, baseUrl: string, kind?: "direct" | "ssh" | "tailscale") => void;
  onCancel: () => void;
  repairEnvironmentId?: string | null;
  onSetOpenCodeEndpoint?: (environmentId: string, url: string, password: string | null) => void;
}): React.ReactNode {
  const { onSubmit, onCancel, repairEnvironmentId, onSetOpenCodeEndpoint } = props;
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8845");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [peers, setPeers] = useState<PeerPort[]>([]);
  const [tailscaleAvailable, setTailscaleAvailable] = useState(false);

  const [pairingStep, setPairingStep] = useState<PairingStep>("url");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingScope, setPairingScope] = useState<"read-only" | "operate" | "admin">("read-only");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [detectedAuthState, setDetectedAuthState] = useState<EnvironmentAuthState>("unknown");

  const [openCodeUrl, setOpenCodeUrl] = useState("");
  const [openCodePassword, setOpenCodePassword] = useState("");
  const [showOpenCode, setShowOpenCode] = useState(false);

  useEffect(() => {
    if (!window.api?.tailscalePeers) return;
    let cancelled = false;
    void window.api.tailscalePeers().then((res: TailscalePeersResponse) => {
      if (cancelled) return;
      if (res.available && res.peers.length > 0) {
        setTailscaleAvailable(true);
        setPeers(res.peers.map((p: TailscalePeer) => ({ ...p, port: "8845" })));
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!repairEnvironmentId || !window.api) return;
    void (async () => {
      const envs = await window.api!.config.getEnvironments();
      const env = envs.find((e: Environment) => e.id === repairEnvironmentId);
      if (env) {
        setName(env.name);
        const url = env.endpoints.length > 0 ? env.endpoints[0].url : "";
        setBaseUrl(url);
        setPairingStep("pairing");
      }
    })();
  }, [repairEnvironmentId]);

  const selectPeer = (peer: PeerPort): void => {
    const url = `http://${peer.dnsName}:${peer.port}`;
    setName(peer.hostName);
    setBaseUrl(url);
    setError(null);
    setWarning(null);
    void submitWithUrl(peer.hostName, url, "direct");
  };

  const submitWithUrl = async (
    trimmedName: string,
    trimmedUrl: string,
    kind?: "direct" | "ssh" | "tailscale",
  ): Promise<void> => {
    if (!trimmedName) {
      setError("Give this environment a name.");
      return;
    }
    try {
      const url = new URL(trimmedUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    } catch {
      setError("Enter a valid http(s) URL, e.g. http://127.0.0.1:8845");
      return;
    }

    setChecking(true);
    setError(null);
    setWarning(null);
    const probeEnv: Environment = {
      id: "probe",
      name: trimmedName,
      endpoints: [{ id: "probe-ep", kind: "direct", url: trimmedUrl, lastError: null, failureCount: 0 }],
      activeEndpointId: "probe-ep",
    };
    const probe = await apiRequest(probeEnv, "/api/loops");
    setChecking(false);

    if (!probe.ok) {
      if (probe.status === 401) {
        setDetectedAuthState("blocked");
        setPairingStep("pairing");
        return;
      }
      setWarning(`Could not reach the environment: ${probe.error ?? "unknown error"}. Save anyway?`);
      return;
    }

    setDetectedAuthState("unauthenticated");
    onSubmit(trimmedName, trimmedUrl, kind, openCodeUrl || undefined, openCodePassword || undefined);
  };

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");

    const parsed = parsePairingUrl(trimmedUrl);
    if (parsed) {
      setName(trimmedName || "Paired daemon");
      setBaseUrl(parsed.baseUrl);
      setPairingCode(parsed.code);
      setPairingStep("pairing");
      return;
    }

    await submitWithUrl(trimmedName, trimmedUrl, undefined);
  };

  const forceSave = (): void => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
    onSubmit(trimmedName, trimmedUrl, "direct", openCodeUrl || undefined, openCodePassword || undefined);
  };

  const handlePair = async (): Promise<void> => {
    if (!pairingCode.trim()) {
      setPairingError("Enter the pairing code from the daemon.");
      return;
    }
    setPairingBusy(true);
    setPairingError(null);

    if (window.api) {
      const result: PairingCodeExchangeResponse = await window.api.config.exchangePairingCode(
        baseUrl.trim().replace(/\/+$/, ""),
        pairingCode.trim(),
        pairingScope,
      );
      setPairingBusy(false);
      if (!result.ok) {
        setPairingError(result.error ?? "Pairing failed.");
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }

    setDetectedAuthState("paired");
    setPairingStep("done");
    onSubmit(name.trim() || "Paired daemon", baseUrl.trim().replace(/\/+$/, ""), "direct", openCodeUrl || undefined, openCodePassword || undefined);
  };

  if (pairingStep === "pairing") {
    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Pair with daemon</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 14px" }}>
            This daemon requires authentication. Enter the pairing code displayed by the daemon to get a session token.
          </p>

          <div className="field">
            <label>Daemon URL</label>
            <input value={baseUrl} readOnly style={{ opacity: 0.7 }} />
          </div>

          <div className="field">
            <label>Pairing code</label>
            <input
              autoFocus
              placeholder="e.g. A3F-K9M"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handlePair();
              }}
              className="mono"
            />
            {pairingError ? <div className="error">{pairingError}</div> : null}
          </div>

          <div className="field">
            <label>Scope</label>
            <div className="scope-selector">
              {(["read-only", "operate", "admin"] as const).map((s) => (
                <button
                  key={s}
                  className={`scope-option${pairingScope === s ? " active" : ""}`}
                  onClick={() => setPairingScope(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn" onClick={() => setPairingStep("url")}>
              Back
            </button>
            <button className="btn primary" onClick={() => void handlePair()} disabled={pairingBusy}>
              {pairingBusy ? "Pairing…" : "Pair"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add loop-task environment</h2>

        <div className="field">
          <label>Name</label>
          <input
            autoFocus
            placeholder="Local daemon"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>

        <div className="field">
          <label>API URL or pairing link</label>
          <input
            placeholder="http://127.0.0.1:8845 or orbion://pair#code=A3F-K9M"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          {error ? <div className="error">{error}</div> : null}
          {warning ? (
            <div className="warning">
              {warning}
              <button className="btn small" onClick={forceSave} style={{ marginLeft: 8 }}>
                Save anyway
              </button>
            </div>
          ) : null}
        </div>

        {tailscaleAvailable && peers.length > 0 ? (
          <div className="field">
            <label>Tailnet machines</label>
            <div className="tailscale-peers">
              {peers.map((peer, i) => (
                <div
                  key={peer.dnsName}
                  className={`tailscale-peer ${peer.online ? "online" : "offline"}`}
                  onClick={() => selectPeer(peer)}
                >
                  <span className={`peer-dot ${peer.online ? "online" : ""}`} />
                  <span className="peer-name">{peer.hostName}</span>
                  <span className="peer-ip mono">
                    {peer.tailscaleIPs.length > 0 ? peer.tailscaleIPs[0] : "—"}
                  </span>
                  <input
                    className="peer-port mono"
                    type="text"
                    value={peer.port}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPeers((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, port: val } : p)),
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        selectPeer(peers[i]);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="field">
          <button
            className="btn small"
            onClick={() => setShowOpenCode((v) => !v)}
            style={{ fontSize: 11, marginBottom: showOpenCode ? 8 : 0 }}
          >
            {showOpenCode ? "Hide" : "Show"} OpenCode server
          </button>
          {showOpenCode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <input
                placeholder="OpenCode server URL (e.g. http://127.0.0.1:13284)"
                value={openCodeUrl}
                onChange={(e) => setOpenCodeUrl(e.target.value)}
                className="mono"
              />
              <input
                type="password"
                placeholder="Server password (optional)"
                value={openCodePassword}
                onChange={(e) => setOpenCodePassword(e.target.value)}
                className="mono"
              />
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={checking}>
            {checking ? "Checking…" : "Add environment"}
          </button>
        </div>
      </div>
    </div>
  );
}
