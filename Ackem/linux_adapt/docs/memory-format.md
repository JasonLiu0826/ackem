# Data Directory Layout (memory-format)

> **Language:** English · [中文](./memory-format.zh.md)

> **Product version:** Ackem **v1.0.0**  
> **Code:** `src/main/layout.ts` · `src/main/paths.ts`  
> **Principle:** Local-first; structured state in `ackem.db`; human-readable md/txt for backup and audit.

---

## 1. Data root location

| Mode | Path |
|------|------|
| **Portable (green release default)** | `<next to Ackem.exe>/data/` |
| **User profile** | `%LOCALAPPDATA%\Ackem\` |

See the absolute path under **Settings → Data & backup**.

---

## 2. Directory tree (v1.0.0)

```
data/
├── README.md                 # Auto-generated on first run
├── ackem.db                  # SQLite: state, extension registry KV, etc.
├── imports/                  # Original txt/md/json you imported
├── memory/
│   ├── facts/facts.v2.json   # Structured facts (authoritative)
│   └── archive/              # Human-readable memory export md
├── companion/
│   ├── self.md               # Companion first-person mirror memory
│   ├── state.md              # Companion snapshot placeholder
│   └── chat-history-*.json   # Session history (per config)
├── diary/                    # Diary markdown files
├── openforu/
│   ├── uskills/              # User Skills (u/)
│   ├── uplugins/             # User Plugins (u/)
│   ├── sessions/             # Plan workspaces
│   └── staging/              # Deploy staging
├── extensions/               # Extension registry mirror (skills/plugins)
├── _derived/                 # Derived indexes (safe to delete; app rebuilds)
├── models/                   # User-side embedding model cache
├── logs/                     # Runtime logs
├── preferences/              # Preferences
├── portrait/                 # Portrait-related data
├── staging/                  # Engine/extension whitelisted staging
├── weather/                  # Weather cache
└── packs/                    # Persona pack (reserved)
```

The `community/` marketplace path (`extensions/community/`) is **disabled** in v1.0.0 (`COMMUNITY_EXTENSIONS_OPEN=false`).

---

## 3. Authoritative vs derived

| Type | Paths | Notes |
|------|-------|-------|
| **Authoritative** | `imports/`, md/json under `memory/`, `companion/`, `diary/` | Include in backups |
| **Authoritative** | `ackem.db` | Relationship/emotion/registry; backup recommended |
| **Derived** | `_derived/`, parts of `data/models/` cache | Deleting slows search; core memory remains |

**Rebuild index** in Settings refreshes the derived layer.

---

## 4. AI write allowlist (summary)

The engine and extensions **cannot** write arbitrary paths on disk. Allowed writes are code-controlled, mainly:

- `data/memory/`, `data/diary/`, `data/companion/` (memory pipeline)
- `data/openforu/` (user extensions)
- `data/staging/`, `data/extensions/` (extension staging & registry)
- `data/logs/`

See [DEVELOPER-EXTENSION-PROTOCOL.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.md).

---

## 5. Backup & migration

1. **Fully quit** Ackem (including tray)  
2. Copy the entire `data/` tree to the same relative path on the new machine (portable) or replace the user profile folder after install  
3. Never share a zip containing private conversations  

Official installers **never include** your `data/`.

---

## 6. Related docs

- [distribution-windows.md](./distribution-windows.md)  
- [CODEBASE-PATHS.md](./CODEBASE-PATHS.md)  
- [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) — how memory enters the LLM  

*memory-format · Ackem v1.0.0*
