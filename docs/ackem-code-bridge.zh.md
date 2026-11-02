# Ackem Code 三端接入（桌面 / QQ / 微信）

> 目标：你在任何一端说出"要动代码/文件/命令"的事，她都能交给本机的 **Ackem Code**
> 编码智能体去做，结果只回你提问的那一端。
>
> 实现位置：`src/main/ackemcode/`（桥接层）+ `parts/ackemcode/`（官方编码智能体运行时）。

---

## 一、Ackem Code 是什么

上游 `parts/ackemcode` 是作者独立发布的编码智能体子包（`ackem-code@0.1.0`），自带：

- **daemon**：`http://127.0.0.1:8787`，`POST /api/session/:id/chat` 用 SSE 流式回事件；
- **CLI**：`ackem`（交互 REPL）和 `ackem -p "…" --json`（无头一次性）；
- **工具**：读写文件、`grep`/`glob`、跑命令（沙箱）、web 搜索、MCP、LSP、计划模式等；
- **自带 Web UI**：daemon 静态目录 `dist/client`，浏览器可直接打开。

它不 import 主仓任何源码，是一个自包含子包，因此可以整包复制进来单独升级。

---

## 二、桥接层做了什么

```
桌面 chat:start ─┐
QQ 渠道          ─┼─→ maybeRunCodeTask() ─→ intent 判定 ─→ Ackem Code daemon ─→ 只回提问端
微信渠道         ─┘        (src/main/ackemcode/dispatch.ts)
```

| 文件 | 职责 |
|---|---|
| `src/main/ackemcode/daemon.ts` | 找 `parts/ackemcode`、复用或拉起 daemon、退出时关掉 |
| `src/main/ackemcode/llmSync.ts` | 把 Ackem 主应用已配的 API 同步成 `settings.standalone.json` |
| `src/main/ackemcode/client.ts` | 建会话 / 发一轮 / SSE 解析 / 中止 |
| `src/main/ackemcode/intent.ts` | 判断"这句话是不是要动代码" |
| `src/main/ackemcode/dispatch.ts` | 三端共用入口，命中就执行并返回文本 |
| `src/main/ackemcode/desktopStream.ts` | 桌面端把结果按聊天流协议推给渲染层 |
| `src/main/ackemcode/hostEnv.ts` | 延迟读取 Electron 路径，便于单测 |

### 会话怎么复用

`{userData}/ackemcode-sessions.json` 记录「Ackem 聊天会话 → Ackem Code 会话」，
工作目录一致时复用同一个代码会话，所以连续追问能接上上下文；换目录会新建会话。

### 数据放哪

默认 `~/.ackemcode`（与独立 `ackem` CLI 共用），可用 `ACKEMCODE_DATA_DIR` 覆盖。

---

## 三、怎么触发

1. **显式**：消息以 `/code`、`#code`、`代码：` 开头，后面整段交给 Ackem Code。
2. **自动**：同时满足「动作词」+「工程对象/技术名词」才命中，例如
   - ✅「帮我把这个脚本改一下」「修复一下这个 bug」「把 config.json 的端口改成 3000」
   - ❌「帮我写一首诗」「这个文件里写了什么」——疑问句和陪伴类写作不会被抢走

开关（环境变量）：

| 变量 | 作用 |
|---|---|
| `ACKEMCODE_DISABLE=1` | 完全关闭三端自动派工 |
| `ACKEMCODE_REQUIRE_EXPLICIT=1` | 只认 `/code`，不做意图推断 |
| `ACKEMCODE_PERMISSION_MODE` | 覆盖权限模式，默认 `bypassPermissions` |
| `ACKEMCODE_PORT` / `ACKEMCODE_URL` | 指定端口或复用外部 daemon |
| `ACKEMCODE_DATA_DIR` | 指定数据目录 |

---

## 三·五、工作执行入口

旧电脑助手已删除，聊天不再提供 `use_computer`，也不再注册对应 IPC、调查、本机地图和旧任务计划。

- 桌面聊天：本机任务由 work 路由交给任务协调器，再交由 AckemCode 执行、验收和交付；也可以直接在工作页操作。
- QQ / 微信：已确认的机主可用 `/code …` 或代码任务自然语言请求派工。必须先打开「设置 → 工作执行 → 允许已绑定机主通过 QQ / 微信远程派工」。
- 旧版远程派工授权迁移到 `workRemoteChannelsEnabled`；旧助手开关和执行权限不再生效。

## 四、权限与安全

- daemon 只监听 `127.0.0.1`，不对局域网公开。
- 远程派工默认关闭，并要求桌面确认渠道机主。开启后，移动端代码任务使用设置中的权限模式，缺省为 `bypassPermissions`。
  可在「设置 → 工作执行」收紧权限，或使用 `ACKEMCODE_REQUIRE_EXPLICIT=1`（只认 `/code`）和 `ACKEMCODE_PERMISSION_MODE=default`。桌面任务权限在工作页选择。
- 密钥只写进本机 `settings.standalone.json`（权限 600），日志与文档不记录密钥值。

---

## 五、验证

```bash
# 单元测试（意图判定，不联网）
npx vitest run src/main/ackemcode/bridge.test.ts

# 端到端（真实模型，会拉起 daemon）
ACKEMCODE_LIVE=1 npx vitest run src/main/ackemcode/bridge.test.ts
```

手动验证：

1. 桌面发「/code 列出当前目录的文件」，应看到代码智能体的结果气泡。
2. QQ 私聊发同样内容，结果只回到 QQ，桌面统一会话里会出现这一轮。
3. 微信同理；另外两端不会收到消息。

---

## 六、打包

`electron-builder.yml` 已加：

```yaml
extraResources:
  - from: parts/ackemcode
    to: ackemcode        # → {resources}/ackemcode，与 resolveCodeRoot() 对应
```

子包体积约 163MB（其中 `node_modules` 158MB），打包前必须先跑：
`cd parts/ackemcode && npm ci && npm run build`。

---

## 七、边界

- 桌面端代码任务**不走**普通陪伴的流式节奏与记忆写入，只保留一条正常的助手气泡；
  渠道端由 `conversation.ts` 统一记录，仍带「来自 QQ / 来自微信」标记。
- 多轮追问依赖同一个代码会话；换聊天会话或换工作目录会开新代码会话。
- 若安装包里没有 `parts/ackemcode`（精简包），`maybeRunCodeTask` 会自动回落为普通对话。
