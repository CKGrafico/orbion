import { useCallback, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IInfraService, IReviewModeService } from "../../services/interfaces";
import type {
  DiffFileEntry,
  GetPrBriefingResult,
  InfraActionResult,
} from "../../../../shared/ipc";
import { parseDiffLines, type DiffLine, getBriefingTotals, formatBriefingStats } from "./parse-diff";
import { Shield, ChevronDown, ChevronRight, FileCode2, Loader2, AlertCircle } from "lucide-react";

/** Risk chip class for a flagged file (derived from path analysis). */
function fileRiskClass(path: string): string {
  const highRiskPatterns = /(^|[/])(auth|credential|secret|password|token|permission|security|crypto|ssl|tls)/i;
  const mediumRiskPatterns = /(^|[/])(config|\.env|docker-compose|Dockerfile|Makefile|package\.json|tsconfig)/i;

  if (highRiskPatterns.test(path)) return "pr-risk-chip pr-risk-chip-high";
  if (mediumRiskPatterns.test(path)) return "pr-risk-chip pr-risk-chip-medium";
  return "pr-risk-chip pr-risk-chip-low";
}

function fileRiskLabel(path: string, intl: ReturnType<typeof useIntl>): string {
  const highRiskPatterns = /(^|[/])(auth|credential|secret|password|token|permission|security|crypto|ssl|tls)/i;
  const mediumRiskPatterns = /(^|[/])(config|\.env|docker-compose|Dockerfile|Makefile|package\.json|tsconfig)/i;

  if (highRiskPatterns.test(path)) return intl.formatMessage({ id: "inbox.prRisk.high" });
  if (mediumRiskPatterns.test(path)) return intl.formatMessage({ id: "inbox.prRisk.medium" });
  return intl.formatMessage({ id: "inbox.prRisk.low" });
}

