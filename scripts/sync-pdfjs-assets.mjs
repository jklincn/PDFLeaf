import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = path.join(projectRoot, "node_modules", "pdfjs-dist");
const targetRoot = path.join(projectRoot, "public", "pdfjs-dist");
const manifestPath = path.join(targetRoot, ".pdfjs-assets.json");
const assetDirs = ["cmaps", "wasm"];
const pdfjsPackage = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
const nextManifest = {
  package: "pdfjs-dist",
  version: pdfjsPackage.version,
  assetDirs,
};

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function isAlreadySynced() {
  try {
    const currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifestMatches = JSON.stringify(currentManifest) === JSON.stringify(nextManifest);

    if (!manifestMatches) {
      return false;
    }

    const existingAssetDirs = await Promise.all(assetDirs.map((assetDir) => directoryExists(path.join(targetRoot, assetDir))));

    return existingAssetDirs.every(Boolean);
  } catch {
    return false;
  }
}

await mkdir(targetRoot, { recursive: true });

if (await isAlreadySynced()) {
  console.log(`PDF.js assets already synced in ${path.relative(projectRoot, targetRoot)}`);
  process.exit(0);
}

for (const assetDir of assetDirs) {
  const source = path.join(sourceRoot, assetDir);
  const target = path.join(targetRoot, assetDir);

  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
console.log(`Synced PDF.js assets to ${path.relative(projectRoot, targetRoot)}`);
