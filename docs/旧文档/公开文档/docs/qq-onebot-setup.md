> 历史归档：保留旧版内容，仅供追溯；当前实现请阅读[新版文档导航](../../../README.md)。

# QQ 通道接入指南（OneBot v11）

> 目标：在手机 QQ 里和 Ackem 里的她聊天。人格、记忆、情绪全部仍在本机运行，QQ 只是新的「前端」。
>
> 本文档对应 `src/main/channels/qq/` 这套实现。协议后端可换（NapCat / LLOneBot / Lagrange），
> 因为它们都暴露同一套 OneBot v11 接口。

---

## 一、整体链路

```
手机 QQ  ←→  腾讯服务器  ←→  NapCat（Docker 容器，你的 QQ 小号登录在这里）
                                     ↓ OneBot v11（HTTP + WebSocket）
                              Ackem 主进程 qq 渠道
                                     ↓
                        companionTurn（人格 / 记忆 / 情绪，和内置聊天完全同一套）
                                     ↓
                        deliveryPlanner（拆条 + 随机间隔）
                                     ↓
                        outboundSequence（逐条发出，偶尔插一张表情包）
```

三个关键点：

1. **登录态在 NapCat 里**，不在 Ackem 里。Ackem 只存连接地址和 token，不碰 QQ 密码。
2. **回复逻辑和内置聊天完全一致**：同一个 `runCompanionTurn`，同一套人格预设、记忆检索、情绪状态机。QQ 渠道只多做了「拆条发送」和「表情包」两件事。
3. **协议端可替换**：只要对方说 OneBot v11，就能接。

---

## 二、前置条件

- 已装 Docker Desktop（要能跑 linux/arm64 或 amd64 容器）
- 一个 **QQ 小号**（不要用主号）
- Ackem 里已经配好对话模型（设置 → 模型与 API），且记忆引擎已预热完成

---

## 三、部署 NapCat（Docker）

新建一个目录，比如 `~/napcat`，在里面放 `compose.yaml`：

```yaml
services:
  napcat:
    image: mlikiowa/napcat-docker:latest
    restart: unless-stopped
    environment:
      MODE: ws
      WEBUI_TOKEN: 换成你自己的强密码
    ports:
      - "127.0.0.1:6099:6099"   # NapCat WebUI
      - "127.0.0.1:3001:3001"   # OneBot 服务端口
    volumes:
      - ./data/qq:/app/.config/QQ
      - ./data/config:/app/napcat/config
      - ./data/plugins:/app/napcat/plugins
```

启动：

```bash
cd ~/napcat
docker compose up -d
docker compose logs -f napcat
```

看到容器稳定运行后，浏览器打开：

```
http://127.0.0.1:6099/webui
```

用你设置的 `WEBUI_TOKEN` 登录。

> 只绑了 `127.0.0.1`，所以只有本机能访问。这是刻意的：不要让 QQ 会话暴露到局域网或公网。

---

## 四、扫码登录 QQ 小号

### 方式 A：在 Ackem 里直接扫码（推荐，1.0+）

1. 打开 **设置 → 手机 → QQ → 扫码登录（NapCat）**
2. 填一次 **NapCat WebUI 地址**（默认 `http://127.0.0.1:6099`）和 **WebUI 令牌**（compose 里的 `WEBUI_TOKEN`）
3. 点 **「一键生成登录二维码」**
4. 手机 QQ 切到小号 → 扫一扫 → 确认登录
5. 登录成功后 Ackem 会自动测试 OneBot、保存并启用通道；若 OneBot 还没起来，会提示你稍后点「测试连接」

二维码 100 秒过期会自动刷新；被腾讯踢下线后，回到这里再点一次即可。

> 令牌只存在本机 `{数据目录}/channels/qq-webui.json`，不会回传到界面；Ackem 不保存 QQ 密码。

### 方式 B：在 NapCat WebUI 里扫码

1. 浏览器打开 `http://127.0.0.1:6099/webui`，用 `WEBUI_TOKEN` 登录
2. WebUI 里点登录，会出现二维码
3. 手机 QQ 切到小号 → 扫一扫 → 确认登录
4. 登录成功后 WebUI 会显示头像和 QQ 号

登录态会存在 `./data/qq` 里，容器重启不用重扫。

---

## 五、打开 OneBot 服务

