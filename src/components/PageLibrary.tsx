import type { MouseEvent } from "react";
import { Check, CheckCheck, FilePlus2, ListFilter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SourcePage } from "@/types/pdf-workspace";

type PageLibraryProps = {
  sourcePages: SourcePage[];
  selectedSourcePageIds: string[];
  canAddSelected: boolean;
  canSelectAll: boolean;
  statusMessage: string;
  error: string;
  onAddSelectedToExport: () => void;
  onSelectAllSourcePages: () => void;
  onAdvancedSelect: () => void;
  onToggleSourcePage: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPreviewPage: (page: SourcePage) => void;
};

export function PageLibrary({
  sourcePages,
  selectedSourcePageIds,
  canAddSelected,
  canSelectAll,
  statusMessage,
  error,
  onAddSelectedToExport,
  onSelectAllSourcePages,
  onAdvancedSelect,
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
          <Button type="button" variant="outline" onClick={onSelectAllSourcePages} disabled={!canSelectAll}>
            <CheckCheck data-icon="inline-start" aria-hidden="true" />
            全选
          </Button>
          <Button type="button" variant="outline" onClick={onAdvancedSelect} disabled={!canSelectAll}>
            <ListFilter data-icon="inline-start" aria-hidden="true" />
            高级选择
          </Button>
          <Button type="button" variant="outline" onClick={onAddSelectedToExport} disabled={!canAddSelected}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            添加到导出
          </Button>
        </div>
      </header>

      <ScrollArea className="thumbnail-scroll-area" viewportClassName="thumbnail-scroll-viewport">
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
      </ScrollArea>
    </section>
  );
}
