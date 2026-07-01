# 共同观影/听歌（S-08）

- **类型**：Skill / `keyword` + `dispatched`
- **状态**：**Preview**（SMTC 按需读标题 · W8 情绪联动加深）
- **ID**：`ackem/media-co-watch@0.0.1`

## 当前行为

| 能力 | 状态 |
|------|------|
| 关键词触发共娱陪伴句 | ✅ |
| Windows SMTC 按需读曲名/标题 | ✅ Preview（`refreshMediaSessionCache`） |
| 后台轮询 + 情绪→评论风格 | ❌ W8 |

## 验收

用户说「我在听歌」且系统 SMTC 有标题时，回复含 `Artist - Title`。

测试 env：`ACKEM_MEDIA_TITLE` / `ACKEM_MEDIA_ARTIST` / `ACKEM_MEDIA_PLAYING=1`
