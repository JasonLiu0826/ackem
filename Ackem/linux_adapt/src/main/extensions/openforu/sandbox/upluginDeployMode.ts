/** Plan / Agent 部署时 uplugin 实际运行方式（与 resolveUpluginHooks 双轨一致） */
export type UpluginRuntimeMode = 'worker' | 'inject'

export function getUpluginRuntimeMode(files: Record<string, string>): UpluginRuntimeMode {
  return files['main.ts']?.trim() ? 'worker' : 'inject'
}

export type UpluginDeployMessageInput = {
  extensionId: string
  dirName: string
  displayName: string
  dispatchMode: string
}

/** 部署中与部署成功后的用户可见文案 */
export function buildUpluginDeployCopy(
  runtimeMode: UpluginRuntimeMode,
  input: UpluginDeployMessageInput
): { deploying: string; successBody: string; notifyText: string } {
  const { extensionId, dirName, displayName, dispatchMode } = input

  if (runtimeMode === 'worker') {
    return {
      deploying: '⏳ **正在部署** uplugin（含 `main.ts`，将在 Worker 沙箱中加载）…',
      successBody: [
        '✅ **部署完成**（Worker 沙箱）',
        '',
        `- uplugin \`${extensionId}\``,
        `- 路径 \`data/openforu/uplugins/${dirName}/\``,
        `- 调度 mode: \`${dispatchMode}\``,
        '- 运行方式：`main.ts` 在隔离 Worker 中执行生命周期钩子（已通过静态安检）',
        '- 触发后由 `beforeUserMessage` 等钩子返回上下文，而非纯模板注入'
      ].join('\n'),
      notifyText: `✓ ${displayName} Plugin 已就绪（沙箱代码），可在聊天中通过关键词触发。`
    }
  }

  return {
    deploying: '⏳ **正在部署** uplugin（inject 模板，上下文注入）…',
    successBody: [
      '✅ **部署完成**（上下文注入）',
      '',
      `- uplugin \`${extensionId}\``,
      `- 路径 \`data/openforu/uplugins/${dirName}/\``,
      `- 调度 mode: \`${dispatchMode}\``,
      '- 运行方式：`plugin.meta.json` 的 injectTemplate → `beforeUserMessage` 注入',
      '- 说明：未包含 `main.ts`，不执行用户代码（与番茄钟等 Plan 模板一致）'
    ].join('\n'),
    notifyText: `✓ ${displayName} Plugin 已就绪，可在聊天中通过关键词触发（上下文注入）。`
  }
}

/** 写入磁盘时附带除 manifest / plugin.meta 外的 bundle 文件（如 main.ts、README） */
export function pickUpluginExtraDeployFiles(files: Record<string, string>): Record<string, string> {
  const extra: Record<string, string> = {}
  for (const [name, content] of Object.entries(files)) {
    if (name === 'manifest.json' || name === 'plugin.meta.json') continue
    extra[name] = content
  }
  return extra
}
