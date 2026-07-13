import React from "react";
import type { Environment } from "../types";

interface PickMainVmModalProps {
  candidates: Environment[];
  onPick: (environmentId: string) => void;
  onSkip: () => void;
}

export function PickMainVmModal({ candidates, onPick, onSkip }: PickMainVmModalProps): React.ReactNode {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Pick a new main VM</span>
        </div>
        <div className="modal-body">
          <p style={{ margin: "0 0 12px", color: "var(--text-secondary)", fontSize: 13 }}>
            The infrastructure assistant needs a main VM to run on. Choose one of your environments or skip to disable it.
          </p>
          <div className="pick-main-vm-list">
            {candidates.map((env) => (
              <button
                key={env.id}
                className="pick-main-vm-item"
                onClick={() => onPick(env.id)}
              >
                <span className="name">{env.name}</span>
                <span className="stat" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {env.endpoints[0]?.url ?? "no endpoint"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
