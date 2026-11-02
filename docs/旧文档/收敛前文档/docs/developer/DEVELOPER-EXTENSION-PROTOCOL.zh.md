> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# Ackem 扩展接口与开发路径

[English](DEVELOPER-EXTENSION-PROTOCOL.md) · [扩展架构](architecture/05-extension-system.zh.md)

## 当前边界

Ackem 的 plugin 路由调用已安装并启用的能力；创建或修改插件属于 work，由 AckemCode 执行。生成代码后仍需满足 manifest、注册、权限、加载与验收要求，不能将生成成功当成安装成功。

OpenForU Plan 的设计、部署、Worker 与 Surface 代码继续存在，属于用户扩展子系统；主聊天不再统一走旧 Create → Plan 入口。AckemCode 的技能/插件加载接口与 Ackem 的扩展协议不同。

## 命名空间

| scope | 用途 | 当前状态 |
|---|---|---|
| `ackem/` | 官方内置 Skill / Plugin | 可用能力以实际注册与 active 状态为准 |
| `u/` | 本机 OpenForU 用户扩展 | 从活跃数据根加载，受权限限制 |
| `community/` | 签名市场包协议 | `COMMUNITY_EXTENSIONS_OPEN=false`，当前关闭 |

ID 格式：`<scope>/<name>@<semver>`。不要把 scope、版本、调用标签与工具名称混为一谈。

## 核心接口

[protocols.ts](../../../../../src/main/extensions/protocols.ts) 定义 EngineSnapshot、ExtensionEvent、生命周期和 DispatchConfig；[coordinator.ts](../../../../../src/main/extensions/coordinator.ts) 组装注册与运行时。

- 扩展通过快照和协议事件与宿主交互，不绕开接口直接改引擎状态。
- Skill 的 handler、Plugin 的 hooks / invoke / Surface 依各自类型实现。
- 能力需要进入 catalog 时，应提供有效 dispatch 配置、可调用实现和 active 状态。
- 后台 hook、皮肤或生命周期插件不必全部表现为用户可调用的 plugin 路由候选。

## 代码与落盘

| 类型 | 路径 |
|---|---|
| 官方 Skill | `src/main/extensions/skills/builtin/<category>/<name>/` |
| 官方 Plugin | `src/main/extensions/plugins/builtin/<category>/<name>/` |
| 本机用户扩展 | `<dataRoot>/openforu/uskills/<slug>/`、`uplugins/<slug>/` |
| 开发模板 | `src/main/extensions/openforu/` 下的模板与例子 |

源码中的例子不是用户数据目录，不会因为放进模板目录就自动安装。具体协议见 [OpenForU](../../../../../src/main/extensions/openforu/PROTOCOL.md)。

## 版本兼容

`engineVersion` 是扩展校验使用的应用范围，`engineApiVersion` 是协议范围。当前 [constants.ts](../../../../../src/main/extensions/ecosystem/constants.ts) 中 `ACKEM_APP_VERSION='0.0.0'`、`ACKEM_ENGINE_API_VERSION='1.0.0'`，与根应用 package 的 2.0.0 并不相同。

这是当前代码事实，不要仅为“文档版本统一”把 manifest 范围全部改成 2.x。校验实现见 `ecosystem/manifestValidate.ts`；调整版本策略需连同运行时代码和兼容性一起评估。

## 权限与失败

用户扩展按 manifest 和运行时审批申请权限；Worker / Surface 的文件、网络限制不代表 AckemCode 也被限制在同一 staging 目录。

不可用能力不应提供给模型当成可执行目标；已选择但未完成的操作必须如实反映失败或未执行。不能用“静默降级”伪造用户要求的结果。

## 贡献与验证

按[贡献指南](../../../../../CONTRIBUTING.zh.md)提交源码和验证说明。核对注册、关闭/启用、能力目录、权限、实际调用和回执。公开仓库不分发完整本地测试套件；使用[现有验证命令](testing.zh.md)和适当手工检查。

社区市场保持关闭；贡献优先通过官方源码或本机 `u/` 原型推进。
