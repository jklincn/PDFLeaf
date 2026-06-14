import type { MouseEvent, PointerEvent } from "react";
import { FilePlus2, FileText, Plus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getExportPagePreviewStyle } from "@/lib/pdf-workspace";
import type { CompletionSnapshot, ExportFile, ExportPage, SourcePage } from "@/types/pdf-workspace";

type ExportPanelProps = {
  exportFiles: ExportFile[];
  activeExportFile: ExportFile | null;
  activeExportPages: ExportPage[];
  selectedExportPageIds: string[];
  draggingExportPageId: string | null;
  completionSnapshot: CompletionSnapshot | null;
  totalExportPageCount: number;
  onCreateExportFile: () => void;
  onSelectExportFile: (fileId: string) => void;
  onOpenFileContextMenu: (fileId: string, x: number, y: number) => void;
  onClearSelectedExportPages: () => void;
  onOpenPageContextMenu: (exportPageId: string, x: number, y: number) => void;
  onReorderExportPage: (targetId: string, sourceId?: string) => void;
  onToggleExportPage: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPreviewPage: (source: SourcePage, rotation: number) => void;
  onStartPageDrag: (pageId: string) => void;
  onEndPageDrag: () => void;
  onRotateExportPages: (pageIds: string[]) => void;
  onRemoveExportPages: (pageIds: string[]) => void;
  onFinishExport: () => void;
};

export function ExportPanel({
  exportFiles,
  activeExportFile,
  activeExportPages,
  selectedExportPageIds,
  draggingExportPageId,
  completionSnapshot,
  totalExportPageCount,
  onCreateExportFile,
  onSelectExportFile,
  onOpenFileContextMenu,
  onClearSelectedExportPages,
  onOpenPageContextMenu,
  onReorderExportPage,
  onToggleExportPage,
  onPreviewPage,
  onStartPageDrag,
  onEndPageDrag,
  onRotateExportPages,
  onRemoveExportPages,
  onFinishExport,
}: ExportPanelProps) {
  const startPagePointerDrag = (event: PointerEvent<HTMLElement>, pageId: string) => {
    if (event.button !== 0 || event.pointerType !== "mouse") {
      return;
    }

    if ((event.target as Element).closest(".export-card-meta button")) {
      return;
    }

    onStartPageDrag(pageId);
  };

  return (
    <section className="export-panel panel-frame" aria-label="导出文件">
      <header className="panel-header">
        <div>
          <h2>导出文件</h2>
        </div>
        <div className="panel-actions">
          <Button type="button" variant="outline" onClick={onCreateExportFile}>
            <FilePlus2 data-icon="inline-start" aria-hidden="true" />
            创建新 PDF 文件
          </Button>
        </div>
      </header>

      {exportFiles.length > 0 && (
        <div className="export-file-tabs" aria-label="输出文件列表">
          {exportFiles.map((file) => (
            <button
              className={activeExportFile?.id === file.id ? "export-file-tab export-file-tab-active" : "export-file-tab"}
              key={file.id}
              type="button"
              onClick={() => onSelectExportFile(file.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenFileContextMenu(file.id, event.clientX, event.clientY);
              }}
            >
              <FileText aria-hidden="true" />
              <span>{file.name}</span>
              <small>{file.pages.length} 页</small>
            </button>
          ))}
        </div>
      )}

      <div
        className={activeExportPages.length === 0 ? "thumbnail-grid export-grid thumbnail-grid-empty" : "thumbnail-grid export-grid"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClearSelectedExportPages();
          }
        }}
      >
        {activeExportPages.length === 0 ? (
          <div className="empty-state">
            <Plus aria-hidden="true" />
            <strong>{activeExportFile ? "输出文件为空" : "创建输出文件"}</strong>
            <span>{activeExportFile ? "选择左侧页面后点击“添加到导出”或“导出全部”" : "点击右上角“创建新 PDF 文件”"}</span>
          </div>
        ) : (
          activeExportPages.map((page, index) => {
            const isSelected = selectedExportPageIds.includes(page.id);
            const previewStyle = getExportPagePreviewStyle(page.source, page.rotation);

            return (
              <article
                className={[
                  "export-card",
                  isSelected ? "export-card-selected" : "",
                  draggingExportPageId === page.id ? "export-card-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={page.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenPageContextMenu(page.id, event.clientX, event.clientY);
                }}
                onPointerDown={(event) => startPagePointerDrag(event, page.id)}
                onPointerEnter={() => {
                  if (draggingExportPageId && draggingExportPageId !== page.id) {
                    onReorderExportPage(page.id, draggingExportPageId);
                  }
                }}
                onPointerUp={onEndPageDrag}
                onPointerCancel={onEndPageDrag}
              >
                <button
                  className="export-thumb-button"
                  type="button"
                  onClick={(event) => onToggleExportPage(page.id, event)}
                  onDoubleClick={() => onPreviewPage(page.source, page.rotation)}
                  aria-pressed={isSelected}
                >
                  <span className="export-page-frame" style={previewStyle}>
                    <img src={page.source.thumbnailUrl} alt={`导出第 ${index + 1} 页`} draggable={false} />
                  </span>
                </button>
                <div className="export-card-meta">
                  <span>{index + 1}</span>
                  <small>
                    {page.source.documentName} · {page.source.pageNumber}
                  </small>
                  <button type="button" onClick={() => onRotateExportPages([page.id])} title="旋转">
                    <RotateCw aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRemoveExportPages([page.id])} title="删除">
                    <X aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <footer className="export-footer">
        <Button className="finish-button" type="button" onClick={onFinishExport} disabled={totalExportPageCount === 0}>
          完成
        </Button>
      </footer>

      {completionSnapshot && (
        <pre className="operation-output" aria-label="操作记录">
          {JSON.stringify(completionSnapshot, null, 2)}
        </pre>
      )}
    </section>
  );
}