export function ReviewBriefingView(): React.ReactNode {
  const intl = useIntl();
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);
  const [infraService] = useInject<IInfraService>(cid.IInfraService);

  const activeItem = reviewModeService.getActiveItem();

  const [briefing, setBriefing] = useState<GetPrBriefingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedBoilerplate, setExpandedBoilerplate] = useState(false);

  // Per-file diff cache for flagged file inline hunks
  const [flaggedDiffCache, setFlaggedDiffCache] = useState<Map<string, DiffLine[]>>(new Map());

  // Fetch briefing when active PR changes
  useEffect(() => {
    if (!activeItem) {
      setBriefing(null);
      setFlaggedDiffCache(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setExpandedBoilerplate(false);

    infraService
      .executeAction({
        action: "get-pr-briefing",
        params: { repo: activeItem.repo, number: activeItem.number },
      })
      .then((result: InfraActionResult) => {
        if (cancelled) return;
        setLoading(false);

        if (!result.ok || !result.data) {
          setLoadError(
            typeof result.error === "string"
              ? result.error
              : intl.formatMessage({ id: "reviewMode.briefing.loadError" }),
          );
          return;
        }

        setBriefing(result.data as GetPrBriefingResult);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(intl.formatMessage({ id: "reviewMode.briefing.loadError" }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem?.repo, activeItem?.number, infraService, intl]);

  // Fetch full diff for inline flagged hunks
  useEffect(() => {
    if (!activeItem || !briefing) return;

    const flaggedSection = briefing.sections.find((s) => s.kind === "flagged");
    if (!flaggedSection) return;

    // Only fetch if we haven't already cached diffs for the flagged files
    const uncachedFiles = flaggedSection.files.filter(
      (f) => !flaggedDiffCache.has(f.path) && !f.isBinary,
    );
    if (uncachedFiles.length === 0) return;

    let cancelled = false;

    infraService
      .executeAction({
        action: "get-pr-diff",
        params: { repo: activeItem.repo, number: activeItem.number },
      })
      .then((result: InfraActionResult) => {
        if (cancelled) return;
        if (!result.ok || !result.data) return;

        const diffResult = result.data as { diff: string };
        const sections = diffResult.diff.split(/(?=^diff --git )/m);
        const newCache = new Map(flaggedDiffCache);

        for (const section of sections) {
          const match = /^diff --git a\/(.+?) b\/(.+)$/m.exec(section);
          if (match) {
            const filePath = match[2];
            if (flaggedSection.files.some((f) => f.path === filePath) && !newCache.has(filePath)) {
              const lines = parseDiffLines(section);
              newCache.set(filePath, lines);
            }
          }
        }

        setFlaggedDiffCache(newCache);
      })
      .catch(() => {
        // Silently fail; flagged hunks will show file name without inline diff
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem?.repo, activeItem?.number, briefing, flaggedDiffCache, infraService]);

  const toggleBoilerplate = useCallback(() => {
    setExpandedBoilerplate((prev) => !prev);
  }, []);

  const totals = useMemo(
    () => (briefing ? getBriefingTotals(briefing.sections) : null),
    [briefing],
  );

  if (!activeItem) return null;

  if (loading) {
    return (
      <div className="review-briefing-view">
        <div className="review-briefing-loader">
          <Loader2 size={16} className="spin" />
          <span>{intl.formatMessage({ id: "reviewMode.briefing.loading" })}</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="review-briefing-view">
        <div className="review-briefing-error">
          <AlertCircle size={20} />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  const flaggedSection = briefing.sections.find((s) => s.kind === "flagged");
  const boilerplateSection = briefing.sections.find((s) => s.kind === "boilerplate");

  return (
    <div className="review-briefing-view">
      {/* Summary */}
      <div className="review-briefing-summary">
        <Shield size={16} className="review-briefing-summary-icon" />
        <span className="review-briefing-summary-text">{briefing.summary}</span>
      </div>

      {/* Flagged section */}
      {flaggedSection && (
        <div className="review-briefing-section review-briefing-flagged">
          <div className="review-briefing-section-header">
            <span className="review-briefing-section-title">
              {intl.formatMessage({ id: "reviewMode.briefing.flaggedChanges" })}
            </span>
            {totals && (
              <span className="review-briefing-section-stats">
                {formatBriefingStats(totals.totalFlaggedAdd, totals.totalFlaggedDel)}
              </span>
            )}
          </div>
          <div className="review-briefing-flagged-files">
            {flaggedSection.files.map((file) => (
              <FlaggedFileBlock
                key={file.path}
                file={file}
                diffLines={flaggedDiffCache.get(file.path)}
                intl={intl}
              />
            ))}
          </div>
        </div>
      )}

      {!flaggedSection && (
        <div className="review-briefing-no-flagged">
          <FileCode2 size={20} style={{ opacity: 0.4 }} />
          <span>{intl.formatMessage({ id: "reviewMode.briefing.noFlagged" })}</span>
        </div>
      )}

      {/* Boilerplate section */}
      {boilerplateSection && boilerplateSection.group && (
        <div className="review-briefing-section review-briefing-boilerplate">
          <button
            className="review-briefing-boilerplate-header"
            onClick={toggleBoilerplate}
            aria-expanded={expandedBoilerplate}
          >
            <span className="review-briefing-boilerplate-toggle">
              {expandedBoilerplate ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="review-briefing-boilerplate-summary">
              {formatBriefingStats(boilerplateSection.group.additions, boilerplateSection.group.deletions)}{" "}
              {boilerplateSection.group.label}
            </span>
            {!expandedBoilerplate && (
              <span className="review-briefing-boilerplate-expand">
                {intl.formatMessage({ id: "reviewMode.briefing.expand" })}
              </span>
            )}
          </button>
          {expandedBoilerplate && (
            <div className="review-briefing-boilerplate-files">
              {boilerplateSection.group.files.map((file) => (
                <div key={file.path} className="review-briefing-boilerplate-file">
                  <span className="review-briefing-boilerplate-file-path" title={file.path}>
                    {file.path}
                  </span>
                  <span className="review-briefing-boilerplate-file-stats">
                    <span className="review-diff-file-item-additions">+{file.additions}</span>
                    <span className="review-diff-file-item-deletions">-{file.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Flagged file block with inline hunks ─────────────────────────────

function FlaggedFileBlock({
  file,
  diffLines,
  intl,
}: {
  file: DiffFileEntry;
  diffLines: DiffLine[] | undefined;
  intl: ReturnType<typeof useIntl>;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(true);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="review-briefing-flagged-file">
      <button className="review-briefing-flagged-file-header" onClick={toggleExpand}>
        <span className="review-briefing-flagged-file-toggle">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="review-briefing-flagged-file-path" title={file.path}>
          {file.path}
        </span>
        <span className={fileRiskClass(file.path)}>
          {fileRiskLabel(file.path, intl)}
        </span>
        <span className="review-briefing-flagged-file-stats">
          <span className="review-diff-file-item-additions">+{file.additions}</span>
          <span className="review-diff-file-item-deletions">-{file.deletions}</span>
        </span>
      </button>
      {expanded && diffLines && diffLines.length > 0 && (
        <div className="review-briefing-flagged-file-diff">
          <table className="review-diff-table">
            <tbody>
              {diffLines.map((line, i) => (
                <DiffLineRow key={i} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {expanded && (!diffLines || diffLines.length === 0) && file.isBinary && (
        <div className="review-diff-binary-label">
          {intl.formatMessage({ id: "reviewMode.diffView.binaryFile" })}
        </div>
      )}
    </div>
  );
}

// ── Single diff line row (shared with ReviewDiffView) ───────────────

function DiffLineRow({ line }: { line: DiffLine }): React.ReactNode {
  let rowClass = "review-diff-line";
  switch (line.type) {
    case "hunk-header":
      rowClass += " review-diff-line-hunk-header";
      break;
    case "addition":
      rowClass += " review-diff-line-addition";
      break;
    case "removal":
      rowClass += " review-diff-line-removal";
      break;
    case "context":
      rowClass += " review-diff-line-context";
      break;
  }

  return (
    <tr className={rowClass}>
      <td className="review-diff-lineno">
        {line.oldLineNo !== null ? String(line.oldLineNo) : ""}
      </td>
      <td className="review-diff-lineno">
        {line.newLineNo !== null ? String(line.newLineNo) : ""}
      </td>
      <td className="review-diff-content">{line.content}</td>
    </tr>
  );
}
