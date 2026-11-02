> 历史归档：保留旧版内容，仅供追溯；当前实现请阅读[新版文档导航](../../../../README.md)。

# Issue #4 回复话术（发布 macOS v3 后粘贴）

> **操作：** 打开 https://github.com/JasonLiu0826/ackem/issues/4 → 评论框粘贴下方正文 → Post

---

@deufe 感谢你的持续贡献与耐心！🌹

**macOS 社区构建 v3 已审核**，官方 [v1.0.0 Release 说明](https://github.com/JasonLiu0826/ackem/releases/tag/v1.0.0) 已补充 Mac 下载与 SHA256；[README](https://github.com/JasonLiu0826/ackem#macos-community-build-unofficial) 与 [贡献者名单](https://github.com/JasonLiu0826/ackem/blob/main/CONTRIBUTORS.zh.md) 也已更新，你已进入名单。

### 下载入口（请向 Mac 用户推荐 v3）

| 文件 | 架构 |
|------|------|
| [Ackem-1.0.0-mac-arm64.dmg](https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-arm64.dmg) | Apple Silicon |
| [Ackem-1.0.0-mac-x64.dmg](https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-x64.dmg) | Intel |

SHA256 与 Gatekeeper 安装步骤见 Release 说明。**请勿再分发 v1 / v2。**

### 说明

- 当前标注 **community / unofficial**；Mac 适配尚未合并进 `main`，维护者侧未在实机完整复测。
- Gatekeeper：拖入应用程序后 `xattr -cr /Applications/Ackem.app`，再 **右键 → 打开**。
- 问题请继续在本 Issue 反馈。

### 后续（非常欢迎）

若方便，欢迎把 v3 的 Mac 适配（`modelManager` 路径、`voice-service` Python 兼容、`entitlements.mac.plist` 等）整理成 PR 到 `main`。

再次感谢！💪
