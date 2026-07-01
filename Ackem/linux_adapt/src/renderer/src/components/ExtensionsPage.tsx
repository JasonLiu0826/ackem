/** 扩展中心占位（插件库 / Skill / 工作区 — P1） */
export function ExtensionsPage(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-surface px-8">
      <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
        <p className="font-display text-lg text-ink">扩展中心</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          工作区、插件库与 Skill 库将在此统一呈现。当前版本请先使用设置中的模型配置与记忆导入。
        </p>
        <p className="mt-4 text-xs text-ink-muted/70">暖烬·光核 · 扩展 tab · P1</p>
      </div>
    </div>
  )
}
