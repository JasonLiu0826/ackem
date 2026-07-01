# openforu — 用户自创扩展

> **让每个用户都能创造属于自己的 Skill 和 Plugin**

## 这是什么？

openforu 是 Ackem 的「用户自创扩展」模块。它让你通过对话的方式，由 AI 辅助创建自己的 Skill 和 Plugin。

与官方 `plugins/` 和 `skills/` 目录不同，openforu 是**创作渠道**而非分发渠道。你在这里创建的东西只有你自己能看到和使用。

## 目录结构

```
openforu/
├── README.md          ← 本文件
├── types.ts           ← 类型定义
├── loader.ts          ← 加载器（扫描+注册到引擎）
├── uskills/           ← 用户自创 Skill（配置+prompt，无代码）
│   ├── CATALOG.md
│   ├── _template/     ← 模板
│   ├── examples/      ← 示例
│   └── <your-skill>/
└── uplugins/          ← 用户自创 Plugin（可执行代码+沙箱）
    ├── CATALOG.md
    ├── _template/     ← 模板
    ├── examples/      ← 示例
    └── <your-plugin>/
```

## 与官方扩展的关系

| 维度 | 官方 plugins/skills | openforu |
|------|---------------------|----------|
| 创建方式 | 开发者手写代码 + 审核 | AI Agent 对话生成 + 人工审核 |
| 权限上限 | 最高（社区签名） | 默认受限，可逐项提权 |
| 存储位置 | `extensions/`（仓库内） | `data/openforu/`（用户数据目录） |
| 发现性 | 公开列表 | 仅自己可见 |
| 升级路径 | — | 满意后可提交到官方目录 |
| 协议 | Plugin/Skill manifest | **完全复用**现有协议 |

## 接口协议

openforu **100% 沿用**现有 plugins 和 skills 的接口协议：

- **uskill** → 使用 `SkillManifest` + `SkillHandler` + `SkillInvocation`（见 `../skills/types.ts`）
- **uplugin** → 使用 `PluginManifest` + `PluginSandboxApi` + `ExtensionLifecycleHooks`（见 `../plugins/types.ts`）
- 两者都通过 `ExtensionEvent` 单向回流到引擎（见 `../protocols.ts`）

不引入新协议，不修改引擎接口。

用户关闭 uskill / uplugin 后，运行时与内置扩展相同：**当作没有该功能，正常聊天**。详见 [`../EXTENSION_AVAILABILITY_POLICY.md`](../EXTENSION_AVAILABILITY_POLICY.md)。

## 安全模型

| 层 | uskill | uplugin |
|----|--------|---------|
| 代码执行 | 无（纯 JSON 配置） | worker_thread 隔离 |
| 权限基线 | engine_read | readonly + engine_read |
| 升级权限 | N/A | 需用户逐项审批 |
| 文件写入 | N/A | 限制在 data/openforu/uplugins/<id>/ |
| 网络访问 | N/A | 默认禁止，需声明白名单 |
| 禁止权限 | N/A | clipboard_read, foreground_detect |

## 如何使用

1. 在 Ackem 中点击「我的扩展」→「创建新扩展」
2. 告诉 Ackem 你想要什么功能
3. AI Agent 在 Plan 模式中理解需求 → 设计 → 生成代码
4. 审查生成的 manifest + 代码 + 权限清单
5. 确认部署 → 扩展到 `data/openforu/uskills/<id>/` 或 `uplugins/<id>/`
6. 启用后立即生效

详见 [OpenForU 用户扩展协议](./PROTOCOL.md)（§4.4 权限 · §4.5 Surface invoke · §4.6 Verify smoke）· [Jarvis 演进 JE-1b](../../../../docs/mainDocs/openforu-jarvis演进路线_5_30开发接续.md) · [L1 进度](../../../../docs/mainDocs/实现现状与路线图_5_30更新.md) §阶段十三。
