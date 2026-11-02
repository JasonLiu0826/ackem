# Documentation diagrams

[中文](README.md) · [Project](../../README.en.md) · [Architecture](../architecture.md)

## Core overviews

Core figures have English/Chinese and light/dark SVG variants. Pages display the light SVG directly and link to the dark variant and source. SVG supports zooming and includes accessible titles and descriptions.

| Figure | English | 中文 |
|---|---|---|
| Request routing | [Light](request-routing-en.light.svg) · [Dark](request-routing-en.dark.svg) | [浅色](request-routing-zh.light.svg) · [深色](request-routing-zh.dark.svg) |
| Execution entry paths | [Light](runtime-architecture-en.light.svg) · [Dark](runtime-architecture-en.dark.svg) | [浅色](runtime-architecture-zh.light.svg) · [深色](runtime-architecture-zh.dark.svg) |
| Managed task lifecycle | [Light](managed-task-lifecycle-en.light.svg) · [Dark](managed-task-lifecycle-en.dark.svg) | [浅色](managed-task-lifecycle-zh.light.svg) · [深色](managed-task-lifecycle-zh.dark.svg) |
| AckemCode kernel | [Light](kernel-overview-en.light.svg) · [Dark](kernel-overview-en.dark.svg) | [浅色](kernel-overview-zh.light.svg) · [深色](kernel-overview-zh.dark.svg) |

## Visual vocabulary

- Blue indicates Ackem processing, coordination or tool adapters; violet indicates the kernel or intelligent processing; green indicates results and delivery.
- Gray identifies input, storage and auxiliary information; amber marks degraded or caution states.
- Labels and shapes communicate meaning in addition to color.
- Solid lines show primary calls/data flow. Dashed lines represent optional paths, feedback, dependencies or storage; read each edge label.
- Each diagram answers one question. Split complicated flows into overview and detail instead of putting every function/parameter inside nodes.
- Code, formulas and directory trees stay textual rather than becoming misleading execution flows.

## Maintenance

Core Mermaid sources live in [sources](sources), separate from reading pages. Pages contain no folding tags or generation markers. Diagram sources and actual implementation define the technical relationships. Core SVG figures use an explicit layout and typography through the [generator](../../scripts/render-doc-figures.mjs). Update Mermaid and layout content together when architecture changes.

```powershell
node scripts/render-doc-figures.mjs
node scripts/render-doc-figures.mjs --check
```

Only Node.js built-ins are required. Check mode compares generated output and Mermaid source hashes to catch stale figures.

Other technical figures render directly from Mermaid. Validate syntax, edge meaning, label length, both themes and common document widths. Successful parsing does not replace visual inspection.
