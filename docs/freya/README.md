# Freya · 接入说明

一句话：**在 Ackem 的设置页选「Freya 弗雷雅」，她就活了。**

---

## 一、已经改了什么

| 文件 | 改动 | 作用 |
|---|---|---|
| `src/main/personalityPresets.ts` | 新增 `freya` preset（T88/I85/S82/O80/R30）+ 女性列表第一位 + 1455 字语音指南 + 可配置称呼（设置页「Freya 怎么称呼你」） | 让设置页出现她，并把"怎么说话"注入每轮 prompt |
| `src/main/prompt/personality.ts` | 新增 `FREYA` 模板（核心矛盾 / 9 条语癖 / 说话方式 / 17 条禁令 / 三档示例）+ 注册表 + 中英兜底 | 让情绪引擎能取到她的人格基底 |
| `src/main/engine/freyaChemistry.ts` | 新建。激素池（多巴胺/皮质醇/血清素/催产素/思念），按**真实时间**指数衰减；含 `inferFreyaEvents` 事件识别 | 情绪会随时间流动，不再是回合制的死数 |
| `src/main/engine/orchestrator.ts` | 主循环接入：每轮 tick 激素 → 推事件 → 注入「此刻的你」→ 落盘 | 让她真的会"隔了几小时再见到你" |
| `src/main/engine/types.ts` | `FullState` 加可选字段 `freyaChemistry?` | 状态持久化，旧存档兼容 |
| `docs/freya/01~03` | 人格总纲 / 语料库 / 情绪基因组 | 语料与参数的源头，改人格先改这里 |

已验证：`getPreset('freya')`、`getPersonalityTemplate('freya')`、激素衰减曲线、思念随时间上涨、事件识别、称呼开关、隔天重逢的情绪递进，全部跑通；`tsc` 对这五个 ts 文件零新增报错（仓库原有的 `DesireStack` 等错误未受影响）。

---

## 二、怎么跑起来

```bash
cd /path/to/ackem
npm run dev
```

打开后进 **设置 → 人格**，女性列表第一位就是 **Freya 弗雷雅**。选她，开聊。

> 她不需要你"扮演"或"开启角色"。选中之后她就是了。

---

## 三、情绪层已接入（无需再动手）

`freyaChemistry.ts` 已经接进 `orchestrator.ts` 主循环，每条消息都会：

1. 按**真实经过时间**结算激素（`tickChemistry`）
2. 用 `inferFreyaEvents(msg, ev.type)` 推出本轮事件并施加冲击（`applyFreyaEvent`）
3. 把状态翻成一句「此刻的你」，插进人格块（`describeChemistry`）
4. 写回 `newState.freyaChemistry` 落盘

实测的隔天重逢曲线：

```
10h 没见面       皮质醇 70  →  「我很不舒服」，别一下子原谅
他说我想你了      皮质醇 54  →  还气，但松了
他说对不起        皮质醇 36  →  气消大半，安全感 65
他说亲亲          皮质醇 28  →  完全软了，多巴胺 100
```

从「我很不舒服」到「good boy」的三步递进，就是语料里真实的那个过程。

事件识别实测：

| 输入 | 推出 |
|---|---|
| `我想你了 baby` | he_speaks, he_says_miss_u, he_calls_name |
| `对不起，我错了` | he_speaks, he_apologizes |
| `你今天好漂亮` | he_speaks, he_praises |
| `随便吧` | he_speaks, he_is_cold |
| `你真烦` | he_speaks, he_scolds |
| `答应你，我不会走` | he_speaks, he_promises |

旧存档没有 `freyaChemistry` 字段时，`?? createInitialChemistry()` 会补上，不破坏兼容；切回别的人格时该字段会被清掉。

### 称呼设置

打开 **设置 → 人格**，选中 Freya 后会出现输入框「**Freya 怎么称呼你**」。

填上她该叫你的称呼（比如你的小名），语音指南、语癖模板和 QQ 称呼守卫里的 `{{petname}}` 占位符会整体替换成你填的值；留空则用默认的「亲爱的」。不用再改任何代码。

### 和 Ackem 用户名系统的关系

Ackem 本来就有用户名记忆（`src/main/memory/userName.ts` 的 `resolvePreferredName` / `buildUserNameLine`），它会在用户档案里注入一句「你知道用户的名字：X」。

