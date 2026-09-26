# Git 仓库恢复记录（2026-08-29）

## 事故
- 2026-08-29 发现 `.git` 损坏：`main` 指向的提交对象 `1956198a`（2026-07-08, "fix: 图片生成后发送 chat:image IPC 事件到前端渲染 ImageCard"）已丢失，`.git/index` cache-tree 大面积失效，reflog 为空。
- `1956198a` 之后的工作（07-13 stash×2、07-14~17 修复）从未提交，仅存在于工作区。

## 恢复步骤
1. 全量备份工作区与损坏 .git → `F:\britney-backup-20260829.tar.gz`（505MB）。
2. 枚举残存 pack（27 个对象提交）：最新 4 个为 07-13 的 stash（`d9e3ca3`/`bda811a2`="test2"、`ec2512167`="phase-fixes-applied"、`d7bed927`），其父均为丢失的 `1956198a`。
3. 远端 fork（cntyo666/ackem）main=`ab1e98d`（07-07）完好可公开访问。因「有 commit 无 tree」的半残状态无法增量 fetch，遂将原 pack 另存至 `F:\britney-pack-archaeology-20260829\`（含 stash 孤本）后清空对象库全量重建。
4. `main` 重置到 `ab1e98d`，重建 index，将工作区 07-08~07-17 全部改动整体提交。

## 结论
- 内容零损失：工作区（07-17 状态）包含全部有效改动；丢失的仅为 07-08 单个提交的快照粒度。
- 07-13 stash 对象保留于 `F:\britney-pack-archaeology-20260829\`，如需考古可用 `git index-pack` 恢复。
- 教训：多 agent 接力的仓库必须有远端推送节奏（本仓库 07-08 后再未推送，裸奔 7 周）。
