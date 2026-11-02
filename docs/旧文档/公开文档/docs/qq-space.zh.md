> 历史归档：保留旧版内容，仅供追溯；当前实现请阅读[新版文档导航](../../../README.md)。

# QQ 空间自主说说（QZone）

> 目标：让 Ackem 里的她自己发 QQ 空间说说——按人格、心情、当天聊天流水写文案，
> 按节奏挑时机发，偶尔配一张表情包；还可以定时逛空间回评论、按概率给好友动态点赞。
>
> 实现位置：`src/main/channels/qq/qzone/`。协议动作走 OneBot 扩展接口
> （`send_qzone_msg` / `get_qzone_msg_list` / `get_qzone_feeds` / `like_qzone` / `comment_qzone` / `delete_qzone_msg`）。

---

## 一、和聊天通道的关系

```
NapCat（QQ 小号登录）
   ↓ OneBot v11 HTTP + WebSocket
Ackem QQ 渠道（channels/qq/）—— 聊天、表情包、去重
   ↓ 复用同一条 OneBot 连接
QZone 模块（channels/qq/qzone/）—— 发说说、读说说、点赞、评论
   ├─ scheduler.ts  纯函数：该不该发、下一条什么时候发
   ├─ composer.ts   用 LLM 写文案（人格 + 时段 + 情绪 + 记忆 + 最近聊天）
   ├─ actions.ts    OneBot 动作封装（宽松解析返回）
   ├─ interact.ts   逛空间：回自己说说下的评论、好友动态点赞/评论
   └─ store.ts      SQLite：说说历史、发表计划、互动去重
```

- **不额外登录**：登录态仍然只在 NapCat 里，Ackem 不保存 QQ 密码，也不起浏览器。
- **不需要额外开端口**：复用 QQ 通道已经连上的 OneBot 连接。
- **协议端要求**：NapCat / SnowLuma 一类实现了 QZone 扩展动作的后端。只实现了聊天接口的后端，
  设置页会明确显示「协议端不支持」，不会静默失败。

---

## 二、怎么打开

1. 先按 [QQ 通道接入指南](qq-onebot-setup.md) 把 QQ 通道连上、能正常私聊。
2. 设置 → 手机 / QQ → 往下找到「空间说说」。
3. 点「检测空间接口」，确认六项能力里至少 `发说说 / 读说说` 是 ✓。
4. 先保持「试运行（只写不发）」打开，把「让她自己发说说」打开，跑一天看看文风。
5. 满意了再关掉试运行——这时才会真正发到空间。

> 默认值：总开关 **关**、试运行 **开**。和参考实现（大肥鱼 / dsh_qzone_sticker）一样，
> 不手动打开就一句都不会发出去。

---

## 三、可调项

| 设置 | 默认 | 说明 |
|---|---|---|
| 让她自己发说说 | 关 | 总开关；关掉只保留手动发表 |
| 试运行 | 开 | 只生成 + 记历史，不调用 `send_qzone_msg` |
| 每天最多 | 2 条 | 0 = 不限 |
| 两条至少间隔 | 150 分钟 | 硬下限，防止刷新率过高 |
| 活跃时段 | 9–23 点 | 起点 == 终点表示全天；起点 > 终点表示跨夜 |
| 可见范围 | 所有人 | 所有人 `ugc_right=1` / 好友 `4` / 仅自己 `64` |
| 文案风格 | 自动 | 自动按时段和心情选日记 / 随想 / 玩梗 / 深夜 |
| 配一张表情包 | 关 | 从 `{dataRoot}/qq-memes/` 与内置 `assets/qq-memes/` 合并后的库里按情绪挑一张，转 `base64://` 交给协议端上传 |
| 发完在 QQ 里提一句 | 关 | 成功后给最近一个私聊对象发一句「我刚在空间发了条说说」 |
| 定时逛空间 | 关 | 每 3 小时：回自己说说下的新评论、好友动态按概率点赞/评论 |
| 点赞 / 评论概率 | 25% / 5% | 单次运行硬上限：点赞 3 条、评论 2 条、回复 2 条 |

