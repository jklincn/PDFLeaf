import { ListFilter, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SourcePage } from "@/types/pdf-workspace";
import "@/styles/advanced-select-dialog.css";

type AdvancedSelectDialogProps = {
  open: boolean;
  sourcePages: SourcePage[];
  onClose: () => void;
  onSelect: (pageIds: string[]) => void;
};

/**
 * Parse a range input string like "9-11,13-15" or "9-11，13-15"
 * Returns an array of page numbers (1-based).
 */
function parseRangeInput(input: string): number[] {
  // Normalize Chinese commas to English commas
  const normalized = input.replace(/，/g, ",");

  // Split by comma, trim each part
  const parts = normalized.split(",").map((s) => s.trim()).filter(Boolean);

  const pageNumbers = new Set<number>();

  for (const part of parts) {
    // Match patterns: "5", "9-11"
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = part.match(/^(\d+)$/);

    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);

      if (start < 1 || end < 1) continue;

      const from = Math.min(start, end);
      const to = Math.max(start, end);

      for (let i = from; i <= to; i++) {
        pageNumbers.add(i);
      }
    } else if (singleMatch) {
      const num = parseInt(singleMatch[1], 10);

      if (num >= 1) {
        pageNumbers.add(num);
      }
    }
    // Invalid patterns are silently ignored
  }

  return Array.from(pageNumbers).sort((a, b) => a - b);
}

export function AdvancedSelectDialog({
  open,
  sourcePages,
  onClose,
  onSelect,
}: AdvancedSelectDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [previewText, setPreviewText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setInputValue("");
      setError("");
      setPreviewText("");

      // Focus input after animation
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const maxPage = sourcePages.length;

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);

      if (!value.trim()) {
        setError("");
        setPreviewText("");
        return;
      }

      const pageNumbers = parseRangeInput(value);

      if (pageNumbers.length === 0) {
        setError("请输入有效的页码范围，如 9-11 或 9-11,13-15");
        setPreviewText("");
        return;
      }

      // Check for out-of-range pages
      const outOfRange = pageNumbers.filter((n) => n > maxPage);

      if (outOfRange.length > 0) {
        setError(`页码 ${outOfRange.join(", ")} 超出范围（当前共 ${maxPage} 页）`);
        setPreviewText("");
        return;
      }

      setError("");

      // Build preview text
      if (pageNumbers.length <= 10) {
        setPreviewText(`将选择第 ${pageNumbers.join(", ")} 页，共 ${pageNumbers.length} 页`);
      } else {
        const firstFew = pageNumbers.slice(0, 5).join(", ");
        setPreviewText(`将选择第 ${firstFew}... 等 ${pageNumbers.length} 页`);
      }
    },
    [maxPage],
  );

  const handleConfirm = useCallback(() => {
    if (!inputValue.trim() || error) return;

    const pageNumbers = parseRangeInput(inputValue);

    if (pageNumbers.length === 0) return;

    // Map page numbers (1-based) to source page IDs
    const selectedIds = pageNumbers
      .map((pageNum) => {
        // sourcePages is 0-indexed, pageNum is 1-based
        const page = sourcePages[pageNum - 1];
        return page?.id ?? null;
      })
      .filter((id): id is string => id !== null);

    if (selectedIds.length > 0) {
      onSelect(selectedIds);
    }

    onClose();
  }, [inputValue, error, sourcePages, onSelect, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleConfirm, onClose],
  );

  if (!open) return null;

  return (
    <div className="advanced-select-overlay" onClick={onClose}>
      <div
        className="advanced-select-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="高级选择"
      >
        {/* Header */}
        <div className="advanced-select-header">
          <div className="advanced-select-title-row">
            <ListFilter className="advanced-select-title-icon" aria-hidden="true" />
            <h2 className="advanced-select-title">高级选择</h2>
          </div>
          <button
            type="button"
            className="advanced-select-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="advanced-select-body">
          <label className="advanced-select-label" htmlFor="advanced-select-input">
            页码范围
          </label>
          <input
            ref={inputRef}
            id="advanced-select-input"
            className={error ? "advanced-select-input advanced-select-input-error" : "advanced-select-input"}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="如 9-11,13-15（支持中英文逗号分隔）"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="advanced-select-hint">
            支持格式：单页 <code>5</code>、范围 <code>9-11</code>、多个用逗号分隔 <code>9-11,13-15</code>
          </p>

          {error && (
            <div className="advanced-select-error">
              {error}
            </div>
          )}

          {previewText && !error && (
            <div className="advanced-select-preview">
              {previewText}
            </div>
          )}

          <div className="advanced-select-info">
            当前文件共 <strong>{maxPage}</strong> 页
          </div>
        </div>

        {/* Footer */}
        <div className="advanced-select-footer">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            className="advanced-select-confirm-btn"
            onClick={handleConfirm}
            disabled={!inputValue.trim() || Boolean(error)}
          >
            选择
          </Button>
        </div>
      </div>
    </div>
  );
}