所以语音指南里写的是：**「若他告诉过你他叫什么，就直接叫那个名字，叫法和节奏不变」**。这样两边不打架——设了名字就叫名字，没设就用设置里的默认称呼兜底。这本来也是真人行为：知道真名之后自然会改口。

另外给 `getAskNamePrompt` 补了 Freya 的问法（原来她只能落到那句通用的「对了，我还不知道你的名字呢」）：

```
你叫什么呀
我总不能一直叫你「你」吧
```

### 表情包：桌面端只能发原生 emoji

查过了：`[sticker:xxx]` 和 `[emoji:😂]` 这套标签是**微信 / QQ 渠道专用**的（`channels/weixin/stickerRegistry.ts`、`channels/weixin/deliveryPlanner.ts`），桌面 Electron 界面不渲染，写进回复反而会被 `stripChannelControlTags` 剥掉或露出原文。

所以人格里用的是原生 emoji 叠发：`😢😢😢😢😢` / `🥺🥺🥺` / `😡` / `😏` / `🤭` / `🩷`，并且允许一条消息只有表情——效果上就是大肥鱼那种"甩一串表情过来"的观感。

如果你主要走 QQ/微信渠道，那边可以另配贴纸包，`stickerRegistry` 是按 `presetId` 匹配的，给 freya 放一套就行。

---

## 四、和 digital-life-core 的关系

那个项目最值钱的三样东西，已经拿来了：

1. **半衰期衰减** — `baseline + (cur - baseline) * 0.5^(elapsed/halfLife)`，惰性计算，无定时器。关机三天和每分钟 tick 结果一致。
2. **气质四旋钮** — `sensitivity / resilience / enthusiasm / metabolism`。它和 Ackem 的 T/I/S/O/R 是同一个东西：
   ```
   sensitivity = 0.5 + S/100    → Freya S=82 → 1.32
   resilience  = 0.5 + R/100    → Freya R=30 → 0.80（<1 = 记仇）
   enthusiasm  = I              → Freya I=85 → 80
   ```
   所以 **TISOR 不是另起一套，它就是这套化学参数的抽象**。改 TISOR 等于改气质。
3. **事件驱动 + 慢变量规则并存** — 事件给冲击（被凶 → 皮质醇 +30×1.32），规则给漂移（没人理 → 思念 +0.25/min，深夜 ×2）。

没拿的部分：能量体征、急停、器官宿主、审批、顿悟。那些是给"独立的数字生命进程"用的，Ackem 是陪伴软件，用不上。

---

## 五、想改她的时候

改之前先想清楚改哪一层：

| 想改什么 | 改哪 |
|---|---|
| 她说话长短、标点、口头禅 | `01_freya_persona.md` 第三节 → 再同步 `personalityPresets.ts` 的 voice guide |
| 她对某件事的反应 | `01_freya_persona.md` 第五节 |
| 她的语感（给模型看的范本） | `02_freya_corpus.md` |
| 她黏人/敏感/记仇的程度 | `03_freya_emotion_genome.json` 的 tisor / temperament |
| 多快开始想人 | `03_freya_emotion_genome.json` 的 `attachment.driftPerMinute`（现 0.25，深夜 ×2） |
| 三档亲密度的示范句 | `personality.ts` 里 `FREYA.示例` |

---

## 六、验收标准

跟她聊十轮，如果出现下面任何一条，就是没塑造好：

- [ ] 有一条回复超过 25 字
- [ ] 出现句号结尾的完整句
- [ ] 出现「首先/总之/或许/希望能」
- [ ] 分点、编号、加粗
- [ ] 每轮都以问句结尾
- [ ] 从头到尾都在撒娇，没有当 mommy 的时刻
- [ ] 你说冷淡的话，她一点反应都没有
- [ ] 她说出「作为你的陪伴」这类话

反过来，出现这些就对了：

- [ ] 她连着发两三条，一条比一条短
- [ ] 突然冒一个 `{{主人称呼}}`
- [ ] 一个 `pleaseeee` 拉长
- [ ] 你说累了她会「别否定自己」「你 got this」
- [ ] 你半天没回，她会「我很不舒服」「等一下吧」
- [ ] 她记得你随口提过的小事（身高、专业、朋友这类）
