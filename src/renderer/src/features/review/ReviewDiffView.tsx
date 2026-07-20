import { useCallback, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IInfraService, IReviewModeService } from "../../services/interfaces";
import type { DiffFileEntry, InfraActionResult, GetPrDiffResult } from "../../../../shared/ipc";
import { parseDiffLines, type DiffLine } from "./parse-diff";
import { FileCode2, File, Loader2, AlertCircle } from "lucide-react";

/** Per-file diff cache */
interface FileDiffCache {
  lines: DiffLine[];
  loading: boolean;
  error: string | null;
}

export function ReviewDiffView(): React.ReactNode {
  const intl = useIntl();
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);
  const [infraService] = useInject<IInfraService>(cid.IInfraService);

  const activeItem = reviewModeService.getActiveItem();

  const [files, setFiles] = useState<DiffFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [diffCache, setDiffCache] = useState<Map<string, FileDiffCache>>(new Map());
  const [fullDiff, setFullDiff] = useState<string | null>(null);

  // Fetch full diff when the active PR changes
  useEffect(() => {
    if (!activeItem) {
      setFiles([]);
      setSelectedPath(null);
      setFullDiff(null);
      setDiffCache(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    infraService
      .executeAction({
        action: "get-pr-diff",
        params: { repo: activeItem.repo, number: activeItem.number },
      })
      .then((result: InfraActionResult) => {
        if (cancelled) return;
        setLoading(false);

        if (!result.ok || !result.data) {
          setLoadError(
            typeof result.error === "string"
              ? result.error
              : intl.formatMessage({ id: "reviewMode.diffView.loadError" }),
          );
          return;
        }

        const diffResult = result.data as GetPrDiffResult;
        setFiles(diffResult.files);
        setTruncated(diffResult.truncated);
        setFullDiff(diffResult.diff);

        // Auto-select first file
        if (diffResult.files.length > 0) {
          setSelectedPath(diffResult.files[0].path);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(intl.formatMessage({ id: "reviewMode.diffView.loadError" }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem?.repo, activeItem?.number, infraService, intl]);

  // When selectedPath changes, load that file's diff if not cached
  useEffect(() => {
    if (!selectedPath || !activeItem) return;

    const cached = diffCache.get(selectedPath);
    if (cached && (cached.lines.length > 0 || cached.error || cached.loading)) return;

    // Try to extract from full diff first
    if (fullDiff) {
      const sections = fullDiff.split(/(?=^diff --git )/m);
      const matching = sections.find((s) => {
        const match = /^diff --git a\/(.+?) b\/(.+)$/m.exec(s);
        return match && match[2] === selectedPath;
      });

      if (matching) {
        const lines = parseDiffLines(matching);
        setDiffCache((prev) => {
          const next = new Map(prev);
          next.set(selectedPath, { lines, loading: false, error: null });
          return next;
        });
        return;
      }
    }

    // Fall back to per-file fetch via IPC
    let cancelled = false;
    setDiffCache((prev) => {
      const next = new Map(prev);
      next.set(selectedPath, { lines: [], loading: true, error: null });
      return next;
    });

    infraService
      .executeAction({
        action: "get-pr-diff",
        params: { repo: activeItem.repo, number: activeItem.number, path: selectedPath },
      })
      .then((result: InfraActionResult) => {
        if (cancelled) return;

        if (!result.ok || !result.data) {
          setDiffCache((prev) => {
            const next = new Map(prev);
            next.set(selectedPath, {
              lines: [],
              loading: false,
              error: intl.formatMessage({ id: "reviewMode.diffView.loadError" }),
            });
            return next;
          });
          return;
        }

        const diffResult = result.data as GetPrDiffResult;
        const lines = parseDiffLines(diffResult.diff);
        setDiffCache((prev) => {
          const next = new Map(prev);
          next.set(selectedPath, { lines, loading: false, error: null });
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDiffCache((prev) => {
          const next = new Map(prev);
          next.set(selectedPath, {
            lines: [],
            loading: false,
            error: intl.formatMessage({ id: "reviewMode.diffView.loadError" }),
          });
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPath, activeItem?.repo, activeItem?.number, fullDiff, diffCache, infraService, intl]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? null,
    [files, selectedPath],
  );

  const selectedDiff = useMemo(
    () => (selectedPath ? diffCache.get(selectedPath) : undefined),
    [diffCache, selectedPath],
  );

  // Total stats
  const totalAdditions = useMemo(() => files.reduce((s, f) => s + f.additions, 0), [files]);
  const totalDeletions = useMemo(() => files.reduce((s, f) => s + f.deletions, 0), [files]);

  if (!activeItem) return null;

  if (loading) {
    return (
      <div className="review-diff-view">
        <div className="review-diff-loader">
          <Loader2 size={16} className="spin" />
          <span>{intl.formatMessage({ id: "reviewMode.diffView.loading" })}</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="review-diff-view">
        <div className="review-diff-error">
          <AlertCircle size={20} />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="review-diff-view">
      {/* File list */}
      <div className="review-diff-file-list">
        <div className="review-diff-file-list-header">
          <span className="review-diff-file-list-title">
            {intl.formatMessage({ id: "reviewMode.diffView.filesChanged" })} ({files.length})
          </span>
          <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
            <span className="review-diff-file-item-additions">+{totalAdditions}</span>
            <span className="review-diff-file-item-deletions">−{totalDeletions}</span>
          </div>
        </div>
        <div className="review-diff-file-list-items">
          {files.map((file) => (
            <DiffFileItem
              key={file.path}
              file={file}
              isActive={file.path === selectedPath}
              onSelect={handleSelectFile}
            />
          ))}
        </div>
      </div>

      {/* Diff content */}
      <div className="review-diff-content-pane">
        {selectedFile && (
          <div className="review-diff-content-header">
            <span className="review-diff-content-filename">{selectedFile.path}</span>
            <span className="review-diff-content-filestats">
              <span className="review-diff-file-item-additions">+{selectedFile.additions}</span>{" "}
              <span className="review-diff-file-item-deletions">−{selectedFile.deletions}</span>
            </span>
          </div>
        )}
        {truncated && (
          <div className="review-diff-truncated">
            {intl.formatMessage({ id: "reviewMode.diffView.truncated" })}
          </div>
        )}
        <DiffContentPane
          file={selectedFile}
          diffCache={selectedDiff}
        />
      </div>
    </div>
  );
}

// ── File list item ──────────────────────────────────────────────────

function DiffFileItem({
  file,
  isActive,
  onSelect,
}: {
  file: DiffFileEntry;
  isActive: boolean;
  onSelect: (path: string) => void;
}): React.ReactNode {
  return (
    <button
      className={`review-diff-file-item${isActive ? " review-diff-file-item-active" : ""}`}
      onClick={() => onSelect(file.path)}
      aria-selected={isActive}
    >
      <span className="review-diff-file-item-path" title={file.path}>
        {file.path}
      </span>
      {file.isBinary ? (
        <span className="review-diff-file-item-binary">binary</span>
      ) : (
        <span className="review-diff-file-item-stats">
          <span className="review-diff-file-item-additions">+{file.additions}</span>
          <span className="review-diff-file-item-deletions">−{file.deletions}</span>
        </span>
      )}
    </button>
  );
}

// ── Diff content pane ────────────────────────────────────────────────

function DiffContentPane({
  file,
  diffCache,
}: {
  file: DiffFileEntry | null;
  diffCache: FileDiffCache | undefined;
}): React.ReactNode {
  const intl = useIntl();

  if (!file) {
    return (
      <div className="review-diff-empty">
        {intl.formatMessage({ id: "reviewMode.diffView.noFileSelected" })}
      </div>
    );
  }

  if (file.isBinary) {
    return (
      <div className="review-diff-binary-label">
        <File size={24} className="review-diff-binary-icon" />
        {intl.formatMessage({ id: "reviewMode.diffView.binaryFile" })}
      </div>
    );
  }

  if (diffCache?.loading) {
    return (
      <div className="review-diff-loader">
        <Loader2 size={16} className="spin" />
        <span>{intl.formatMessage({ id: "reviewMode.diffView.loading" })}</span>
      </div>
    );
  }

  if (diffCache?.error) {
    return (
      <div className="review-diff-error">
        <AlertCircle size={20} />
        <span>{diffCache.error}</span>
      </div>
    );
  }

  const lines = diffCache?.lines ?? [];

  if (lines.length === 0) {
    return (
      <div className="review-diff-empty">
        <FileCode2 size={20} style={{ opacity: 0.4 }} />
      </div>
    );
  }

  return (
    <div className="review-diff-content-body">
      <table className="review-diff-table">
        <tbody>
          {lines.map((line, i) => (
            <DiffLineRow key={i} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Single diff line row ─────────────────────────────────────────────

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
