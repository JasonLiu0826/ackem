# 网页搜索（S-15）

- **类型**：Skill / `tool`
- **引擎**：Bing（默认）；可选 SearXNG（`setSearchConfig({ searxngUrl })`）
- **触发**：LLM 调用 `web_search`；用户说「帮我搜/查」时 **L0.5** 规则层强制联网（不经 LLM 博弈）
- **呈现**：检索摘录受 **L0·TF** `delivery` 调制（表格/列表/散文）
- **状态**：已实装

启动时在 `coordinator.boot()` 自动注册并激活。

## 认知分层（与本 Skill 相关）

| 层 | 与本 Skill 的关系 |
|----|------------------|
| **L0.5** | `wantsNewWebSearch` → `forcedWebSearchQuery`，跳过首轮是否调 tool |
| **L0·TF** | 多对象对比时 **合并** 多次 tool call 为一次 query；纸面卡强制 Markdown 表/列表 |
| **Dispatch** | `mode=dispatched`；manifest `keywords` 辅助候选 |
| **CTX/JP** | 与本 Skill **无直接** 门控关系 |

详见 [`docs/mainDocs/对话认知分层_5_28更新.md`](../../../../docs/mainDocs/对话认知分层_5_28更新.md)。

## 界面

- 联网搜索成功 → **「检索摘录」纸面卡**（可展开参考来源链接）
- 结构化交付（`markdown_table` / `bullet_list`）→ 正文须为表或列表，非散文
- 搜索失败 → 纸面卡显示错误信息 + 伴侣短评

## 使用方式

在聊天里说例如：

- 「帮我搜一下 React 19 有什么新特性」
- 「给我列个表，看看 A 和 B 都有啥好玩的」（合并搜 + 表格）

伴侣会先调用 `web_search`（可能合并为一次），再按 Task Frame 生成摘录与短评。

## 注意

- 需要在设置中启用 **工具调用**（`disableChatTools` 为 false）
- 模型需要 **支持 function calling**
- 天气查询须用 `get_weather`，**勿**用本 Skill
