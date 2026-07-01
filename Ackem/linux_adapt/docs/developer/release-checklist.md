# Release Checklist

> **Language:** English · [中文](./release-checklist.zh.md)

> **Audience:** Maintainers  
> **Applies to:** Ackem v1.0.0 and later releases  
> **Source repo:** [JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)

---

## 1. Release Flow Overview

```
Developer branch → merge to main → build → smoke test → GitHub Release
```

---

## 2. Pre-Release Checks

### 2.1 Code checks

- [ ] `main` contains all target PRs
- [ ] CHANGELOG.md updated (version, date, change entries)
- [ ] `package.json` version bumped
- [ ] `electron-builder.yml` `extraMetadata.version` matches package.json
- [ ] TypeScript check passes: `npm run typecheck`
- [ ] All tests pass: `npm test`
- [ ] Docs synced: `npm run sync:release-doc`

### 2.2 Security and privacy

- [ ] No `.env`, `.env.*`, `data/`, or `*.log` files included
- [ ] `electron-builder.yml` `files` correctly excludes private data
- [ ] `resources/` contains no unlicensed assets
- [ ] `voice-service/` contains no unused large models

### 2.3 Live smoke test (clean machine)

- [ ] Portable build starts on first run (~10–30s)
- [ ] Messages send/receive after LLM configuration
- [ ] Memory retrieval works
- [ ] Extension list loads
- [ ] Settings page reads/writes correctly
- [ ] System tray is usable

---

## 3. Build Commands

```bash
# 1. Build main app
npm run build

# 2. Package portable build (recommended — default release format)
npm run dist:green
# Output: dist/release/Ackem-{version}-win-x64/

# 3. Optional: NSIS installer
npm run dist:setup
# Output: dist/release/Ackem-{version}-Setup-x64.exe
```

### Build options

| Option | Portable (zip) | Installer (NSIS) |
|------|-------------|---------------|
| Portable `data/` | ✅ default | Optional |
| First-start speed | Fast (no install) | Medium |
| AV false-positive risk | Low | Higher |
| Recommended for | GitHub Release default | Store/enterprise distribution |

---

## 4. Release Artifact Checks

Portable directory should contain:

```
Ackem-{version}-win-x64/
├── Ackem.exe
├── 启动 Ackem.bat
├── Uninstall Ackem.bat
├── resources/
│   ├── app.asar        ← main app
│   └── models/         ← embedding models (pre-bundled)
├── voice-service/      ← voice runtime
├── docs/               ← doc copy
├── d3/                 ← runtime dependency
├── ...                 ← other Node.js dependencies
└── chrome_100_percent.pak, locales/, etc.  ← Electron runtime
```

**Must NOT contain:**

```
❌ data/                  ← user data (created at first run)
❌ .env / .env.*          ← environment variables
❌ src/                   ← TypeScript source
❌ node_modules/          ← dev dependencies
```

---

## 5. GitHub Release

### 5.1 Create release

1. Create tag on GitHub: `v{version}` (e.g. `v1.0.0`)
2. Upload portable zip: `Ackem-{version}-win-x64.zip`
3. Optionally upload installer: `Ackem-{version}-Setup-x64.exe`
4. Write release notes (excerpt from CHANGELOG.md)

### 5.2 Release notes template

```markdown
## Ackem v{version}

{Short intro}

### Downloads

| Package | Notes |
|----|------|
| Ackem-{version}-win-x64.zip | Portable (recommended), extract and run |
| Ackem-{version}-Setup-x64.exe | NSIS installer |

### Changes

**Added**
- {New feature}

**Changed**
- {Improvement}

**Fixed**
- {Bug fix}

**Known Issues**
- {Known issue}

### Resources

- LLM embedding models auto-extract on first start
- Voice service downloaded separately if needed
```

### 5.3 After release

- [ ] Release page is accessible
- [ ] Zip is downloadable
- [ ] Portable build verified on a clean Windows machine
- [ ] Users notified if applicable

---

## 6. Version Numbering

Follow `major.minor.patch`:

| Change | Example |
|------|------|
| Breaking API/architecture change | v2.0.0 |
| New feature, backward compatible | v1.1.0 |
| Bug fix | v1.0.1 |
| Docs/build only | No version bump required |

---

## 7. Related Documentation

| Document | Content |
|------|------|
| [dev-setup.md](./dev-setup.md) | Build environment |
| [testing.md](./testing.md) | Testing guide |
| [docs/distribution-windows.md](../distribution-windows.md) | Distribution notes |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Contribution guide |

*Release Checklist · Ackem v1.0.0 · 2026-06*
