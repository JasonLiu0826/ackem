# Hello World Plugin（示例）

最简单的 uplugin 示例。演示了 uplugin 的核心能力：

1. **引擎快照读取**：通过 `api.getEngineSnapshot()` / `onEngineUpdate` 获取只读情绪/关系状态
2. **日志记录**：通过 `api.log()` 写入调试日志
3. **文件持久化**：通过 `api.writeOwnFile()` / `api.readOwnFile()` 写入自身数据目录
4. **上下文注入**：通过 `api.emitEvent()` 产出 ExtensionEvent，注入 LLM 上下文
5. **情绪提示**：通过 `emotionHint` 建议引擎微调情绪

## 行为

- 每轮对话后记录当前 `aff`（好感度）到 `emotion-log.txt`
- 好感度单轮上升 >15 时：注入正面提示
- 好感度单轮下降 >10 时：注入安抚提示

## 试试看

启用此 Plugin 后，在 `data/openforu/uplugins/u__hello-world@1.0.0/emotion-log.txt` 查看情绪日志。
