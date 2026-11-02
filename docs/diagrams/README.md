# 文档图表

[English](README.en.md) · [项目说明](../../README.md) · [架构导航](../architecture.zh.md)

## 核心总览

核心图提供中英文、浅色和深色 SVG。正文直接展示浅色 SVG，并提供深色版本与图源链接。SVG 可放大，图中保留标题和文字说明。

| 图 | 中文 | English |
|---|---|---|
| 请求与三级路由 | [浅色](request-routing-zh.light.svg) · [深色](request-routing-zh.dark.svg) | [Light](request-routing-en.light.svg) · [Dark](request-routing-en.dark.svg) |
| 三个执行入口 | [浅色](runtime-architecture-zh.light.svg) · [深色](runtime-architecture-zh.dark.svg) | [Light](runtime-architecture-en.light.svg) · [Dark](runtime-architecture-en.dark.svg) |
| 托管任务闭环 | [浅色](managed-task-lifecycle-zh.light.svg) · [深色](managed-task-lifecycle-zh.dark.svg) | [Light](managed-task-lifecycle-en.light.svg) · [Dark](managed-task-lifecycle-en.dark.svg) |
| AckemCode 内核 | [浅色](kernel-overview-zh.light.svg) · [深色](kernel-overview-zh.dark.svg) | [Light](kernel-overview-en.light.svg) · [Dark](kernel-overview-en.dark.svg) |

## 统一表达

- 蓝色表示 Ackem 的处理、协调或工具适配，紫色表示内核或智能处理，绿色表示结果与交付。
- 灰色用于输入、存储和辅助信息；黄色用于降级、风险或需注意的状态。
- 名称和形状同样表达含义，不只依赖颜色。
- 实线表示主调用或数据流；虚线表示可选、反馈、依赖或存储关系，以线旁文字为准。
- 一张图回答一个问题。复杂流程拆成总览与细节，不把所有函数和参数放进节点。
- 代码、公式和目录树保留文本格式，避免被误画成执行流程。

## 维护与验证

核心图的 Mermaid 源文件集中在 [sources](sources)，阅读正文不包含折叠标签或生成定位注释。技术关系以图源和实际源码为准。核心图的 SVG 使用固定版式与字体层级，由 [生成脚本](../../scripts/render-doc-figures.mjs) 制作；架构变化时同步 Mermaid 与版式内容。

```powershell
node scripts/render-doc-figures.mjs
node scripts/render-doc-figures.mjs --check
```

脚本只使用 Node.js 内置模块，不需要安装额外依赖。`--check` 比较版式输出及 Mermaid 来源校验值，防止文档修改后忘记更新图。

其余技术图直接使用文档中的 Mermaid。修改后检查语法、连线含义、标签长度、深浅色可读性，以及在常用文档宽度下是否过宽或过长。Mermaid 能正常解析仍不能代替视觉检查。
