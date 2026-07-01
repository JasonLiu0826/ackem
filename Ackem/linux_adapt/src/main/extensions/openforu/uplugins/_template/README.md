# 我的 Plugin（模板）

OpenForU uplugin 空白模板。**复制到 `data/openforu/uplugins/<slug>/` 使用**。

> **v1 提醒**：Plan 暂不能自动生成 uplugin；运行时 worker 加载尚未接通。本模板供手改与 OF-05 参考。

协议：[`../../PROTOCOL.md`](../../PROTOCOL.md)

## 快速开始

1. 复制到 `{dataRoot}/openforu/uplugins/my-plugin/`
2. 编辑 `manifest.json`（含 **dispatch** 与 permissions）
3. 实现 `src/index.ts` + `main.ts`
4. 待 OF-05 运行时接通后在扩展中心启用

## 例题

[`../examples/hello-world/`](../examples/hello-world/) — 情绪日志 + `emitEvent` 注入。

## 安全约束

- 沙箱 API 读写仅限自身目录
- `clipboard_read` / `foreground_detect` 对用户插件禁用
- 升级权限需在扩展中心逐项审批（UI 待完善）
