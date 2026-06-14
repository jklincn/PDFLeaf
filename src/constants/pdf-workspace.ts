export const THUMBNAIL_WIDTH = 144;
export const THUMBNAIL_MAX_HEIGHT = 196;
export const EXPORT_PAGE_PREVIEW_MAX_WIDTH = 118;
export const EXPORT_PAGE_PREVIEW_MAX_HEIGHT = 196;
export const PREVIEW_MIN_SCALE = 0.45;
export const PREVIEW_MAX_SCALE = 10;
export const PREVIEW_MAX_CANVAS_PIXELS = 24_000_000;

export const DEFAULT_EXPORT_FILE_ID = "output-default";
export const DEFAULT_EXPORT_FILE_NAME = "output.pdf";

export const ZOOM_OPTIONS = [
  { value: "auto", label: "自动缩放" },
  { value: "page-actual", label: "实际大小" },
  { value: "page-fit", label: "适合页面" },
  { value: "page-width", label: "适合页宽" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];
