> 历史归档：保留旧版内容，仅供追溯；当前实现请阅读[新版文档导航](../../../../README.md)。

# 源码验证

[English](testing.md)

本仓库发布应用源码，不包含本地测试套件、测试辅助代码、审计快照、凭据和生成缓存。

安装主应用和内核依赖：

```bash
npm ci
npm --prefix parts/ackemcode ci
```

检查渲染层类型并编译应用：

```bash
npm run typecheck
npm run build
```

检查独立内核和 CLI：

```bash
npm --prefix parts/ackemcode run typecheck
```

根目录类型检查覆盖渲染层和共享类型；应用构建编译主进程、preload 和渲染层。这些检查不等同于端到端运行验收。CI 使用 Windows 和 Node.js 22。
