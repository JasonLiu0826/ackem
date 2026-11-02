> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# 发布检查

[English](release-checklist.md)

## 版本与构建

- [ ] 核对 main 中的目标变更与 CHANGELOG。
- [ ] 根 `package.json` 与 `electron-builder.yml` 版本一致；内核与扩展 API 版本独立管理。
- [ ] 安装并构建根应用与 `parts/ackemcode`。
- [ ] 执行[源码验证](testing.zh.md)，记录平台与失败/跳过项。
- [ ] 核对 README、架构、渠道和权限文档与发布代码一致。

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run typecheck
npm --prefix parts/ackemcode run build
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm run build
npm run dist:green
```

Windows 安装包另用 `npm run dist:setup`。macOS 按实际构建与签名流程验证，不因配置存在而宣称所有平台已验收。

## 产物与私人数据

- [ ] `resources/ackemcode` 包含桌面 tsx / 源码入口和渠道编译入口所需文件、依赖。
- [ ] 不包含个人 `data/`、内核会话、模型密钥、`settings.standalone.json`、令牌、日志、`.env`。
- [ ] 核对资源、语音依赖和第三方授权。
- [ ] 在副本或干净机器测试，不用维护者个人数据库作为发行模板。
- [ ] 核对文档打包与实际资源路径，生成真实产物校验值。

## 功能验收

- [ ] chat、plugin、work 分别按职责运行，分类失败不假报派工。
- [ ] work 权限、任务补充、停止、回执、验收/返工、正文与交付正确。
- [ ] 独立工作与 CLI 可以启动、排队和停止。
- [ ] QQ / 微信机主确认、远程派工开关与权限生效。
- [ ] 重启恢复、历史与备份路径核对。
- [ ] 旧电脑助手 UI、工具与 IPC 未重新进入包。

## 发布说明

注明平台、依赖、已验证范围、限制和迁移事项，链接真实产物。源码 main 的能力不自动等同于已发布安装包。按实际版本新增 Release / 历史文档，不改写旧版包名或哈希。
