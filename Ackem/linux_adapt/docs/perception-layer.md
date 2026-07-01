# Perception Capabilities

> **Language:** English · [中文](./perception-layer.zh.md)

> **Product:** Ackem v1.0.0  
> **Note:** In v1.0.0, perception features are spread across modules; there is no single unified “perception panel” yet.

---

## Current capabilities

| Capability | Status | How to enable |
|------------|--------|---------------|
| **Desktop pet window** | Preview (geometric orb, not full Live2D) | Settings → Companion & perception → Desktop pet |
| **Media awareness** | Preview (basic SMTC read) | Settings → Companion & perception → Refresh media detection |
| **Foreground window** | Registered (off by default) | No standalone UI; enabled inside extensions |
| **Voice in/out** | Depends on voice-service config | Settings → Model & API → Voice service |
| **Clipboard read** | **Not implemented (placeholder)** | — |
| **Screenshots** | **Not implemented** | — |
| **System notifications** | **Not implemented** | — |
| **Extension network** | Per-extension consent after load | Prompt on install |

---

## Design principles

Ackem follows these rules for OS/environment access (unified UI planned):

- **Off by default** — no perception runs until you enable it  
- **Opt-in per capability** — separate toggles where available  
- **Chat still works** — disabling perception does not break basic conversation  

---

## Related docs

| Doc | Topic |
|-----|-------|
| [sensitive-capabilities.md](./sensitive-capabilities.md) | High-sensitivity capability list |
| [privacy-and-data.md](./privacy-and-data.md) | Data handling |

*Perception Capabilities · Ackem v1.0.0*
