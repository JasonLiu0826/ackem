# Ackem · Windows Distribution

> **Language:** English · [中文](./distribution-windows.zh.md)

> **Product version:** Ackem **v1.0.0**  
> **Green release path (after build):** `dist/release/Ackem-1.0.0-win-x64/`

---

## What is and is not in the package

### Included

| Item | Description |
|------|-------------|
| `Ackem.exe` | Electron main executable |
| `resources/app.asar` | Compiled application code |
| `resources/models/` | Embedding models (if shipped) |
| `resources/voice-service/` | Voice runtime (optional) |
| `resources/docs/` | Bundled developer doc copy |

### Never included

| Item | Description |
|------|-------------|
| User `data/` | Memory, chat, imports, OpenForU |
| API keys | Entered in Settings after first run |
| `.env` / dev secrets | Excluded at build time |

---

## Green release steps

1. Download `Ackem-v1.0.0-win-x64.zip` from [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) or [Gitee Releases](https://gitee.com/jason_2005/ackem/releases)  
2. **Extract fully** to an SSD path (do not run inside the zip)  
3. Double-click `Ackem.exe` or `启动 Ackem.bat`  
4. First launch ~10–30 s (embedding initialization)  
5. Configure **Settings → Model & API**: Base URL, API Key, Model ID  
6. Data lives in `./data/` (portable mode)

See `START.txt` in the release folder.

---

## Data directory

| Mode | Path |
|------|------|
| Portable | `.\data\` |
| User profile | `%LOCALAPPDATA%\Ackem\` |

Layout: [memory-format.md](./memory-format.md).

---

## Uninstall

- Portable: delete the folder, or run `Uninstall Ackem.bat`  
- Uninstall **does not upload** your data; delete `data/` to wipe local memory  

---

## Source vs release

| | Source repo | Green release |
|---|-------------|---------------|
| Path | Repository root (after clone) | `dist/release/Ackem-1.0.0-win-x64/` |
| Contents | `src/` TypeScript | `app.asar` compiled output |
| Node.js required | Yes (development) | No (end users) |

Overview: [CODEBASE-PATHS.md](./CODEBASE-PATHS.md)

*distribution-windows · Ackem v1.0.0*
