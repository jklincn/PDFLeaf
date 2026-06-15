import { invoke } from "@tauri-apps/api/core";
import { desktopDir } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  FileOutput,
  FolderOpen,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildPdfExportJob } from "@/lib/pdf-export";
import { getErrorMessage } from "@/lib/pdf-workspace";
import type { ExportFile, ImportedPdf } from "@/types/pdf-workspace";
import "@/styles/export-dialog.css";

type Phase = "idle" | "exporting" | "done";

type ExportedFileInfo = {
  outputId: string;
  path: string;
  pageCount: number;
};

type ExportResult = {
  success: boolean;
  outputs: ExportedFileInfo[];
  warnings: Array<{ code: string; message: string }>;
};

type ExportDialogProps = {
  open: boolean;
  exportFiles: ExportFile[];
  importedPdfs: ImportedPdf[];
  onClose: () => void;
  onRenameExportFile: (fileId: string, newName: string) => void;
};

function EditableFileName({
  fileId,
  name,
  disabled,
  onRename,
}: {
  fileId: string;
  name: string;
  disabled: boolean;
  onRename: (fileId: string, newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when name changes externally
  useEffect(() => {
    if (!editing) {
      setDraft(name);
    }
  }, [name, editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(fileId, trimmed);
    } else {
      setDraft(name);
    }
    setEditing(false);
  }, [draft, name, fileId, onRename]);

  const cancel = useCallback(() => {
    setDraft(name);
    setEditing(false);
  }, [name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        cancel();
      }
    },
    [commit, cancel],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="export-dialog-file-name-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className="export-dialog-file-name">
      <span className="export-dialog-file-name-text">{name}</span>
      <button
        type="button"
        className="export-dialog-file-edit-btn"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        disabled={disabled}
        aria-label={`重命名 ${name}`}
        title="点击编辑文件名"
      >
        <Pencil aria-hidden="true" />
      </button>
    </span>
  );
}

export function ExportDialog({
  open,
  exportFiles,
  importedPdfs,
  onClose,
  onRenameExportFile,
}: ExportDialogProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [outputDir, setOutputDir] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // 初始化默认桌面路径
  useEffect(() => {
    if (open && !outputDir) {
      desktopDir().then(setOutputDir).catch(() => {});
    }
  }, [open, outputDir]);

  // 关闭时重置状态
  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setPhase("idle");
        setExportError("");
        setExportResult(null);
      }, 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  const handleChooseDir = useCallback(async () => {
    const chosen = await openDialog({
      title: "选择导出目录",
      directory: true,
      defaultPath: outputDir || undefined,
    });
    if (chosen) {
      setOutputDir(chosen);
    }
  }, [outputDir]);

  const handleExport = useCallback(async () => {
    if (!outputDir) return;

    setPhase("exporting");
    setExportError("");

    const job = buildPdfExportJob(exportFiles, importedPdfs);
    const sep = outputDir.includes("\\") ? "\\" : "/";
    const jobWithPaths = {
      ...job,
      outputs: job.outputs.map((output) => ({
        ...output,
        outputPath: `${outputDir}${sep}${output.outputPath}`,
      })),
      options: {
        overwritePolicy: "rename" as const,
        createParentDirs: true,
      },
    };

    try {
      const result = (await invoke("export_pdfs", {
        job: jobWithPaths,
      })) as ExportResult;
      setExportResult(result);
      setPhase("done");
    } catch (err) {
      setExportError(getErrorMessage(err));
      setPhase("done");
    }
  }, [outputDir, exportFiles, importedPdfs]);

  const nonEmptyFiles = exportFiles.filter((f) => f.pages.length > 0);
  const totalPages = nonEmptyFiles.reduce((sum, f) => sum + f.pages.length, 0);
  const isExporting = phase === "exporting";

  if (!open) return null;

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div
        className="export-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="导出 PDF"
      >
        {/* Header */}
        <div className="export-dialog-header">
          <div className="export-dialog-title-row">
            <FileOutput className="export-dialog-title-icon" aria-hidden="true" />
            <h2 className="export-dialog-title">导出 PDF</h2>
          </div>
          <button
            type="button"
            className="export-dialog-close"
            onClick={onClose}
            aria-label="关闭"
            disabled={isExporting}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {/* Path selector */}
        <div className="export-dialog-path">
          <label className="export-dialog-label">保存位置</label>
          <div className="export-dialog-path-row">
            <div className="export-dialog-path-display">
              <FolderOpen className="export-dialog-path-icon" aria-hidden="true" />
              <span className="export-dialog-path-text">
                {outputDir || "正在获取桌面路径..."}
              </span>
            </div>
            <button
              type="button"
              className="export-dialog-change-btn"
              onClick={handleChooseDir}
              disabled={isExporting}
            >
              更改
            </button>
          </div>
        </div>

        {/* File summary */}
        <div className="export-dialog-summary">
          <div className="export-dialog-summary-header">
            <span className="export-dialog-label">
              导出文件
            </span>
            <span className="export-dialog-summary-meta">
              共 {totalPages} 页
            </span>
          </div>
          <ScrollArea className="export-dialog-file-list">
            <div className="export-dialog-file-items">
              {nonEmptyFiles.map((file) => (
                <div key={file.id} className="export-dialog-file-item">
                  <EditableFileName
                    fileId={file.id}
                    name={file.name}
                    disabled={isExporting}
                    onRename={onRenameExportFile}
                  />
                  <span className="export-dialog-file-pages">
                    {file.pages.length} 页
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Result / Error display */}
        {phase === "exporting" && (
          <div className="export-dialog-status exporting">
            <Loader2 className="export-dialog-spinner" aria-hidden="true" />
            <span>正在导出...</span>
          </div>
        )}

        {phase === "done" && exportError && (
          <div className="export-dialog-status error">
            <AlertTriangle className="export-dialog-status-icon" aria-hidden="true" />
            <div className="export-dialog-status-text">
              <strong>导出失败</strong>
              <span>{exportError}</span>
            </div>
          </div>
        )}

        {phase === "done" && exportResult && (
          <div
            className={`export-dialog-status ${exportResult.success ? "success" : "partial"}`}
          >
            <CheckCircle2 className="export-dialog-status-icon" aria-hidden="true" />
            <div className="export-dialog-status-text">
              <strong>
                {exportResult.success
                  ? "导出完成"
                  : `完成 ${exportResult.outputs.length} 个，${exportResult.warnings.length} 个失败`}
              </strong>
              {exportResult.outputs.length > 0 && (
                <div className="export-dialog-result-files">
                  {exportResult.outputs.map((f) => (
                    <span key={f.outputId} className="export-dialog-result-file">
                      {f.path.split(/[\\/]/).pop() || f.path}
                    </span>
                  ))}
                </div>
              )}
              {exportResult.warnings.length > 0 && (
                <div className="export-dialog-warnings">
                  {exportResult.warnings.map((w, i) => (
                    <span key={i} className="export-dialog-warning-item">
                      {w.message}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="export-dialog-footer">
          {phase === "idle" && (
            <Button
              className="export-dialog-action-btn"
              onClick={handleExport}
              disabled={!outputDir || nonEmptyFiles.length === 0}
            >
              导出
            </Button>
          )}

          {phase === "exporting" && (
            <Button className="export-dialog-action-btn" disabled>
              <Loader2 className="animate-spin" aria-hidden="true" />
              导出中...
            </Button>
          )}

          {phase === "done" && (
            <Button className="export-dialog-action-btn" onClick={onClose}>
              {exportError ? "关闭" : "完成"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
