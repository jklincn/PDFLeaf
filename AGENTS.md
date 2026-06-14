# AGENTS.md instructions for C:/Users/jklin/PDFLeaf

Local file reference rules (strict):
- Do not use local-file Markdown/URL links (e.g., [x](...), file:///...).
- Only use pure references inside single backticks: `@path[:line[:column]]`.
- Use `/` in paths (including Windows), e.g., `@D:/repo/src/main.cpp:128`.

Frontend layout rules:
- This project is a desktop PDF page editor. Do not build or maintain mobile-specific responsive layouts unless the user explicitly requests it.
- Prefer a fixed desktop application workspace optimized for wide Tauri windows.
- Descriptive UI copy shown on the page should not end with a final period or Chinese full stop.

Skill usage preferences:
- For frontend interface creation, redesign, or visual polish, use the `build-web-apps:frontend-app-builder` skill whenever available.
- For rendered UI testing, debugging, screenshots, browser verification, or interaction checks, use the `build-web-apps:frontend-testing-debugging` skill whenever available.
- For React/Vite component structure or performance-sensitive changes, use the `build-web-apps:react-best-practices` skill when relevant.
- For shadcn/ui components or projects with `components.json`, use the `build-web-apps:shadcn` skill when relevant.
- Prefer using applicable skills when they exist, rather than relying only on general coding knowledge.

Build verification note:
- `pnpm.cmd run build` can fail inside the managed sandbox because Vite/esbuild tries to read parent/config paths and reports `Cannot read directory "..": Access is denied` or `Could not resolve "C:\Users\jklin\PDFLeaf\vite.config.ts"`.
- For build verification, run `pnpm.cmd run build` outside the sandbox / with escalation directly instead of first trying the sandboxed build.
- Type checking with `.\node_modules\.bin\tsc.CMD --noEmit` works in the sandbox and can be run normally.
