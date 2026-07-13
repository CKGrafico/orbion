import React from "react";
import { useIntl } from "react-intl";
import type { Environment } from "../types";

interface PickMainVmModalProps {
  candidates: Environment[];
  onPick: (environmentId: string) => void;
  onSkip: () => void;
}

export function PickMainVmModal({ candidates, onPick, onSkip }: PickMainVmModalProps): React.ReactNode {
  const intl = useIntl();
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{intl.formatMessage({ id: "pickMainVm.title" })}</span>
        </div>
        <div className="modal-body">
          <p style={{ margin: "0 0 12px", color: "var(--text-secondary)", fontSize: 13 }}>
            {intl.formatMessage({ id: "pickMainVm.description" })}
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
                  {env.endpoints[0]?.url ?? intl.formatMessage({ id: "pickMainVm.noEndpoint" })}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onSkip}>{intl.formatMessage({ id: "pickMainVm.skip" })}</button>
        </div>
      </div>
    </div>
  );
}
