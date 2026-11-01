# Changelog

本文件记录 **Ackem v1.0.0** 及后续用户可见变更。v1.1.0 起为**社区桌面客户端版本**（本仓库，在原作 v1.0.0 基础上继续开发），上游官方 Release 见 [JasonLiu0826/Ackem Releases](https://github.com/JasonLiu0826/Ackem/releases)。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [1.1.0] - 2026-11-01

### Added

- **Ackem Code 三端接入**（`parts/ackemcode` + `src/main/ackemcode/`）：把作者的编码智能体
  子包接进 A 套，桌面聊天、QQ、微信命中「动代码/文件/命令」的任务时自动交给本机 Ackem Code，
  结果只回提问的那一端。显式 `/code` 前缀 + 意图判定双通道；权限默认三端全自动
  （`ACKEMCODE_PERMISSION_MODE` 可收紧），模型配置从 Ackem 现有设置同步。
  会话映射存 `{userData}/ackemcode-sessions.json`，数据目录默认 `~/.ackemcode`。
  `electron-builder.yml` 增加 `parts/ackemcode → {resources}/ackemcode` 的 extraResources。
  单测 + 真实模型端到端测试：`src/main/ackemcode/bridge.test.ts`。文档：`docs/ackem-code-bridge.zh.md`。
- **QQ 空间自主说说**（`src/main/channels/qq/qzone/`）：按人格、心情、记忆与当天 QQ 聊天流水生成说说，
  按活跃时段 / 每日上限 / 最小间隔挑时机发表；支持可见范围（公开 / 好友 / 仅自己）、表情包配图、
  试运行（只生成不发表）、发完在 QQ 里提一句、定时逛空间回评论与按概率点赞。
  全部走 OneBot 扩展动作（`send_qzone_msg` / `get_qzone_msg_list` / `get_qzone_feeds` / `like_qzone` /
  `comment_qzone` / `delete_qzone_msg`），复用 QQ 通道已有连接，不额外登录。
- 设置页新增「空间说说」区块（`QzoneSection.tsx`）与 `qzone:*` IPC；文案中英双版。
- 文档：`docs/qq-space.zh.md` / `docs/qq-space.md`（对齐大肥鱼、dsh_qzone_sticker 的做法）。
- 数据库 schema v12：`qq_qzone_post` / `qq_qzone_plan` / `qq_qzone_react`。
- **QQ 主动搭话**（`channels/qq/proactive.ts`）：补齐设置里一直存在但未实现的 `qqProactiveEnabled`，
  8:00–22:00、双向空闲 3 小时、冷却 3 小时、只找最近聊过的人；文案复用桌面端主动消息逻辑。
- 设置页 QQ 区块新增「主动搭话」开关；文案中英双版。
- 单测：`scheduler.test.ts` 覆盖跨夜时段、每日上限、最小间隔与计划时间点。
- **QQ 内置表情包**（`assets/qq-memes/`）：随程序分发 70 张近期热门的可爱 / 撒娇 / 卖萌梗图
  （奶龙、水豚、撒娇猫、线条小狗、吉伊卡哇等），按 9 个情绪目录归类，来源见 `CREDITS.md`。
  `memes.ts` 改为「内置包 + 用户目录」合并扫描，用户目录同名图优先覆盖；
  `electron-builder.yml` 一并打包 `assets/qq-memes`。

### Fixed

- **电脑助手误派工**（`src/shared/desktopAgentTaskPlan.ts`）：旧逻辑把「里面 / 再 / 之后」这类连接词
  当成多步任务证据，动作词表又包含「看看 / 打开 / 写」等泛词，导致正常聊天（例如语音占位文案
  「[他发来一条语音，你听不到里面的内容]」）被打成后台任务，回一句「已在下方电脑助手面板开始执行」。
  现在必须同时命中「祈使动词 + 电脑对象（文件/桌面/路径/扩展名）」，占位/表情/寒暄/疑问句一律不派工。
- **多模态内容被当成 JSON 复读**（`src/main/chat/messageContent.ts`）：工具回合把 `content` 数组
  直接 `JSON.stringify`，等于把 base64 图片整段塞回模型，模型再把这段 JSON 原样吐出来（看起来像乱码）。
  现在统一压成纯文本 + `[图片]` 占位。
- **渠道远程电脑助手改为显式指令**（`src/main/channels/companionTurn.ts`）：QQ / 微信只有发
  `/电脑 …`（或 `/pc …`、`/agent …`）才进入电脑助手模式；普通聊天不再触发本机操作。

### Changed

- QQ 表情包库（`src/main/channels/qq/memes.ts`）不再是单一目录：先扫 `{dataRoot}/qq-memes`，
  再补 `assets/qq-memes`，同情绪同名去重，库为空时才完全不发图。
- **表情包频次微调**：`freya` 人格的 `stickerAffinity` 由 0.38 降到 0.30（约三点三轮一张，
  原为约两点六轮一张）；被明确索要时仍然必发，不受该概率影响。
- **被要表情包时不再「发不了」**：`memes.ts` 新增 `isStickerRequest` / `requestedMemeMood`，
  用户明确要图时（"发个表情包"「来个可爱的」）跳过概率直接发，并按点名情绪选池；
  QQ 人格 prompt（`qq/psyche.ts`）补上「手机里有表情包库、被要就接住」的说明与本轮提示，
  避免她对着有图的库说自己发不了。

- **三端统一会话**（`src/main/channels/conversation.ts`）：桌面 / QQ / 微信不再各自占一个
  `chat_history` 会话，改为共用同一份历史。每行带 `at` 与来源（`ui` / `qq` / `weixin`），
  合并时只追加不覆盖、按时间线排序、按 `at` + 内容指纹去重。
  QQ / 微信的新消息通过 `chat:history-appended` 实时推到桌面对话框，并显示「来自 QQ / 来自微信」。
  旧的 `qq:*` / `wechat:*` 历史首次读取时自动并入（`kv_store` 标记只跑一次）。
- **回复路由不变**：她只把回复发回本轮提问的那一端；其他端只写入历史，不收到消息。
- 单测：`conversation.test.ts`（合并 / 去重 / 排序 / 陈旧回写 / 落盘往返）、
  `chatHistorySync.test.ts`（渲染层追加与去重）。
- 文档：`docs/cross-channel-conversation.md` / `.zh.md`。
- **Freya 人格**（`src/main/prompt/personality.ts` + `docs/freya/`）：真人语料还原型人格，
  含激素池生理层（`src/main/engine/freyaChemistry.ts`，按真实时间衰减）。
  **称呼可配置**：设置页新增「Freya 怎么称呼你」，语音指南 / 语癖模板 / QQ 称呼守卫里的
  `{{petname}}` 占位符统一替换成用户自填的称呼（留空默认「亲爱的」）。
- **macOS 社区构建**（`feat/macos-green-release` 相关工具链）：electron-builder mac 配置 +
  `sign-freya.sh` 分层 ad-hoc 签名脚本，产出 macOS arm64 绿色版 dmg。

---

## [1.0.0] - 2026-07-01

### Added

- **Ackem v1.0.0** 首个对外开源版本（Windows 绿色版）
- 七系统 + 数据层 + IPC 架构文档：脑 / 心 / 嘴 / 神经 / 扩展 / 整体 / 时间 + 数据层 + IPC
- 扩展开发者协议（`engineApiVersion` ^1.0.0，OpenForU `u/` → 官方 `ackem/` PR 路径）
- 开源文档集：`CODEBASE-PATHS.md`、`memory-format.md`、`distribution-windows.md`
- AGPL-3.0 + CLA v1.1 许可证体系
- 用户文档中英双版（8 篇 *.zh.md）

### Changed

- 产品对外版本号统一为 **v1.0.0**（构建目录 `Ackem-1.0.0-win-x64`）
- `community/` 扩展市场流水线默认关闭（`COMMUNITY_EXTENSIONS_OPEN=false`）

### Security

- 发行包不含用户 `data/`、API Key、`.env`
- 见 [SECURITY.md](./SECURITY.md)

---

## [0.0.0] - 内部构建

- 早期 electron-builder 构建号；功能与 v1.0.0 绿色版对齐，版本字符串逐步迁移中。

[1.0.0]: https://github.com/JasonLiu0826/Ackem/releases/tag/v1.0.0
