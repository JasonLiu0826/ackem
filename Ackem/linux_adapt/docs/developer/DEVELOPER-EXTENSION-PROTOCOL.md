# Ackem Developer Extension Protocol (Ecosystem v1)

> **Language:** English · [中文](./DEVELOPER-EXTENSION-PROTOCOL.zh.md)

> **Version:** Engine API `1.0.0`  
> **Audience:** Ackem contributors and extension developers  
> **Product policy (2026-06):** Only **`ackem/` (official)** and **`u/` (local OpenForU)** are open; the **`community/`** marketplace pipeline is **closed** — code remains for future use.

---

## 1. Overview

Ackem extensions use a **local-first + namespace-track** model:

| Namespace | ID example | Status | Notes |
|----------|---------|------|------|
| `ackem/` | `ackem/web-search@1.0.0` | **Open** | Official built-ins shipped with the app |
| `u/` | `u/my-timer@1.0.0` | **Open** | User Plan co-creation, local/private |
| `community/` | `community/hello@1.0.0` | **Closed** | Signed marketplace packages; `COMMUNITY_EXTENSIONS_OPEN=false` |

The **only bridge** between extensions and the engine is `ExtensionsCoordinator` (`src/main/extensions/coordinator.ts`).  
Extensions **must not** directly `import` internal `memory/` or `engine/` modules; they may only use interfaces defined in `protocols.ts`.

```
User message / schedule / system event
        │
        ▼
  Dispatch layer
        │
        ├── ackem/*   Official Skill/Plugin (open)
        ├── u/*       OpenForU user extensions (open)
        └── community/*  Closed — not scanned or installed at boot
        │
        ▼
  Skill.execute / Plugin hooks / Surface → ExtensionEvent → engine context
```

**Contributor path (recommended today):**

1. Prototype locally with **OpenForU Plan** as `u/` extensions  
2. When stable, clean up code and **PR to Ackem** under `skills/builtin/` or `plugins/builtin/`  
3. After merge, id becomes `ackem/<name>@<version>` and ships in the next release  

---

## 2. Contributing Extensions

### 2.1 Local prototype (OpenForU · `u/`)

- In chat: “Help me build an XX Skill/plugin” → Plan workspace → confirm deploy  
- On disk: `{dataRoot}/openforu/uskills/` or `uplugins/`  
- Protocol: [`src/main/extensions/openforu/PROTOCOL.md`](../../src/main/extensions/openforu/PROTOCOL.md)

### 2.2 Submit as official (`ackem/`)

| Type | Target directory | manifest id example |
|------|----------|------------------|
| Skill | `src/main/extensions/skills/builtin/<category>/<name>/` | `ackem/web-search@1.0.0` |
| Plugin | `src/main/extensions/plugins/builtin/<category>/<name>/` | `ackem/knowledge-presentation@1.0.0` |

**PR checklist:**

- [ ] `manifest.json` includes full `dispatch` (otherwise excluded from dispatch catalog)  
- [ ] `engineVersion: ">=0.0.0 <1.0.0"` (or aligned with current release)  
- [ ] `engineApiVersion: "^1.0.0"` (recommended explicit)  
- [ ] `implementationStatus: "complete"` (do not mark complete if stub only)  
- [ ] Registered in `register-placeholders.ts` or corresponding `register.ts`  
- [ ] Focused tests: `vitest run src/main/extensions/...`  
- [ ] No user `data/` bundled, no secrets  

**ID migration:** OpenForU `u/my-feature@1.0.0` → official `ackem/my-feature@1.0.0` (scope and permissions may need adjustment).

### 2.3 Repository and license

- Repository: <https://github.com/JasonLiu0826/Ackem>  
- Maintainer: Jason (JasonLiu0826) · Commercial licensing: jasonliu_lyf_2005@qq.com  
- Official extensions default to **AGPL-3.0** (same as the project)  
- Security issues: root `SECURITY.md`  

---

## 3. Extension ID Format

```
{scope}/{name}@{semver}
```

- **scope:** Product enables `ackem` · `u`; `community` remains in protocol but is **closed at runtime**  
- **name:** `[a-z0-9_-]+`  
- Parsing API: `src/main/extensions/ecosystem/extensionId.ts`

---

## 4. Dual Version Fields

| Field | Meaning | Example | Required |
|------|------|------|------|
| `engineVersion` | Ackem **app** semver range | `>=0.0.0 <1.0.0` | All |
| `engineApiVersion` | **Extension protocol** semver range | `^1.0.0` | Recommended for all |

Host constants (`ecosystem/constants.ts`):

- `ACKEM_APP_VERSION` = `0.0.0`  
- `ACKEM_ENGINE_API_VERSION` = `1.0.0`  

Validation: `ecosystem/manifestValidate.ts`

---

## 5. Engine Interface (Extension ↔ Engine)

Defined in `src/main/extensions/protocols.ts`:

- **EngineSnapshot** — read-only engine state  
- **ExtensionEvent** — extension feedback (includes `contextInjection`)  
- **ExtensionLifecycleHooks** — Plugin lifecycle  
- **DispatchConfig** — required to enter chat dispatch catalog  

---

## 6. `community/` (Closed — Protocol Retained)

> **Switch:** `src/shared/communityExtensionFeature.ts` → `COMMUNITY_EXTENSIONS_OPEN = false`

When closed:

- `coordinator.boot()` does **not** call `community.boot()`  
- `installCommunityPackage()` returns “Community extension marketplace is not open yet…”  
- Existing `data/extensions/community/` on disk is **not loaded**  

Retained implementation (for future open; still covered by unit tests):

| Module | Path |
|------|------|
| Signature / package format | `ecosystem/signature.ts` · `packageFormat.ts` |
| Install | `ecosystem/install.ts` |
| Loader | `ecosystem/communityLoader.ts` |
| Trust store | `data/extensions/trust/publishers.json` |

**Do not** promote community marketplace or `.ackem-ext` install to users in the current version; use §2 PR path instead.

---

## 7. OpenForU (`u/`) Quick Reference

| Item | Notes |
|------|------|
| Paths | `{dataRoot}/openforu/uskills/` · `uplugins/` |
| uskill | Config + context injection (v1 — not arbitrary TS execution) |
| uplugin | Sandbox + permission approval + optional Surface |
| Docs | [`openforu/PROTOCOL.md`](../../src/main/extensions/openforu/PROTOCOL.md) |

---

## 8. Testing

```bash
# Ecosystem protocol (includes community-closed unit tests)
npm test -- src/main/extensions/ecosystem/

# Extension dispatch
npm test -- src/main/extensions/dispatch/
```

---

## 9. Reference Paths

| Feature | Source |
|------|--------|
| Coordinator | `src/main/extensions/coordinator.ts` |
| Community switch | `src/shared/communityExtensionFeature.ts` |
| Protocol types | `src/main/extensions/protocols.ts` |
| OpenForU | `src/main/extensions/openforu/` |
| Official Skill example | `src/main/extensions/skills/builtin/tool/web-search/` |
| Official Plugin example | `src/main/extensions/plugins/builtin/knowledge-presentation/` |

---

*Ackem Ecosystem Protocol v1.0.0 · Contributors: PR to ackem/ first · 2026-06*
