import { cp, mkdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const QPDF_VERSION = "12.3.2";
const QPDF_ZIP_URL = `https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}-msvc64.zip`;
const QPDF_ZIP_FILENAME = `qpdf-${QPDF_VERSION}-msvc64.zip`;

// Tauri sidecar: 平台三元组由 rustc 检测，二进制需带此后缀
function detectTargetTriple() {
  try {
    return execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
  } catch {
    try {
      const vv = execSync("rustc -Vv", { encoding: "utf8" });
      const match = vv.match(/^host:\s*(\S+)/m);
      if (match) return match[1];
    } catch {
      // 回退
    }
  }
  console.error("无法检测 Rust target triple，请确认 rustc 已安装");
  process.exit(1);
}

const TARGET_TRIPLE = detectTargetTriple();
const SIDECAR_EXE_NAME = `qpdf-${TARGET_TRIPLE}.exe`;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sidecarDir = join(projectRoot, "src-tauri", "binaries");
const zipPath = join(projectRoot, QPDF_ZIP_FILENAME);
const extractDir = join(projectRoot, "qpdf-extract-tmp");

function downloadFile(url, dest) {
  console.log(`下载: ${url}`);
  execSync(`curl -fL -o "${dest}" "${url}"`, {
    stdio: "inherit",
    cwd: projectRoot,
    env: { ...process.env },
  });
  console.log("下载完成");
}

function unzipTo(zipFile, targetDir) {
  console.log(`解压 ${zipFile} -> ${targetDir}`);
  try {
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipFile}' -DestinationPath '${targetDir}' -Force"`,
      { stdio: "inherit", cwd: projectRoot },
    );
  } catch {
    execSync(`unzip -o "${zipFile}" -d "${targetDir}"`, {
      stdio: "inherit",
      cwd: projectRoot,
    });
  }
}

// 主流程
console.log(`下载 qpdf ${QPDF_VERSION} (target: ${TARGET_TRIPLE})...`);

// 1. 获取 zip（本地已有则跳过下载）
const { existsSync } = await import("node:fs");
if (existsSync(zipPath)) {
  console.log(`使用本地缓存: ${QPDF_ZIP_FILENAME}`);
} else {
  downloadFile(QPDF_ZIP_URL, zipPath);
}

// 2. 清理旧的临时目录
await rm(extractDir, { recursive: true, force: true });

// 3. 解压到临时目录
unzipTo(zipPath, extractDir);

// 4. 找到解压后的内层目录
const { readdir } = await import("node:fs/promises");
const { existsSync: localExists } = await import("node:fs");
const extracted = await readdir(extractDir);
let rootDir = extracted.length === 1 ? join(extractDir, extracted[0]) : extractDir;
// qpdf zip 内可能有 bin/ 子目录存放可执行文件
const binSubDir = join(rootDir, "bin");
if (localExists(binSubDir)) {
  rootDir = binSubDir;
}

// 5. 准备 sidecar 目录，复制所有文件
await mkdir(sidecarDir, { recursive: true });

const files = await readdir(rootDir);
for (const file of files) {
  const src = join(rootDir, file);
  const dest = join(sidecarDir, file);
  await cp(src, dest, { force: true, recursive: true });
}

// 6. 将 qpdf.exe 重命名为带三元组后缀的 sidecar 名称
const qpdfExe = join(sidecarDir, "qpdf.exe");
const sidecarExe = join(sidecarDir, SIDECAR_EXE_NAME);
await rm(sidecarExe, { force: true });
await rename(qpdfExe, sidecarExe);

// 7. 清理临时目录和 zip
await rm(extractDir, { recursive: true, force: true });
await rm(zipPath, { force: true });

console.log(`qpdf sidecar 已安装到 src-tauri/binaries/${SIDECAR_EXE_NAME}`);
console.log("附带 DLL 文件:", files.filter(f => f.endsWith(".dll")).join(", "));