WebUI → 网络配置 → 新建 **WebSocket 服务器**：

| 项 | 值 |
|---|---|
| 名称 | ackem |
| Host | 0.0.0.0 |
| Port | 3001 |
| Token | 留空，或自定一个并记下来 |
| 消息格式 | array（推荐）或 string，两种 Ackem 都能解析 |
| 上报自身消息 | 关闭 |

保存后状态应为「运行中」。

> **可选但推荐**：再加一个 **HTTP 服务器**（端口 3000）、并在 compose 里补上 `"127.0.0.1:3000:3000"`。
> Ackem 会优先用 HTTP 调接口，HTTP 不通时自动回退到 WebSocket，所以**只开 WebSocket 也能完整工作**。
> 开两个的好处是每次调用更快、排错更直观。

---

## 六、在 Ackem 里连上

设置 → 手机 → QQ：

| 字段 | 填什么 |
|---|---|
| HTTP 接口地址 | `http://127.0.0.1:3001`（或 3000，如果你另开了 HTTP 服务） |
| WebSocket 事件地址 | `ws://127.0.0.1:3001` |
| access_token | 上一步设的 token，留空则填空 |

1. 点 **测试连接** → 应显示「连上了，协议端有响应」并读出 QQ 号和昵称
2. 点 **保存并启用** → 状态变成「正在监听」
3. 手机 QQ 用小号的好友（或者拿主号加小号好友）发一条私聊

第一次回复可能要等几秒：记忆引擎检索 + 模型首 token + 拆条延迟叠加。

---

## 七、表情包（"不像机器人"的关键之一）

程序自带一套内置表情包（`assets/qq-memes/`，可爱 / 撒娇热梗包，约 70 张），
安装后开箱即用，不用自己找图。想换成自己的图，把图片丢进：

```
<数据目录>/qq-memes/
```

按情绪分子目录，目录名就是标签：

```
qq-memes/
  happy/    开心、玩闹
  tease/    吐槽、逗
  love/     亲密
  shy/      害羞
  warm/     温柔
  hype/     兴奋
  sad/      低落
  annoyed/  生气
  cold/     冷淡
  neutral/  通用
```

- 支持 `png / jpg / gif / webp`，单张 ≤ 4 MB
- 目录为空时不发图，只发文字
- **用户目录优先**：与内置包同名（同情绪 + 同名文件）的图以你自己的为准，可以用来覆盖内置包里的某一张
- 发图概率由人格预设的 `stickerAffinity` 决定，大约三条回复一张，参考大肥鱼的 `meme_manager`

情绪映射规则（`emotionToMemeMood`）：先看用户说了什么（诉苦 → sad，撒娇 → love），再看情绪状态机的 `aff`（亲和度）和 `aro`（唤醒度）。

内置表情包的来源与版权说明见 `assets/qq-memes/CREDITS.md`。

---

## 八、调参：让她更像人

| 想要的效果 | 改哪里 |
|---|---|
| 一次发更多/更少条 | `weixin/deliveryProfiles.ts` 里对应预设的 `bubbleRange` |
| 条与条之间的停顿 | 同上，`gapMs` |
| 语气更像某个角色 | 设置 → 伴侣与人格 → 人格预设 |
| 表情包更密 | 预设的 `stickerAffinity`（0~1） |
| 记忆更准 | 设置里调 `memoryBudgetChars` |

---

## 九、排错

