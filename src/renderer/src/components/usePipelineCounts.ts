import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cid, container } from "inversify-hooks";
import type { ListIssuesResult, InfraActionResult } from "../../../shared/ipc";
import type { IInfraService } from "../services/interfaces";

/** Counts of open issues per pipeline label. */
export type PipelineCounts = Record<string, number>;

/**
 * Hook that periodically fetches issue counts for each configured pipeline label
 * via the platform CLI (through the infra service's list-issues action).
 *
 * - Polls every 30 seconds (issue counts change slowly).
 * - Short-circuits when pipelineLabels is empty (returns null).
 * - Handles errors gracefully: partial failures show whatever succeeded.
 * - Skips polling when the environment is unreachable.
 */
export function usePipelineCounts(
  environmentId: string | undefined,
  pipelineLabels: string[],
  reachability?: "connected" | "reconnecting" | "unreachable",
): PipelineCounts | null {
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const fetchingRef = useRef(false);

  const fetchCounts = useCallback(async (): Promise<void> => {
    if (!environmentId || pipelineLabels.length === 0) {
      setCounts(null);
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const infraService = container.get<IInfraService>(cid.IInfraService as unknown as string);
      const newCounts: PipelineCounts = {};
      let anySuccess = false;

      // Fetch counts for each label sequentially to avoid hammering
      // the platform API with parallel requests
      for (const label of pipelineLabels) {
        try {
          const result: InfraActionResult = await infraService.executeAction({
            action: "list-issues",
            params: { labels: label, state: "open", limit: 1 },
          });
          if (result.ok && result.data) {
            const listResult = result.data as ListIssuesResult;
            newCounts[label] = listResult.total;
            anySuccess = true;
          } else {
            newCounts[label] = -1; // error sentinel
          }
        } catch {
          newCounts[label] = -1;
        }
      }

      if (anySuccess) {
        setCounts(newCounts);
      }
      // If all failed, keep the previous counts (stale is better than empty)
    } finally {
      fetchingRef.current = false;
    }
  }, [environmentId, pipelineLabels]);

  const isReachable = reachability === "connected" || reachability === undefined;
  const labelsKey = useMemo(() => pipelineLabels.join(","), [pipelineLabels]);

  useEffect(() => {
    if (pipelineLabels.length === 0 || !environmentId || !isReachable) {
      setCounts(null);
      return;
    }

    void fetchCounts();

    const timer = setInterval(() => void fetchCounts(), 30_000);
    return () => clearInterval(timer);
  }, [environmentId, pipelineLabels.length, labelsKey, isReachable, fetchCounts]);

  return pipelineLabels.length === 0 ? null : counts;
}
