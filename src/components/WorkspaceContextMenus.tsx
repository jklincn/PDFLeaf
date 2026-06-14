import { RotateCw, Trash2 } from "lucide-react";
import type {
  ExportFileContextMenu,
  ExportPage,
  ExportPageContextMenu,
  FileContextMenu,
  ImportedPdf,
} from "@/types/pdf-workspace";

type WorkspaceContextMenusProps = {
  fileContextMenu: FileContextMenu | null;
  contextMenuPdf: ImportedPdf | null;
  exportPageContextMenu: ExportPageContextMenu | null;
  contextMenuExportPage: ExportPage | null;
  exportFileContextMenu: ExportFileContextMenu | null;
  exportFileCount: number;
  onDeleteImportedPdf: (documentId: string) => void;
  onRotateExportPage: (exportPageId: string) => void;
  onRemoveExportPage: (exportPageId: string) => void;
  onDeleteExportFile: (fileId: string) => void;
};

export function WorkspaceContextMenus({
  fileContextMenu,
  contextMenuPdf,
  exportPageContextMenu,
  contextMenuExportPage,
  exportFileContextMenu,
  exportFileCount,
  onDeleteImportedPdf,
  onRotateExportPage,
  onRemoveExportPage,
  onDeleteExportFile,
}: WorkspaceContextMenusProps) {
  return (
    <>
      {fileContextMenu && contextMenuPdf && (
        <div className="file-context-menu" style={{ left: fileContextMenu.x, top: fileContextMenu.y }} role="menu">
          <button type="button" role="menuitem" onClick={() => onDeleteImportedPdf(contextMenuPdf.id)}>
            <Trash2 aria-hidden="true" />
            删除文件
          </button>
        </div>
      )}

      {exportPageContextMenu && contextMenuExportPage && (
        <div className="file-context-menu" style={{ left: exportPageContextMenu.x, top: exportPageContextMenu.y }} role="menu">
          <button type="button" role="menuitem" onClick={() => onRotateExportPage(contextMenuExportPage.id)}>
            <RotateCw aria-hidden="true" />
            旋转页面
          </button>
          <button type="button" role="menuitem" onClick={() => onRemoveExportPage(contextMenuExportPage.id)}>
            <Trash2 aria-hidden="true" />
            删除页面
          </button>
        </div>
      )}

      {exportFileContextMenu && (
        <div className="file-context-menu" style={{ left: exportFileContextMenu.x, top: exportFileContextMenu.y }} role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={exportFileCount <= 1}
            onClick={() => onDeleteExportFile(exportFileContextMenu.fileId)}
          >
            <Trash2 aria-hidden="true" />
            删除文件
          </button>
        </div>
      )}
    </>
  );
}