| 现象 | 原因与处理 |
|---|---|
| 测试连接报「连不上 OneBot」 | 容器没起 / 端口没开 / token 不一致。先 `docker compose logs -f napcat` |
| 一键生成二维码报「连不上 NapCat WebUI」 | 6099 没映射或容器没起。确认 compose 里有 `127.0.0.1:6099:6099`，再 `docker compose ps` |
| 容器在跑但仍报「连不上 NapCat WebUI」 | 检查 NapCat 配置里 WebUI 是否被禁用（`disableWebUI`），或 6099 只监听在容器内 |
| 一键生成二维码报「WebUI 令牌不对」 | `WEBUI_TOKEN` 与 NapCat 当前 token 不一致；NapCat 可能自动生成过随机密码，用 `docker compose logs napcat \| grep -i token` 找一下 |
| 扫码成功但提示「OneBot 还没就绪」 | NapCat 登录后启动 3001 需要几秒；等 10 秒点「测试连接」。仍失败就检查 3001 是否映射 |
| 二维码显示「已经登录」 | NapCat 里已经有 QQ 在线，无需再扫；要换号先在 WebUI 退出，或重启容器 |
| 状态一直「未在监听」 | WS 地址错，或 NapCat 的 WS 服务没点「运行中」。改完点「重新连接监听」 |
| 收不到消息 | NapCat 里「上报自身消息」开着会导致自问自答被我们过滤；确认小号在线 |
| 发出了但 QQ 那头没显示 | 大概率是被风控拦截。换小号、降低频率、别在刚登录时群发 |
| 回复里混进奇怪标签 | 已有 `sanitize.ts` 清洗 `<system_reminder>`、DSML、`<\|special_token\|>`；若发现新标签，往 `BLOCK_TAGS` 里加 |
| 图片发不出去 | 单张超过 2 MB，或格式不支持。转成 png/jpg 再放进目录 |
| 容器重启后要重扫 | `./data/qq` 目录没正确挂载（权限问题，linux 下注意 UID/GID） |

---

## 十、和大肥鱼的对照

大肥鱼的真实链路是 **AstrBot（框架）+ NapCat（协议端）+ DeepSeek（模型）**，能力靠一堆插件拼：

| 能力 | 大肥鱼的做法 | Ackem QQ 渠道 |
|---|---|---|
| QQ 接入 | NapCat + OneBot | ✅ 同 |
| 模型 | DeepSeek | ✅ Ackem 已配置的任意模型 |
| 人格 | `persona/大肥鱼.md` 单文件 | ✅ 结构化人格预设 + 六维参数 |
| 记忆 | LivingMemory 插件 | ✅ Ackem 原生 embedding 记忆 + 日记 |
| 分条连发 | 文字分段 | ✅ 按人格调参的 `deliveryPlanner` |
| 表情包 | meme_manager，概率发图 | ✅ `memes.ts`，按情绪 + 概率 |
| 情绪驱动 | 无独立状态机 | ✅ aro/aff 情绪状态机驱动语气与配图 |
| 语音条 | 豆包 / Edge / MiMo / Breeze | ⏳ ACKM 有 voice-service，QQ 渠道待接 |
| 主动消息 | proactive_chat 插件 | ⏳ 复用微信的 proactiveScheduler，待接 |
| 群聊插话 | group_chat_plus | ⏳ 未做（当前只处理私聊） |
| 改签名/发空间 | qqprofile / qzone 插件 | ⏳ 未做 |
| 内部标签清洗 | dafeiyu_clean 插件 | ✅ `sanitize.ts` |
| 上下文压缩 | 滚动摘要 | ✅ Ackem 原生 tierB + 记忆预算 |

已经能跑通的是「文字私聊 + 人格 + 记忆 + 分条 + 表情包」这条主干——这也是"像人"体感里权重最大的部分。

---

## 十一、稳定性预期

第三方 QQ 协议端都在腾讯风控视野内：

- 随时可能要求重新验证、或短暂掉线
- Ackem 侧已有断线重连（1s 起、指数退避、上限 30s）和心跳静默检测（90s）
- 但**登录态失效只能人工重新扫码**；1.0+ 可以在设置页一键重新生成二维码
- 用小号、别群发、别高频——这三点比任何技术手段都有效

---

## 十二、相关代码

```
src/main/channels/qq/
  types.ts            OneBot 类型与常量
  cqCode.ts           CQ 码转义 / 消息段 / 纯文本提取
  onebot.ts           客户端：HTTP + WS 双通道、重连、心跳
  auth.ts             配置校验与连通性探测
  webuiConfig.ts      NapCat WebUI 地址 / 令牌（仅本机）
  loginQr.ts          扫码登录：取码 / 轮询 / 刷新
  store.ts            账号、去重、最近对话人
  monitor.ts          WS 事件 → 业务层
  bridge.ts           入站 → companionTurn → 出站
  outboundSequence.ts 逐条发送（文字 / 图片）
  memes.ts            表情包库与情绪映射
  sanitize.ts         内部标签清洗
  psyche.ts           QQ 场景的人格提示
  index.ts            生命周期
src/main/ipc/qq.ts    IPC
src/main/db/schemaV11.ts  qq_account / qq_seen / qq_peer
src/renderer/src/components/QqConnectSection.tsx  设置页
```