### 节奏是怎么算的

`scheduler.ts` 把活跃窗口按每日上限切成槽位，每槽加 0.7–1.3 的抖动，再夹在
`[最小间隔, 12 小时]` 之间。所以不会准点像定时任务，也不会一段时间内连着刷。

判断顺序：总开关 → 活跃时段 → 当日上限 → 最小间隔 → 计划时间点 → 发。

---

## 四、文案是怎么写的

`composer.ts` 一次调用拿到这些上下文，再要求模型写成「真人随手发空间」：

- 人格预设的口吻（复用聊天同一套 `buildPresetVoiceGuide`）
- 当前时段（`getTimeContext`：清晨 / 上午 / 中午 / 下午 / 晚上 / 深夜）
- 引擎情绪与关系阶段（`state.emotion` / `state.relationship`）
- 记忆里的事实（`FactStore.listActive()` 最近 6 条）
- 最近 QQ 私聊的最后几轮（最多 8 行，`qq:<uid>` 会话）
- 最近 5 条说说的开头（用来避免重复；中文二元组 Jaccard > 0.55 会重写一次）

清洗规则：去掉内部标签、`[SPLIT]`、`[emoji:*]`、包裹引号、多余空行；超长按句末截断。
模型调用失败时用按时段的兜底句，不会让调度空转。

---

## 五、失败了怎么看

- 设置页「最近说说」里失败记录会带原始错误（协议端返回的 `msg` / `wording`）。
- 常见原因：
  - `retcode 1404 / 不支持` → 协议端没有 QZone 扩展动作，换 NapCat 或 SnowLuma。
  - `-30001 / 请先登录` → NapCat 里的 QQ 掉线了，重新扫码。
  - 图片上传失败 → 表情包超过 2 MB，或该图格式协议端不支持。
- 发表失败后会自动把下一条推迟 30 分钟，不会每 3 分钟硬试一次。

---

## 六、数据在哪

`{dataRoot}/ackem.db`：

- `qq_qzone_post`：每条说说（正文、可见范围、来源、状态、错误、时间、tid）
- `qq_qzone_plan`：每个 QQ 号的下一条计划、当日计数、上次发表时间
- `qq_qzone_react`：互动去重（同一 tid + 同一人 + 同一类动作只做一次）

删除历史记录时，如果那条已经发表且有 `tid`，会顺带调用 `delete_qzone_msg` 删掉空间里的那条。

---

## 八、附：QQ 主动搭话

`channels/qq/proactive.ts` 补上了设置里一直存在的 `qqProactiveEnabled` 开关：

- **门控**：显式开启 + 8:00–22:00 + 双方空闲 3 小时 + 距上次主动 3 小时 + 只找最近聊过的一个人
- **文案**：复用 `companion/proactiveCompose`（人格 / 记忆 / 情绪 / 关系阶段门控与桌面端同一套）
- **发送**：复用 `outboundSequence` + `deliveryPlanner`，会拆成多条短消息，偶尔带表情包
- **默认关**：不打开就不会主动发；收到任何 QQ 消息都会刷新「活跃时间」，所以她在你刚聊完时不会追着说

---

## 七、参考实现

- [accomplish07zrh-eng/dsh-aurabot-qq](https://github.com/accomplish07zrh-eng/dsh-aurabot-qq)（大肥鱼：空间日记用 `send_qzone_msg`，结合当天聊天流水；空间互动按整串评论回一次）
- [kdcadmin/dsh_qzone_sticker](https://github.com/kdcadmin/dsh_qzone_sticker)（每天几条、两条隔多久、公开/仅自己；按心情配表情包）
- [NapNeko/NapCatQQ · SendQzoneMsg](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/action/extends/SendQzoneMsg.ts)（动作参数：`content` / `images` / `ugc_right` / `target_uins`）
