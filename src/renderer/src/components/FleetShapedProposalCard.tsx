import React, { useEffect, useState } from "react";
import type { LoopProposalRow, LoopProposalStatus } from "../chat/types";
import type { ShapeAdaptation } from "../fleet-shape-adapt";
import type { Environment, PlatformType, LoopShape } from "../../../shared/ipc";
import type { ILoopShapeCacheService, IInfraService } from "../services/interfaces";
import type { SimilarLoopMatch } from "../fleet-similarity";
import { LoopProposalCard } from "./LoopProposalCard";
import { matchShapeToFleetIntent, adaptShapeForPlatform, buildProvenance } from "../fleet-shape-adapt";

interface FleetShapedProposalCardProps {
  row: LoopProposalRow;
  instance?: Environment;
  onApproved: (proposalId: string, loopId: string, environmentId: string) => void;
  onRejected: (proposalId: string) => void;
  onStatusChange: (proposalId: string, status: LoopProposalStatus, error?: string) => void;
  similarLoops?: SimilarLoopMatch[];
  environments: Array<{ id: string; name: string }>;
  environmentId: string;
  loopShapeCacheService: ILoopShapeCacheService;
  infraService: IInfraService;
}

/**
 * Wrapper around LoopProposalCard that computes fleet-shaped adaptation
 * (shape matching + platform adaptation) asynchronously and passes enriched
 * provenance/adaptedFrom data to the card once resolved.
 */
export function FleetShapedProposalCard({
  row,
  instance,
  onApproved,
  onRejected,
  onStatusChange,
  similarLoops,
  environments,
  environmentId,
  loopShapeCacheService,
  infraService,
}: FleetShapedProposalCardProps): React.ReactNode {
  const [provenance, setProvenance] = useState<string | null>(row.provenance);
  const [adaptedFrom, setAdaptedFrom] = useState<ShapeAdaptation | null | undefined>(row.adaptedFrom);

  // Compute shape match + platform adaptation once when the row enters "pending" state
  useEffect(() => {
    if (row.status !== "pending" || row.provenance) return;

    let cancelled = false;

    void (async () => {
      try {
        const allShapes = await loopShapeCacheService.getAll();
        if (cancelled) return;

        const shapeMatch = matchShapeToFleetIntent(row.command, allShapes, environmentId);
        if (!shapeMatch || cancelled) return;

        const sourceEnv = environments.find((e) => e.id === shapeMatch.shape.environmentId);
        const sourceEnvName = sourceEnv?.name ?? shapeMatch.shape.environmentId;

        // Detect target platform
        let targetPlatform: PlatformType = "unknown";
        try {
          targetPlatform = await infraService.getPlatform(environmentId, row.projectId);
        } catch {
          // Platform detection failure should not block the proposal
        }

        if (cancelled) return;

        // Adapt the shape for the target platform
        const adapted = adaptShapeForPlatform(shapeMatch.shape, targetPlatform);
        const hadSubstitutions = adapted.substitutions.length > 0;
        const prov = buildProvenance(
          shapeMatch.shape.command,
          sourceEnvName,
          targetPlatform,
          hadSubstitutions,
        );

        if (!cancelled) {
          setProvenance(prov);
          setAdaptedFrom({
            loopId: shapeMatch.shape.loopId,
            environmentId: shapeMatch.shape.environmentId,
            environmentName: sourceEnvName,
            loopDescription: shapeMatch.shape.command,
            chainSteps: adapted.chainSteps,
            substitutions: adapted.substitutions,
          });
        }
      } catch {
        // Shape matching is best-effort; failures should not block the proposal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [row.status, row.provenance, row.command, row.projectId, environmentId, environments, loopShapeCacheService, infraService]);

  return (
    <LoopProposalCard
      row={{ ...row, provenance, adaptedFrom }}
      instance={instance}
      onApproved={onApproved}
      onRejected={onRejected}
      onStatusChange={onStatusChange}
      similarLoops={similarLoops}
    />
  );
}
