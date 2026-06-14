import type { MouseEvent } from "react";
import { Check, FilePlus2, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SourcePage } from "@/types/pdf-workspace";

type PageLibraryProps = {
  sourcePages: SourcePage[];
  selectedSourcePageIds: string[];
  canAddSelected: boolean;
  canExportAll: boolean;
  statusMessage: string;
  error: string;
  onAddSelectedToExport: () => void;
  onExportAllSourcePages: () => void;
  onToggleSourcePage: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPreviewPage: (page: SourcePage) => void;
};

export function PageLibrary({
  sourcePages,
  selectedSourcePageIds,
  canAddSelected,
  canExportAll,
  statusMessage,
  error,
  onAddSelectedToExport,
  onExportAllSourcePages,
  onToggleSourcePage,
  onPreviewPage,
}: PageLibraryProps) {
  return (
    <section className="page-library panel-frame" aria-label="页面库">
      <header className="panel-header">
        <div>
          <h1>页面库</h1>
        </div>
        <div className="panel-actions">
          <Button type="button" variant="outline" onClick={onExportAllSourcePages} disabled={!canExportAll}>
            <FileText data-icon="inline-start" aria-hidden="true" />
            导出全部
          </Button>
          <Button type="button" variant="outline" onClick={onAddSelectedToExport} disabled={!canAddSelected}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            添加到导出
          </Button>
        </div>
      </header>

      <div className={sourcePages.length === 0 ? "thumbnail-grid source-grid thumbnail-grid-empty" : "thumbnail-grid source-grid"}>
        {sourcePages.length === 0 ? (
          <div className="empty-state">
            <FilePlus2 aria-hidden="true" />
            <strong>页面库为空</strong>
            <span>{error || statusMessage}</span>
          </div>
        ) : (
          sourcePages.map((page) => {
            const isSelected = selectedSourcePageIds.includes(page.id);

            return (
              <button
                className={isSelected ? "page-thumb page-thumb-selected" : "page-thumb"}
                key={page.id}
                type="button"
                onClick={(event) => onToggleSourcePage(page.id, event)}
                onDoubleClick={() => onPreviewPage(page)}
                aria-pressed={isSelected}
              >
                <span className="thumb-image-wrap" style={{ aspectRatio: `${page.pageWidth} / ${page.pageHeight}` }}>
                  <img src={page.thumbnailUrl} alt={`${page.documentName} 第 ${page.pageNumber} 页`} />
                  {isSelected && (
                    <span className="selection-check">
                      <Check aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="thumb-caption">
                  <strong>{page.pageNumber}</strong>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
