import { FilePlus2, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportedPdf } from "@/types/pdf-workspace";

type ImportRailProps = {
  importedPdfs: ImportedPdf[];
  activeImportedPdfId?: string;
  isImporting: boolean;
  onImportPdfs: () => void;
  onSelectImportedPdf: (documentId: string) => void;
  onOpenContextMenu: (documentId: string, x: number, y: number) => void;
};

export function ImportRail({
  importedPdfs,
  activeImportedPdfId,
  isImporting,
  onImportPdfs,
  onSelectImportedPdf,
  onOpenContextMenu,
}: ImportRailProps) {
  return (
    <aside className="import-rail" aria-label="已导入文件">
      <div className="rail-heading">
        <span>已导入文件</span>
        <Button type="button" variant="ghost" size="icon" onClick={onImportPdfs} disabled={isImporting} title="导入 PDF">
          <FilePlus2 aria-hidden="true" />
        </Button>
      </div>

      <div className="file-list">
        {importedPdfs.length === 0 ? (
          <button className="drop-import" type="button" onClick={onImportPdfs}>
            <Plus aria-hidden="true" />
            <span>点击导入 PDF</span>
          </button>
        ) : (
          importedPdfs.map((pdf) => (
            <button
              className={activeImportedPdfId === pdf.id ? "file-item file-item-active" : "file-item"}
              key={pdf.id}
              type="button"
              onClick={() => onSelectImportedPdf(pdf.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenContextMenu(pdf.id, event.clientX, event.clientY);
              }}
            >
              <FileText aria-hidden="true" />
              <div>
                <strong title={pdf.name}>{pdf.name}</strong>
                <span>{pdf.pageCount} 页</span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
