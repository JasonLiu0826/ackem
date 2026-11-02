# 开发指南

[English](development.md) · [文档导航](README.md)

## 环境与运行

源码快速启动命令只在 [README](../README.md#从源码快速启动)维护。当前 CI 使用 Windows／Node.js 22；根构建脚本使用 Windows `set` 语法。macOS 有构建配置，但运行、签名和原生依赖需分别验证。

根应用与 `parts/ackemcode` 各有依赖和构建。桌面内核适配需要源码与 tsx，渠道适配需要编译后的服务入口；不要只安装根依赖。渲染层依赖 `window.ackem`，直接打开 Vite 页面没有完整宿主接口。

`better-sqlite3`、`node-pty` 等需匹配加载它们的 Node／Electron ABI。按安装日志准备平台编译工具，不要为了 Node 测试直接覆盖 Electron 的原生依赖。模型、数据目录和服务复用排障见[模块参考](modules.zh.md#ackemcode)。

## 扩展开发

已有扩展经 plugin 调用，创建或修改经 work 执行。生成后仍需通过 manifest、注册、权限、加载与运行验收。Ackem 扩展协议和内核技能／插件接口分别维护。

| 命名空间 | 用途与状态 |
|---|---|
| `ackem/` | 官方内置能力，以注册和 active 状态为准 |
| `u/` | 本机 OpenForU 用户扩展，从活跃数据根加载 |
| `community/` | 签名市场协议，当前 `COMMUNITY_EXTENSIONS_OPEN=false` |

ID 为 `<scope>/<name>@<semver>`。官方 Skill／Plugin 位于 `src/main/extensions/skills/builtin/` 与 `plugins/builtin/`；本机用户扩展位于 `<dataRoot>/openforu/uskills/`、`uplugins/`。源码中的模板和例子不会自动安装。

[protocols.ts](../src/main/extensions/protocols.ts) 定义快照、事件、生命周期和 dispatch；[coordinator.ts](../src/main/extensions/coordinator.ts) 组装注册与运行时。按类型实现 handler、hooks／invoke／Surface，通过协议交互，不绕开接口修改引擎状态。用户可调用能力需有有效 dispatch、可调用实现和 active 状态；后台 hook／皮肤不必都是路由候选。

[OpenForU 协议](../src/main/extensions/openforu/PROTOCOL.md)保留 Plan、部署、Worker 与 Surface 细节。这些是扩展子系统机制，不代表所有聊天创建请求都走旧 Plan 入口；其 staging 限制也不是 AckemCode 的全局文件边界。

当前 [constants.ts](../src/main/extensions/ecosystem/constants.ts) 的 `ACKEM_APP_VERSION='0.0.0'`、`ACKEM_ENGINE_API_VERSION='1.0.0'` 独立于根应用版本。`engineVersion` 与 `engineApiVersion` 分别参与应用范围和协议范围校验；调整时同时检查 [manifestValidate.ts](../src/main/extensions/ecosystem/manifestValidate.ts)，不要仅为文档统一而批改 manifest。

验证注册、关闭／启用、能力目录、权限、实际调用与回执。未安装、被禁用或执行失败必须如实呈现。贡献流程见 [CONTRIBUTING](../CONTRIBUTING.zh.md)。

## 验证

```powershell
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm --prefix parts/ackemcode run typecheck
npm --prefix parts/ackemcode run build
npm run build
```

以上分别覆盖渲染／共享类型、主进程／preload、内核类型与构建、主应用构建。公开仓库不分发完整本地测试套件，不承诺根 `npm test`；少量跟踪用例不等于完整回归。

| 受影响路径 | 运行验收 |
|---|---|
| chat | 普通对话、记忆、流式正文、附件与历史 |
| plugin | 真实调用、禁用／缺失能力和失败回执 |
| 托管 work | 新建、补充目标、队列、审批、工具、验收／返工、交付 |
| 停止与恢复 | 静止回执、重启恢复、旧事件不能覆盖新目标 |
| 独立工作 | 私有队列、模式、CLI 和页面隐藏后的实际行为 |
| QQ／微信 | 机主、远程开关、权限调整、提问端回复和共享历史 |
| 打包 | 干净目录启动、内核入口、模型、数据与资源路径 |

记录输入、实际输出、环境及未覆盖范围。真实模型、渠道和外部服务依赖凭据与实际服务。原生加载失败是环境失败；退出码 0 但缺少最终统计、提前返回、跳过或未收集完，都不能当作完整通过。

## 构建与发布

Windows 便携版：`npm run dist:green`；安装包：`npm run dist:setup`。根构建不替代内核构建。发布前核对：

- 版本、目标变更和 CHANGELOG；应用、内核、schema 和扩展 API 各自维护版本。
- `resources/ackemcode` 的源码／tsx 与编译服务入口及其依赖。
- chat／plugin／work、独立工作、渠道、停止恢复和交付的实际验收。
- 排除个人数据、密钥、令牌、内核会话、`settings.standalone.json`、日志及 `.env`。
- 文档入口、图片、协议、第三方授权和实际产物路径；在副本或干净机器测试。
- 发布说明中的平台、依赖、验证范围、限制、迁移及真实产物校验值，不改写历史包名和哈希。

`node scripts/sync-release-doc.mjs <绿色版目录>` 同步随包文档；目标需是可修改的发行目录。脚本更新其文档并清理不应随包的个人 `data/`，不要指向日常使用的个人应用目录。

## 文档维护

六类入口见[文档导航](README.md)。功能变更只在对应主文档维护完整说明，其他页链接引用；源码旁小 README 保留接口和局部实现。中英文同步，不再为单个概念新增一篇项目总览。

展示入口中文优先：`README.md` 为中文，`README.en.md` 为英文。其余主指南保留 `name.zh.md` 中文／`name.md` 英文的命名，并从中文导航优先进入中文版本。顶部提供语言切换，含义变更同步另一种语言，不要求逐字翻译。

图表直接展示 SVG 或 Mermaid；图源见 [diagrams](diagrams/README.md)。不在阅读正文放置折叠标签或生成定位注释。

```powershell
node scripts/render-doc-figures.mjs
node scripts/render-doc-figures.mjs --check
```

修改后检查相对链接、标题锚点、源码路径、命令及图表语义。文档改动通常无需业务回归；改变文档同步脚本时，用临时发行副本实际生成并核对链接和归档排除。旧说明统一留在[归档](旧文档/README.md)，不随包分发，也不保留同名占位入口。
