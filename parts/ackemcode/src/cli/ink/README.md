# AckemCode ink-lite

Subset of Claude Code’s forked Ink focused on **in-app text selection** (not a full Ink vendoring).

- `selection.ts` — anchor/focus model and copy extraction (from CC `selection.ts`, simplified).
- `viewportModel.ts` — flat viewport lines aligned with history layout for mouse row mapping.
- `clipboard.ts` — OS clipboard helpers（Windows 用 PowerShell `Set-Clipboard`，避免 `clip` 把中文写成乱码）。

Full CC also uses alt-screen, screen buffers, and ScrollBox in `source/src/ink/`. AckemCode keeps stock Ink: one plain line per terminal row (`historyDisplayLines.ts`) + `SelectableLine` highlight.

If drag selection is vertically off by a constant number of rows in your terminal, set `ACKEM_SEL_ROW_OFFSET=-1` (or `1`) and restart CLI.
