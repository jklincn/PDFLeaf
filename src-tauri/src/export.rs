use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::path::Path;

// ── Data structures ──────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportJob {
    pub schema_version: u32,
    pub sources: Vec<SourceDocument>,
    pub outputs: Vec<OutputDocument>,
    #[serde(default)]
    pub options: Option<ExportJobOptions>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocument {
    pub id: String,
    pub path: String,
    pub name: String,
    pub page_count: u32,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDocument {
    pub id: String,
    pub output_path: String,
    #[serde(default)]
    pub name: Option<String>,
    pub pages: Vec<OutputPage>,
    #[serde(default)]
    pub options: Option<OutputDocumentOptions>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPage {
    pub id: String,
    pub source: PageSource,
    #[serde(default)]
    pub transform: Option<PageTransform>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSource {
    pub document_id: String,
    pub page_number: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageTransform {
    #[serde(default)]
    pub rotate: Option<u16>,
    #[serde(default)]
    pub crop: Option<CropRect>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", tag = "unit")]
pub enum CropRect {
    #[serde(rename = "ratio")]
    Ratio {
        origin: CropOrigin,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    #[serde(rename = "pt")]
    Pt {
        origin: CropOrigin,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CropOrigin {
    TopLeft,
    BottomLeft,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobOptions {
    #[serde(default)]
    pub overwrite_policy: Option<OverwritePolicy>,
    #[serde(default)]
    pub create_parent_dirs: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDocumentOptions {
    #[serde(default)]
    pub linearize: Option<bool>,
    #[serde(default)]
    pub preserve_metadata: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OverwritePolicy {
    Fail,
    Replace,
    Rename,
}

// ── Response structures ───────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub outputs: Vec<ExportedFile>,
    pub warnings: Vec<ExportWarning>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub output_id: String,
    pub path: String,
    pub page_count: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWarning {
    pub code: String,
    pub message: String,
    pub output_id: Option<String>,
    pub page_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportError {
    pub code: String,
    pub message: String,
    pub output_id: Option<String>,
    pub page_id: Option<String>,
    pub details: Option<String>,
}

impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}] {}",
            self.code,
            self.details.as_deref().unwrap_or(&self.message)
        )
    }
}

impl std::error::Error for ExportError {}

// ── Validation ────────────────────────────────────────────────────

const ALLOWED_ROTATIONS: [u16; 4] = [0, 90, 180, 270];

fn validate_job(job: &PdfExportJob) -> Vec<ExportWarning> {
    let mut warnings: Vec<ExportWarning> = Vec::new();

    if job.schema_version != 1 {
        warnings.push(ExportWarning {
            code: "UNSUPPORTED_SCHEMA_VERSION".into(),
            message: format!(
                "schemaVersion {} 不受支持，当前只支持版本 1",
                job.schema_version
            ),
            output_id: None,
            page_id: None,
        });
        return warnings;
    }

    if job.sources.is_empty() {
        warnings.push(ExportWarning {
            code: "EMPTY_SOURCES".into(),
            message: "sources 不能为空".into(),
            output_id: None,
            page_id: None,
        });
    }

    if job.outputs.is_empty() {
        warnings.push(ExportWarning {
            code: "EMPTY_OUTPUTS".into(),
            message: "outputs 不能为空".into(),
            output_id: None,
            page_id: None,
        });
    }

    let mut source_ids = HashSet::new();
    for source in &job.sources {
        if !source_ids.insert(&source.id) {
            warnings.push(ExportWarning {
                code: "DUPLICATE_SOURCE_ID".into(),
                message: format!("source.id \"{}\" 重复", source.id),
                output_id: None,
                page_id: None,
            });
        }
    }

    let mut output_ids = HashSet::new();
    for output in &job.outputs {
        if !output_ids.insert(&output.id) {
            warnings.push(ExportWarning {
                code: "DUPLICATE_OUTPUT_ID".into(),
                message: format!("output.id \"{}\" 重复", output.id),
                output_id: Some(output.id.clone()),
                page_id: None,
            });
        }
    }

    let input_paths: HashSet<String> =
        job.sources.iter().map(|s| normalize_path(&s.path)).collect();

    for output in &job.outputs {
        if output.pages.is_empty() {
            warnings.push(ExportWarning {
                code: "EMPTY_OUTPUT_PAGES".into(),
                message: format!("output \"{}\" 的 pages 不能为空", output.id),
                output_id: Some(output.id.clone()),
                page_id: None,
            });
        }

        if input_paths.contains(&normalize_path(&output.output_path)) {
            warnings.push(ExportWarning {
                code: "OUTPUT_OVERWRITES_INPUT".into(),
                message: format!(
                    "outputPath \"{}\" 不能覆盖输入文件",
                    output.output_path
                ),
                output_id: Some(output.id.clone()),
                page_id: None,
            });
        }

        for (idx, page) in output.pages.iter().enumerate() {
            let source = job.sources.iter().find(|s| s.id == page.source.document_id);
            match source {
                None => {
                    warnings.push(ExportWarning {
                        code: "UNKNOWN_SOURCE_DOCUMENT".into(),
                        message: format!(
                            "output \"{}\" page[{}] 引用了不存在的 documentId \"{}\"",
                            output.id, idx, page.source.document_id
                        ),
                        output_id: Some(output.id.clone()),
                        page_id: Some(page.id.clone()),
                    });
                }
                Some(source) => {
                    if page.source.page_number < 1
                        || page.source.page_number > source.page_count
                    {
                        warnings.push(ExportWarning {
                            code: "PAGE_NUMBER_OUT_OF_RANGE".into(),
                            message: format!(
                                "pageNumber {} 超出范围 [1, {}]（document \"{}\"）",
                                page.source.page_number, source.page_count, source.id
                            ),
                            output_id: Some(output.id.clone()),
                            page_id: Some(page.id.clone()),
                        });
                    }
                }
            }

            if let Some(transform) = &page.transform {
                if let Some(rotate) = transform.rotate {
                    if !ALLOWED_ROTATIONS.contains(&rotate) {
                        warnings.push(ExportWarning {
                            code: "INVALID_ROTATION".into(),
                            message: format!("rotate 值 {} 无效，只允许 0/90/180/270", rotate),
                            output_id: Some(output.id.clone()),
                            page_id: Some(page.id.clone()),
                        });
                    }
                }

                if let Some(crop) = &transform.crop {
                    match crop {
                        CropRect::Ratio {
                            x,
                            y,
                            width,
                            height,
                            ..
                        } => {
                            if *x < 0.0 || *x > 1.0
                                || *width < 0.0 || *width > 1.0
                                || *y < 0.0 || *y > 1.0
                                || *height < 0.0 || *height > 1.0
                                || x + width < -0.001
                                || x + width > 1.001
                                || y + height < -0.001
                                || y + height > 1.001
                            {
                                warnings.push(ExportWarning {
                                    code: "INVALID_CROP_RECT".into(),
                                    message: format!(
                                        "crop rect 值超出 [0,1] 范围: x={}, y={}, w={}, h={}",
                                        x, y, width, height
                                    ),
                                    output_id: Some(output.id.clone()),
                                    page_id: Some(page.id.clone()),
                                });
                            }
                        }
                        CropRect::Pt { .. } => {}
                    }
                }
            }
        }
    }

    warnings
}

fn normalize_path(path: &str) -> String {
    Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| Path::new(path).to_path_buf())
        .to_string_lossy()
        .to_lowercase()
}

// ── qpdf invocation ───────────────────────────────────────────────

/// 获取 qpdf sidecar 的完整路径。
/// 开发时 sidecar 在 src-tauri/binaries/ 下，打包后与可执行文件同目录。
fn qpdf_sidecar_path() -> std::path::PathBuf {
    // 优先检查 exe 旁边的路径（打包环境）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("qpdf-x86_64-pc-windows-msvc.exe");
            if candidate.exists() {
                return candidate;
            }
        }
    }

    // 开发环境：src-tauri/binaries/
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("qpdf-x86_64-pc-windows-msvc.exe");
    if dev_path.exists() {
        return dev_path;
    }

    // 最后尝试当前工作目录
    std::path::PathBuf::from("qpdf-x86_64-pc-windows-msvc.exe")
}

fn resolve_output_path(path: &str, policy: &OverwritePolicy) -> Result<String, ExportError> {
    let p = Path::new(path);

    if !p.exists() {
        return Ok(path.to_string());
    }

    match policy {
        OverwritePolicy::Fail => Err(ExportError {
            code: "FILE_EXISTS".into(),
            message: format!("输出文件已存在: {}", path),
            output_id: None,
            page_id: None,
            details: None,
        }),
        OverwritePolicy::Replace => Ok(path.to_string()),
        OverwritePolicy::Rename => {
            let stem = p.file_stem().unwrap_or_default().to_string_lossy();
            let ext = p.extension().unwrap_or_default().to_string_lossy();
            let parent = p.parent().unwrap_or(Path::new("."));

            for n in 1..1000 {
                let new_name = if ext.is_empty() {
                    format!("{}_{}", stem, n)
                } else {
                    format!("{}_{}.{}", stem, n, ext)
                };
                let candidate = parent.join(&new_name);
                if !candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
            }

            Err(ExportError {
                code: "FILE_EXISTS".into(),
                message: format!("无法为 {} 生成不重名的文件名", path),
                output_id: None,
                page_id: None,
                details: None,
            })
        }
    }
}

fn run_qpdf(args: &[&str]) -> Result<(), ExportError> {
    let sidecar_path = qpdf_sidecar_path();

    let output = std::process::Command::new(&sidecar_path)
        .args(args)
        .output()
        .map_err(|e| ExportError {
            code: "QPDF_EXEC_FAILED".into(),
            message: format!("无法执行 qpdf ({:?}): {}", sidecar_path, e),
            output_id: None,
            page_id: None,
            details: None,
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ExportError {
            code: "QPDF_ERROR".into(),
            message: format!("qpdf 执行失败 (exit code: {:?})", output.status.code()),
            output_id: None,
            page_id: None,
            details: Some(stderr.trim().to_string()),
        });
    }

    Ok(())
}

fn export_single_output(
    output: &OutputDocument,
    sources: &[SourceDocument],
    options: &Option<ExportDocumentOptions>,
) -> Result<ExportedFile, ExportError> {
    for page in &output.pages {
        if let Some(transform) = &page.transform {
            if transform.crop.is_some() {
                return Err(ExportError {
                    code: "UNSUPPORTED_TRANSFORM".into(),
                    message: "当前 qpdf exporter 不支持 crop 变换。".into(),
                    output_id: Some(output.id.clone()),
                    page_id: Some(page.id.clone()),
                    details: None,
                });
            }
        }
    }

    let overwrite_policy = options
        .as_ref()
        .and_then(|o| o.overwrite_policy.clone())
        .unwrap_or(OverwritePolicy::Fail);

    let output_path = resolve_output_path(&output.output_path, &overwrite_policy)?;

    if let Some(parent) = Path::new(&output_path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            let create_dirs = options
                .as_ref()
                .and_then(|o| o.create_parent_dirs)
                .unwrap_or(true);
            if create_dirs {
                std::fs::create_dir_all(parent).map_err(|e| ExportError {
                    code: "CREATE_DIR_FAILED".into(),
                    message: format!("无法创建输出目录: {}", e),
                    output_id: Some(output.id.clone()),
                    page_id: None,
                    details: None,
                })?;
            }
        }
    }

    let has_rotation = output
        .pages
        .iter()
        .any(|p| p.transform.as_ref().and_then(|t| t.rotate).unwrap_or(0) != 0);

    if has_rotation {
        export_with_rotation(output, sources, &output_path)?;
    } else {
        export_simple(output, sources, &output_path)?;
    }

    Ok(ExportedFile {
        output_id: output.id.clone(),
        path: output_path,
        page_count: output.pages.len() as u32,
    })
}

fn export_simple(
    output: &OutputDocument,
    sources: &[SourceDocument],
    output_path: &str,
) -> Result<(), ExportError> {
    let mut args: Vec<String> = vec!["--empty".into(), "--pages".into()];

    for page in &output.pages {
        let source = find_source(sources, &page.source.document_id)?;
        args.push(source.path.clone());
        args.push(page.source.page_number.to_string());
    }

    args.push("--".into());
    args.push(output_path.to_string());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_qpdf(&args_ref)
}

fn export_with_rotation(
    output: &OutputDocument,
    sources: &[SourceDocument],
    output_path: &str,
) -> Result<(), ExportError> {
    let temp_path = format!("{}.tmp.pdf", output_path);

    // Step 1: 拼合所有页面到临时文件
    let mut assemble_args: Vec<String> = vec!["--empty".into(), "--pages".into()];

    for page in &output.pages {
        let source = find_source(sources, &page.source.document_id)?;
        assemble_args.push(source.path.clone());
        assemble_args.push(page.source.page_number.to_string());
    }

    assemble_args.push("--".into());
    assemble_args.push(temp_path.clone());

    let args_ref: Vec<&str> = assemble_args.iter().map(|s| s.as_str()).collect();
    run_qpdf(&args_ref)?;

    // Step 2: 对指定页面施加旋转
    let mut rotate_specs: Vec<String> = Vec::new();
    for (idx, page) in output.pages.iter().enumerate() {
        let rotation = page.transform.as_ref().and_then(|t| t.rotate).unwrap_or(0);
        if rotation != 0 {
            rotate_specs.push(format!("+{}:{}", rotation, idx + 1));
        }
    }

    let rotated_temp = format!("{}.rotated.pdf", output_path);

    let mut rotate_args: Vec<String> = Vec::new();
    for spec in &rotate_specs {
        rotate_args.push(format!("--rotate={}", spec));
    }
    rotate_args.push(temp_path.clone());
    rotate_args.push(rotated_temp.clone());

    let rotate_refs: Vec<&str> = rotate_args.iter().map(|s| s.as_str()).collect();
    run_qpdf(&rotate_refs)?;
    // 拼合后的临时文件可以删除了
    let _ = std::fs::remove_file(&temp_path);

    // Step 3: 重命名旋转后的临时文件到目标文件
    std::fs::rename(&rotated_temp, output_path).map_err(|e| ExportError {
        code: "RENAME_FAILED".into(),
        message: format!("无法重命名临时文件: {}", e),
        output_id: None,
        page_id: None,
        details: None,
    })?;

    Ok(())
}

fn find_source<'a>(
    sources: &'a [SourceDocument],
    id: &str,
) -> Result<&'a SourceDocument, ExportError> {
    sources.iter().find(|s| s.id == id).ok_or_else(|| ExportError {
        code: "UNKNOWN_SOURCE_DOCUMENT".into(),
        message: format!("找不到 source document \"{}\"", id),
        output_id: None,
        page_id: None,
        details: None,
    })
}

// ── Export document options (used internally) ─────────────────────

#[derive(Debug, Clone)]
struct ExportDocumentOptions {
    overwrite_policy: Option<OverwritePolicy>,
    create_parent_dirs: Option<bool>,
}

impl From<&ExportJobOptions> for ExportDocumentOptions {
    fn from(opts: &ExportJobOptions) -> Self {
        Self {
            overwrite_policy: opts.overwrite_policy.clone(),
            create_parent_dirs: opts.create_parent_dirs,
        }
    }
}

// ── Tauri command ─────────────────────────────────────────────────

#[tauri::command]
pub fn export_pdfs(job: PdfExportJob) -> Result<ExportResult, ExportError> {
    let warnings = validate_job(&job);

    let has_errors = warnings.iter().any(|w| {
        matches!(
            w.code.as_str(),
            "UNSUPPORTED_SCHEMA_VERSION"
                | "EMPTY_SOURCES"
                | "EMPTY_OUTPUTS"
                | "EMPTY_OUTPUT_PAGES"
                | "UNKNOWN_SOURCE_DOCUMENT"
                | "PAGE_NUMBER_OUT_OF_RANGE"
                | "INVALID_ROTATION"
                | "INVALID_CROP_RECT"
                | "OUTPUT_OVERWRITES_INPUT"
        )
    });

    if has_errors {
        return Err(ExportError {
            code: "VALIDATION_FAILED".into(),
            message: "导出任务验证失败，请检查 warnings 列表。".into(),
            output_id: None,
            page_id: None,
            details: Some(serde_json::to_string_pretty(&warnings).unwrap_or_default()),
        });
    }

    let export_options: ExportDocumentOptions = job
        .options
        .as_ref()
        .map(|o| o.into())
        .unwrap_or(ExportDocumentOptions {
            overwrite_policy: Some(OverwritePolicy::Rename),
            create_parent_dirs: Some(true),
        });

    let mut exported_files: Vec<ExportedFile> = Vec::new();
    let mut export_warnings: Vec<ExportWarning> = warnings;

    for output in &job.outputs {
        match export_single_output(output, &job.sources, &Some(export_options.clone())) {
            Ok(file) => exported_files.push(file),
            Err(e) => {
                export_warnings.push(ExportWarning {
                    code: e.code.clone(),
                    message: e.message.clone(),
                    output_id: e.output_id.clone(),
                    page_id: e.page_id.clone(),
                });
            }
        }
    }

    let success = exported_files.len() == job.outputs.len();

    Ok(ExportResult {
        success,
        outputs: exported_files,
        warnings: export_warnings,
    })
}
