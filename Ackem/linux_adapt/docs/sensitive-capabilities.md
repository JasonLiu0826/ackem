# Sensitive Capabilities

> **Language:** English · [中文](./sensitive-capabilities.zh.md)

> **Product:** Ackem v1.0.0  
> **Audience:** Legal, advanced users, platform reviewers  
> **Principle:** Off by default, per-item consent, local-first, auditable

---

## 1. Overview

This document lists Ackem capabilities that may touch privacy or system security. For each: **purpose, data type, retention, how to disable, implementation status**.

---

## 2. Capability matrix

| # | Capability | Data | Default | Retention | Disable | Status |
|---|------------|------|---------|-----------|---------|--------|
| 1 | Speech-to-text (STT) | Microphone audio | Off | Discarded after processing | Settings → Voice | ✅ |
| 2 | Text-to-speech (TTS) | None (playback only) | Off | None | Settings → Voice | ✅ |
| 3 | WeChat bridge | Messages, contacts | Off | `weixin_*` tables | Settings → WeChat | ✅ |
| 4 | System notifications | Title/body | Off | Not persisted | Settings → Perception | ✅ |
| 5 | Foreground window | Window title/process | Off | `foreground_history` | Settings → Perception | ✅ |
| 6 | Clipboard read | Text | Off | Not persisted | Settings → Perception | ✅ |
| 7 | Extension network | Varies | Off (per grant) | Varies | Extension permissions | ✅ |
| 8 | Desktop agent | Screenshot, input sim | Off | In development | Settings → Desktop agent | 🚧 |
| 9 | File import | User-selected files | User action | `data/imports/` | Manual only | ✅ |
| 10 | LLM API outbound | Conversation context | On (required) | None (sent to LLM) | Settings → API | ✅ |

---

## 3. Details

### 3.1 Speech-to-text (STT)

- **Implementation:** `voice-service/` (Python) local or cloud STT  
- **Flow:** Mic → main process → voice-service → text → audio discarded  
- **Control:** Stop listening anytime; local STT keeps audio on device  

### 3.2 WeChat bridge

- **Implementation:** `channels/weixin/`  
- **Flow:** WeChat messages → Ackem → optional reply  
- **Privacy:** Stored locally in `weixin_*` SQLite tables; not auto-uploaded  
- **Control:** Disable in Settings; delete local records manually  

### 3.3 Foreground window detection

- **Implementation:** Polls foreground window title (rate-limited)  
- **Purpose:** Activity context for proactive chat (e.g. “you’re coding”)  
- **Storage:** `foreground_history` keeps recent N entries only  
- **Control:** Disable in Settings; clear history in Settings  

### 3.4 Extension network access

- **Implementation:** Extensions declare domains via `network_outbound`  
- **Model:** Install prompt → user approve → runtime restricted to declared hosts  
- **Audit:** Logged under `data/logs/`  
- **Control:** Revoke in extension manager  

---

## 4. Retention summary

| Data | Location | Default retention | User can delete |
|------|----------|-------------------|-----------------|
| Chat history | `data/companion/chat-history-*.json` | Unlimited (UI trims ~2000/session) | ✅ |
| Memory facts | `data/memory/facts/facts.v2.json` + SQLite | Permanent (decay/retire) | ✅ |
| Diary | `data/diary/*.md` | Permanent | ✅ |
| Foreground history | `foreground_history` table | Recent N | ✅ |
| WeChat messages | `weixin_*` tables | Permanent | ✅ |
| Logs | `data/logs/` | Size-rotated | ✅ |
| Voice audio | In-memory | Discarded after STT | — |
| API keys | `ackem-app-settings.json` | Until removed | ✅ |

---

## 5. Not yet implemented

Reserved for future versions (**not in v1.0.0**):

- Browser history access  
- Recycle bin / file-operation monitoring  
- Screenshot analysis  
- GPS / location  
- Camera access  

Future capabilities will follow the same off-by-default, opt-in model.

---

## 6. Related docs

| Doc | Topic |
|-----|-------|
| [perception-layer.md](./perception-layer.md) | Perception capabilities |
| [adult-and-safety-policy.md](./adult-and-safety-policy.md) | Adult mode & safety |
| [privacy-and-data.md](./privacy-and-data.md) | Data handling |
| [developer/architecture/05-extension-system.md](./developer/architecture/05-extension-system.md) | Extension permissions |

*Sensitive Capabilities · Ackem v1.0.0*
