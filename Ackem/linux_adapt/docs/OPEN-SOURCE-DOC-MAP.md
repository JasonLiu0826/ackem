# Ackem Open-Source Documentation Map

> **Language:** English · [中文](./OPEN-SOURCE-DOC-MAP.zh.md)

> **Purpose:** Maintainer index — who each doc is for, what to write, and current status.  
> **Naming rule:** [I18N.md](./I18N.md) — `*.md` = English, `*.zh.md` = 中文.

---

## Document layers

| Layer | Audience | Examples |
|-------|----------|----------|
| **L0** | All visitors | `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` |
| **L1** | Users & compliance | `memory-format`, `privacy-and-data`, `distribution-windows` |
| **L2** | Developers & contributors | `docs/developer/architecture/`, extension protocol, dev-setup |
| **L3** | Maintainers only (internal design) | Legacy plans under old monorepo — not shipped in this repo |

Public docs should be **small and accurate**. Internal design drafts stay out of the default onboarding path.

---

## L1 user docs (bilingual pairs)

| Topic | English | 中文 |
|-------|---------|------|
| Data layout | [memory-format.md](./memory-format.md) | [memory-format.zh.md](./memory-format.zh.md) |
| Windows distribution | [distribution-windows.md](./distribution-windows.md) | [distribution-windows.zh.md](./distribution-windows.zh.md) |
| Privacy & data | [privacy-and-data.md](./privacy-and-data.md) | [privacy-and-data.zh.md](./privacy-and-data.zh.md) |
| AI context & retrieval | [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) | [ai-context-and-retrieval-policy.zh.md](./ai-context-and-retrieval-policy.zh.md) |
| Local models | [local-models-windows.md](./local-models-windows.md) | [local-models-windows.zh.md](./local-models-windows.zh.md) |
| Perception | [perception-layer.md](./perception-layer.md) | [perception-layer.zh.md](./perception-layer.zh.md) |
| Sensitive capabilities | [sensitive-capabilities.md](./sensitive-capabilities.md) | [sensitive-capabilities.zh.md](./sensitive-capabilities.zh.md) |
| Adult mode & safety | [adult-and-safety-policy.md](./adult-and-safety-policy.md) | [adult-and-safety-policy.zh.md](./adult-and-safety-policy.zh.md) |
| Indexing & scale | [indexing-and-scale.md](./indexing-and-scale.md) | [indexing-and-scale.zh.md](./indexing-and-scale.zh.md) |
| Repo & build paths | [CODEBASE-PATHS.md](./CODEBASE-PATHS.md) | [CODEBASE-PATHS.zh.md](./CODEBASE-PATHS.zh.md) |

---

## L2 developer docs (bilingual pairs)

| Topic | English | 中文 |
|-------|---------|------|
| Dev setup | [developer/dev-setup.md](./developer/dev-setup.md) | [developer/dev-setup.zh.md](./developer/dev-setup.zh.md) |
| Testing | [developer/testing.md](./developer/testing.md) | [developer/testing.zh.md](./developer/testing.zh.md) |
| Release checklist | [developer/release-checklist.md](./developer/release-checklist.md) | [developer/release-checklist.zh.md](./developer/release-checklist.zh.md) |
| Extension protocol | [developer/DEVELOPER-EXTENSION-PROTOCOL.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.md) | [developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md) |
| Architecture index | [developer/architecture/README.md](./developer/architecture/README.md) | [developer/architecture/README.zh.md](./developer/architecture/README.zh.md) |
| Seven systems + data + IPC | `developer/architecture/00-…` through `08-…` | matching `*.zh.md` files |

OpenForU protocol: [src/main/extensions/openforu/PROTOCOL.md](../src/main/extensions/openforu/PROTOCOL.md) (English primary; Chinese readers use architecture + extension zh docs).

---

## Maintenance

- When shipping a release: update `CHANGELOG.md` and verify both languages if user-visible text changed.  
- When `data/` layout or permissions change: update **both** `memory-format` and `privacy-and-data` pairs first.  
- Full Chinese maintainer checklist (legacy detail): [OPEN-SOURCE-DOC-MAP.zh.md](./OPEN-SOURCE-DOC-MAP.zh.md).

*Open-source doc map · Ackem v1.0.0*
