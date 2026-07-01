# Privacy & Data

> **Language:** English · [中文](./privacy-and-data.zh.md)

> **Product**: Ackem v1.0.0  
> **Principle**: Local-first. Your data stays on your machine unless you explicitly configure otherwise.

---

## 1. Data Storage Locations

All data is stored locally. There are two storage modes:

| Mode | Path | Default for |
|------|------|-------------|
| **Portable** | `<Ackem.exe>/data/` | Green release (zip) |
| **User directory** | `%LOCALAPPDATA%\Ackem\` | Setup installer (NSIS) |

### What's stored where

| Category | Location | Format |
|----------|----------|--------|
| Chat history | `data/companion/chat-history-*.json` | JSON |
| Structured memory | `data/memory/facts/facts.v2.json` | JSON |
| Diary entries | `data/diary/*.md` | Markdown |
| Companion state | `data/companion/self.md`, `state.md` | Markdown |
| User imports | `data/imports/` | Original `.txt`/`.md`/`.json` |
| OpenForU extensions | `data/openforu/` | Source files |
| Application state | `data/ackem.db` | SQLite |
| Logs | `data/logs/` | Plain text |
| API keys & settings | Electron userData → `ackem-app-settings.json` | JSON (encrypted at rest by OS) |
| Model cache | `data/models/` | Binary |

---

## 2. API Keys & Credentials

- API keys are entered in **Settings** after installation
- They are stored in Electron's `userData` directory (`ackem-app-settings.json`), protected by the operating system's file permissions
- Keys are **never** included in the installation package
- You can view, change, or remove them at any time in **Settings → Model & API**

---

## 3. Network Outbound

Ackem's network behavior is minimal and explicit:

| Direction | Purpose | When | Configurable |
|-----------|---------|------|-------------|
| LLM API | Send conversation context to your configured LLM endpoint | Every chat turn | Yes — you set the Base URL |
| Extension `network_outbound` | Extensions making web requests (e.g., web search, weather) | Per extension use | Yes — per-extension permission prompt |
| Update check | Check for new releases (if enabled) | On startup, configurable | Yes — can disable |
| **Telemetry / analytics** | **None** | **Never** | **N/A — not implemented** |

The only default outbound traffic is to the LLM endpoint you configure. Everything else requires explicit user action or extension permission approval.

---

## 4. Telemetry

**Ackem does not have telemetry in this version.** There is no:
- Conversation content upload
- Usage statistics collection
- Crash reporting to a remote server
- Analytics SDK embedded in the application

Logs (`data/logs/`) are written locally for debugging and are never sent anywhere automatically.

---

## 5. Deletion & Uninstall

| Action | What happens |
|--------|-------------|
| Run `Uninstall Ackem.bat` | Removes the application files. **Does not** delete `data/` or settings |
| Delete `data/` folder | Removes all memories, chat history, diary entries, imports, and logs |
| Clear settings | Settings + API keys in `userData` must be cleared separately via **Settings → Other** or by removing the Electron userData directory |

To fully remove all traces:
1. Exit Ackem (including system tray)
2. Delete the application folder (portable) or uninstall via Settings (NSIS)
3. Delete `data/` if you want to remove local memories
4. Remove Electron userData if you want to clear API keys from the machine

---

## 6. User Imported Content

- Files you import (`data/imports/`) remain in their original format alongside processed memory
- You are responsible for the copyright and content of files you import
- Imported files stay local and are never uploaded

---

## 7. Related Documentation

- [SECURITY.md](./SECURITY.md) — Vulnerability reporting and supported versions
- [memory-format.md](./memory-format.md) — Detailed data directory layout
- [distribution-windows.md](./distribution-windows.md) — What the installer contains
- [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) — How memory enters the LLM

*Privacy & Data · Ackem v1.0.0 · 2026-06*
