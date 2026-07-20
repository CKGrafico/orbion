import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import type { LoopProposalRow, LoopProposalStatus } from "../chat/types";
import type { Environment } from "../types";
import { commandLine } from "../format";
import { createLoop, isAgentCommand, SUGGESTED_MAX_RUNS } from "../api";

interface LoopProposalCardProps {
  row: LoopProposalRow;
  /** The environment instance to create the loop on. */
  instance?: Environment;
  /** Callback when the proposal is approved and the loop is created. */
  onApproved: (proposalId: string, loopId: string, environmentId: string) => void;
  /** Callback when the proposal is rejected. */
  onRejected: (proposalId: string) => void;
  /** Callback when the proposal status changes (e.g., creating, error). */
  onStatusChange: (proposalId: string, status: LoopProposalStatus, error?: string) => void;
}

export function LoopProposalCard({ row, instance, onApproved, onRejected, onStatusChange }: LoopProposalCardProps): React.ReactNode {
  const intl = useIntl();

  const isPending = row.status === "pending";
  const isCreating = row.status === "creating";
  const isCreated = row.status === "created";
  const isRejected = row.status === "rejected";
  const isError = row.status === "error";
  const isTerminal = isCreated || isRejected;

  // Local editable state for max-runs and run-immediately
  const [maxRuns, setMaxRuns] = useState<number | null>(row.maxRuns);
  const [runImmediately, setRunImmediately] = useState(row.runImmediately);

  // Whether this is an agent command that got a suggestion
  const hasSuggestion = row.suggestedMaxRuns !== null && maxRuns === null;
  const agentDetected = isAgentCommand(row.command);

  // Toggle for command disclosure
  const [commandExpanded, setCommandExpanded] = useState(false);
  const fullCommand = commandLine(row.command, row.commandArgs);
  const isLongCommand = fullCommand.length > 80;
  const displayCommand = isLongCommand && !commandExpanded
    ? fullCommand.slice(0, 77) + "..."
    : fullCommand;

  const handleApprove = useCallback(async (): Promise<void> => {
    if (!instance) return;

    onStatusChange(row.proposalId, "creating");

    try {
      const result = await createLoop(instance, {
        command: row.command,
        commandArgs: row.commandArgs,
        interval: row.interval,
        projectId: row.projectId,
        runImmediately,
        maxRuns,
      });

      if (result.ok && result.data) {
        onApproved(row.proposalId, result.data.id, row.environmentId);
      } else {
        const errorMsg = typeof result.error === "string"
          ? result.error
          : intl.formatMessage({ id: "loopProposal.createError" });
        onStatusChange(row.proposalId, "error", errorMsg);
      }
    } catch {
      onStatusChange(row.proposalId, "error", intl.formatMessage({ id: "loopProposal.createError" }));
    }
  }, [instance, row, maxRuns, runImmediately, onApproved, onStatusChange, intl]);

  const handleReject = useCallback((): void => {
    onRejected(row.proposalId);
  }, [onRejected, row.proposalId]);

  const handleAcceptSuggestion = useCallback((): void => {
    setMaxRuns(row.suggestedMaxRuns ?? SUGGESTED_MAX_RUNS);
  }, [row.suggestedMaxRuns]);

  const handleMaxRunsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value.trim();
    if (val === "") {
      setMaxRuns(null);
    } else {
      const num = Number(val);
      if (!isNaN(num) && num > 0) {
        setMaxRuns(Math.floor(num));
      }
    }
  }, []);

  return (
    <div className={`loop-proposal-card${isTerminal ? " loop-proposal-card--terminal" : ""}${isError ? " loop-proposal-card--error" : ""}`}>
      {/* Header */}
      <div className="loop-proposal-header">
        <span className="loop-proposal-icon">≔</span>
        <span className="loop-proposal-title">{intl.formatMessage({ id: "loopProposal.title" })}</span>
        {isCreated && (
          <span className="loop-proposal-status loop-proposal-status--created">
            {intl.formatMessage({ id: "loopProposal.statusCreated" })}
          </span>
        )}
        {isRejected && (
          <span className="loop-proposal-status loop-proposal-status--rejected">
            {intl.formatMessage({ id: "loopProposal.statusRejected" })}
          </span>
        )}
      </div>

      {/* Command block */}
      <div className="loop-proposal-command">
        <div className="loop-proposal-command-content" onClick={isLongCommand ? () => setCommandExpanded(!commandExpanded) : undefined}>
          {displayCommand}
        </div>
        {isLongCommand && !commandExpanded && (
          <button className="loop-proposal-command-expand" onClick={() => setCommandExpanded(true)}>
            {intl.formatMessage({ id: "loopProposal.expandCommand" })}
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="loop-proposal-meta">
        <span className="loop-proposal-meta-item">
          <span className="loop-proposal-meta-label">{intl.formatMessage({ id: "loopProposal.interval" })}</span>
          <span className="loop-proposal-meta-value loop-proposal-meta-value--mono">{row.interval}</span>
        </span>
        <span className="loop-proposal-meta-sep" />
        <span className="loop-proposal-meta-item">
          <span className="loop-proposal-meta-label">{intl.formatMessage({ id: "loopProposal.project" })}</span>
          <span className="loop-proposal-meta-value">{row.projectName}</span>
        </span>
      </div>

      {/* Options row */}
      {isPending && (
        <div className="loop-proposal-options">
          <label className="loop-proposal-option">
            <input
              type="checkbox"
              checked={runImmediately}
              onChange={(e) => setRunImmediately(e.target.checked)}
              className="loop-proposal-checkbox"
            />
            <span className="loop-proposal-option-label">{intl.formatMessage({ id: "loopProposal.runImmediately" })}</span>
          </label>

          <div className="loop-proposal-max-runs">
            <label className="loop-proposal-option-label" htmlFor={`max-runs-${row.proposalId}`}>
              {intl.formatMessage({ id: "loopProposal.maxRuns" })}
            </label>
            <input
              id={`max-runs-${row.proposalId}`}
              type="number"
              min={1}
              className="loop-proposal-max-runs-input"
              value={maxRuns ?? ""}
              onChange={handleMaxRunsChange}
              placeholder={intl.formatMessage({ id: "loopProposal.maxRunsPlaceholder" })}
            />
            {hasSuggestion && (
              <button className="loop-proposal-suggestion-badge" onClick={handleAcceptSuggestion}>
                {intl.formatMessage(
                  { id: "loopProposal.suggestedMaxRuns" },
                  { count: row.suggestedMaxRuns ?? SUGGESTED_MAX_RUNS },
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {isError && row.error && (
        <div className="loop-proposal-error">{row.error}</div>
      )}

      {/* Action buttons */}
      {isPending && (
        <div className="loop-proposal-actions">
          <button
            className="loop-proposal-btn loop-proposal-btn--reject"
            onClick={handleReject}
            disabled={isCreating}
          >
            {intl.formatMessage({ id: "loopProposal.reject" })}
          </button>
          <button
            className="loop-proposal-btn loop-proposal-btn--approve"
            onClick={() => void handleApprove()}
            disabled={isCreating}
          >
            {isCreating
              ? intl.formatMessage({ id: "loopProposal.creating" })
              : intl.formatMessage({ id: "loopProposal.approve" })}
          </button>
        </div>
      )}
    </div>
  );
}
