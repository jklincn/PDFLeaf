import { Hash, ListFilter, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SourcePage } from "@/types/pdf-workspace";
import "@/styles/advanced-select-dialog.css";

type AdvancedSelectDialogProps = {
  open: boolean;
  sourcePages: SourcePage[];
  onClose: () => void;
  onSelect: (pageIds: string[]) => void;
};

type ParsedRange = {
  raw: string;
  from: number;
  to: number;
  count: number;
};

type ParseResult =
  | { ok: true; ranges: ParsedRange[]; pageNumbers: number[] }
  | { ok: false; ranges: ParsedRange[]; error: string };

/**
 * Parse a range input string like "9-11,13-15" or "9-11，13-15"
 * Returns structured range info and a flat list of page numbers.
 */
function parseRangeInput(input: string, maxPage: number): ParseResult {
  const normalized = input.replace(/，/g, ",");
  const parts = normalized.split(",").map((s) => s.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { ok: false, ranges: [], error: "" };
  }

  const ranges: ParsedRange[] = [];
  const pageNumberSet = new Set<number>();
  const errors: string[] = [];

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = part.match(/^(\d+)$/);

    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);

      if (start < 1 || end < 1) {
        errors.push(`"${part}" 页码必须为正数`);
        continue;
      }

      const from = Math.min(start, end);
      const to = Math.max(start, end);

      if (from > maxPage) {
        errors.push(`"${part}" 超出页码范围（最大 ${maxPage}）`);
        continue;
      }

      const clampedTo = Math.min(to, maxPage);
      ranges.push({ raw: part, from, to: clampedTo, count: clampedTo - from + 1 });

      for (let i = from; i <= clampedTo; i++) {
        pageNumberSet.add(i);
      }
    } else if (singleMatch) {
      const num = parseInt(singleMatch[1], 10);

      if (num < 1) {
        errors.push(`"${part}" 页码必须为正数`);
        continue;
      }

      if (num > maxPage) {
        errors.push(`"${part}" 超出页码范围（最大 ${maxPage}）`);
        continue;
      }

      ranges.push({ raw: part, from: num, to: num, count: 1 });
      pageNumberSet.add(num);
    } else {
      errors.push(`"${part}" 格式无效`);
    }
  }

  const pageNumbers = Array.from(pageNumberSet).sort((a, b) => a - b);

  if (ranges.length === 0) {
    return { ok: false, ranges: [], error: errors.join("；") || "请输入有效的页码范围" };
  }

  if (errors.length > 0) {
    return { ok: false, ranges, error: errors.join("；") };
  }

  return { ok: true, ranges, pageNumbers };
}

export function AdvancedSelectDialog({
  open,
  sourcePages,
  onClose,
  onSelect,
}: AdvancedSelectDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setInputValue("");

      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const maxPage = sourcePages.length;

  const parseResult = useMemo(
    () => (inputValue.trim() ? parseRangeInput(inputValue, maxPage) : null),
    [inputValue, maxPage],
  );

  const totalPages = parseResult?.ok ? parseResult.pageNumbers.length : 0;

  const handleConfirm = useCallback(() => {
    if (!parseResult?.ok) return;

    const selectedIds = parseResult.pageNumbers
      .map((pageNum) => {
        const page = sourcePages[pageNum - 1];
        return page?.id ?? null;
      })
      .filter((id): id is string => id !== null);

    if (selectedIds.length > 0) {
      onSelect(selectedIds);
    }

    onClose();
  }, [parseResult, sourcePages, onSelect, onClose]);

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
          {/* Input */}
          <label className="advanced-select-label" htmlFor="advanced-select-input">
            页码范围
          </label>
          <input
            ref={inputRef}
            id="advanced-select-input"
            className={
              parseResult && !parseResult.ok && parseResult.error
                ? "advanced-select-input advanced-select-input-error"
                : "advanced-select-input"
            }
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="如 9-11, 13-15"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="advanced-select-hint">
            多个范围用逗号分隔，支持中英文逗号
          </p>

          {/* Error */}
          {parseResult && !parseResult.ok && parseResult.error && (
            <div className="advanced-select-error">
              {parseResult.error}
            </div>
          )}

          {/* Range rows */}
          {parseResult && parseResult.ranges.length > 0 && (
            <div className="advanced-select-ranges">
              <div className="advanced-select-ranges-header">
                <span>已解析范围</span>
                <span className="advanced-select-ranges-count">
                  共 {totalPages} 页
                </span>
              </div>
              <div className="advanced-select-range-list">
                {parseResult.ranges.map((range, i) => (
                  <div key={i} className="advanced-select-range-row">
                    <Hash className="advanced-select-range-icon" aria-hidden="true" />
                    <span className="advanced-select-range-label">
                      {range.from === range.to
                        ? `第 ${range.from} 页`
                        : `第 ${range.from}-${range.to} 页`}
                    </span>
                    <span className="advanced-select-range-count">
                      {range.count} 页
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Page info */}
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
            disabled={!parseResult?.ok}
          >
            选择 {totalPages > 0 ? `${totalPages} 页` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
