import type { ImportProgress } from "@/types/pdf-workspace";

type ImportProgressDialogProps = {
  progress: ImportProgress;
};

export function ImportProgressDialog({ progress }: ImportProgressDialogProps) {
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="import-progress-overlay">
      <div className="import-progress-dialog">
        <div className="import-progress-label">正在导入 PDF...</div>
        <div className="import-progress-track">
          <div className="import-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="import-progress-info">
          {progress.current} / {progress.total} 页
        </div>
      </div>
    </div>
  );
}
