import { useEffect, useState } from "react";
import type { Environment } from "../types";
import type { TailscalePeer, TailscalePeersResponse } from "../types";
import { apiRequest } from "../api";

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
}): React.ReactNode {
  const { onSubmit, onCancel } = props;
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8845");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [peers, setPeers] = useState<PeerPort[]>([]);
  const [tailscaleAvailable, setTailscaleAvailable] = useState(false);

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
      setWarning(`Could not reach the environment: ${probe.error ?? "unknown error"}. Save anyway?`);
      return;
    }
    onSubmit(trimmedName, trimmedUrl, kind);
  };

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
    await submitWithUrl(trimmedName, trimmedUrl);
  };

  const forceSave = (): void => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
    onSubmit(trimmedName, trimmedUrl, "direct");
  };

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
          <label>API URL</label>
          <input
            placeholder="http://127.0.0.1:8845"
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
