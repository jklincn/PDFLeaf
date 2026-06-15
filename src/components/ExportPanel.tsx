import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { FilePlus2, FileText, Plus, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getExportPagePreviewStyle } from "@/lib/pdf-workspace";
import type { CompletionSnapshot, ExportFile, ExportPage, SourcePage } from "@/types/pdf-workspace";

const AUTO_SCROLL_EDGE_SIZE = 88;
const AUTO_SCROLL_MAX_SPEED = 22;

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
  const exportGridRef = useRef<HTMLDivElement>(null);
  const latestPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const [dragPreviewPosition, setDragPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingExportPage = useMemo(
    () => activeExportPages.find((page) => page.id === draggingExportPageId) ?? null,
    [activeExportPages, draggingExportPageId],
  );

  useEffect(() => {
    if (!draggingExportPageId) {
      setDragPreviewPosition(null);
      latestPointerPositionRef.current = null;

      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }

      return;
    }

    const reorderPageUnderPointer = () => {
      const pointerPosition = latestPointerPositionRef.current;

      if (!pointerPosition) {
        return;
      }

      const elementUnderPointer = document.elementFromPoint(pointerPosition.x, pointerPosition.y);
      const exportCard = elementUnderPointer?.closest<HTMLElement>("[data-export-page-id]");
      const targetPageId = exportCard?.dataset.exportPageId;

      if (targetPageId && targetPageId !== draggingExportPageId) {
        onReorderExportPage(targetPageId, draggingExportPageId);
      }
    };

    const runAutoScroll = () => {
      const exportGrid = exportGridRef.current;
      const pointerPosition = latestPointerPositionRef.current;

      if (exportGrid && pointerPosition) {
        const gridRect = exportGrid.getBoundingClientRect();
        let scrollSpeed = 0;

        if (pointerPosition.y < gridRect.top + AUTO_SCROLL_EDGE_SIZE) {
          const edgeProgress = (gridRect.top + AUTO_SCROLL_EDGE_SIZE - pointerPosition.y) / AUTO_SCROLL_EDGE_SIZE;
          scrollSpeed = -Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, edgeProgress));
        } else if (pointerPosition.y > gridRect.bottom - AUTO_SCROLL_EDGE_SIZE) {
          const edgeProgress = (pointerPosition.y - (gridRect.bottom - AUTO_SCROLL_EDGE_SIZE)) / AUTO_SCROLL_EDGE_SIZE;
          scrollSpeed = Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, edgeProgress));
        }

        if (scrollSpeed !== 0) {
          exportGrid.scrollTop += scrollSpeed;
          reorderPageUnderPointer();
        }
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    };

    const updateDragPreviewPosition = (event: globalThis.PointerEvent) => {
      latestPointerPositionRef.current = { x: event.clientX, y: event.clientY };
      setDragPreviewPosition(latestPointerPositionRef.current);
    };

    window.addEventListener("pointermove", updateDragPreviewPosition);
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);

    return () => {
      window.removeEventListener("pointermove", updateDragPreviewPosition);

      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [draggingExportPageId, onReorderExportPage]);

  const startPagePointerDrag = (event: PointerEvent<HTMLElement>, pageId: string) => {
    if (event.button !== 0 || event.pointerType !== "mouse") {
      return;
    }

    if ((event.target as Element).closest(".export-card-meta button")) {
      return;
    }

    onStartPageDrag(pageId);
    latestPointerPositionRef.current = { x: event.clientX, y: event.clientY };
    setDragPreviewPosition(latestPointerPositionRef.current);
  };

  const dragPreviewStyle = dragPreviewPosition
    ? ({
        left: `${dragPreviewPosition.x}px`,
        top: `${dragPreviewPosition.y}px`,
      } satisfies CSSProperties)
    : undefined;

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

      <ScrollArea
        className="thumbnail-scroll-area"
        viewportClassName="thumbnail-scroll-viewport"
        viewportRef={exportGridRef}
      >
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
                  data-export-page-id={page.id}
                  style={previewStyle}
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
                    <span className="export-page-frame">
                      <img src={page.source.thumbnailUrl} alt={`导出第 ${index + 1} 页`} draggable={false} />
                    </span>
                  </button>
                  <span className="export-card-source" title={`${page.source.documentName}: ${page.source.pageNumber}`}>
                    <span className="export-card-source-name">{page.source.documentName}</span>
                    <span className="export-card-source-sep">:</span>
                    <span className="export-card-source-page">{page.source.pageNumber}</span>
                  </span>
                  <div className="export-card-meta">
                    <button type="button" onClick={() => onRotateExportPages([page.id])} title="旋转">
                      <RotateCw aria-hidden="true" />
                    </button>
                    <span>{index + 1}</span>
                    <button type="button" onClick={() => onRemoveExportPages([page.id])} title="删除">
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </ScrollArea>

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

      {draggingExportPage && dragPreviewStyle && (
        <div className="export-drag-preview" style={dragPreviewStyle} aria-hidden="true">
          <span className="export-drag-preview-frame" style={getExportPagePreviewStyle(draggingExportPage.source, draggingExportPage.rotation)}>
            <img src={draggingExportPage.source.thumbnailUrl} alt="" draggable={false} />
          </span>
        </div>
      )}
    </section>
  );
}
