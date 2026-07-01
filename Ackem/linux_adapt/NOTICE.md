# Third-Party Notices — Ackem v1.0.0

Copyright (C) 2026 Jason Liu (JasonLiu0826).  
Ackem is licensed under **AGPL-3.0** (see [LICENSE](./LICENSE)).

This file summarizes bundled and runtime dependencies. For npm packages, run `npm ls --prod` in the repository root for the authoritative list at build time.

---

## 1. Ackem application

| Component | License | Notes |
|-----------|---------|-------|
| Ackem source & compiled app | AGPL-3.0 | This repository |
| Electron runtime | MIT / BSD (see below) | Shipped in green release |

---

## 2. Key npm production dependencies

| Package | Typical license | Role |
|---------|-----------------|------|
| `better-sqlite3` | MIT | Local SQLite (`ackem.db`) |
| `onnxruntime-node` | MIT | Optional embedding inference |
| `d3` | ISC | UI visualization |
| `zustand` | MIT | Renderer state |
| `ws` | MIT | WebSocket (extensions / voice) |
| `mineflayer` | MIT | Minecraft plugin (optional) |
| `opencc-js` | Apache-2.0 | Chinese conversion |
| `qrcode` | MIT | QR generation |

Full dependency tree: `package.json` + `package-lock.json`.  
AGPL applies to **Ackem as a whole** when you distribute the application; dependency licenses remain as stated by each upstream project.

---

## 3. Bundled resources (green release)

| Path | Description | License / source |
|------|-------------|------------------|
| `resources/app.asar` | Compiled Ackem | AGPL-3.0 |
| `resources/models/` | Embedding models (e.g. BGE-small) | Upstream model licenses (check model cards) |
| `resources/voice-service/` | Optional TTS runtime (GPT-SoVits stack) | Mixed; see `voice-service/` in source repo |
| `LICENSE.electron.txt` | Electron third-party notices | In release folder |

**Do not** redistribute model weights or voice runtime without complying with their respective licenses.

---

## 4. Electron & Chromium

The Windows release includes Electron, which bundles Chromium and Node.js.  
Third-party notices: `dist/release/Ackem-1.0.0-win-x64/LICENSE.electron.txt` (or equivalent in Release zip).

---

## 5. Assets

UI fonts, stickers, Live2D or portrait assets (if present in build) may carry separate terms. Check `resources/` in the release tree before commercial reuse.

---

## 6. Regenerating this file

1. `npm ci && npm ls --prod --all > notice-npm-tree.txt`  
2. Review `electron-builder.yml` `extraResources`  
3. Update this NOTICE when adding native modules or bundled models  

---

## 7. Commercial licensing

For closed-source or SaaS use of Ackem, contact: jasonliu_lyf_2005@qq.com

*NOTICE · Ackem v1.0.0 · 2026-06*
