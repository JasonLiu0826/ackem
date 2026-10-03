import { ConfirmDialog } from '../ConfirmDialog'

type Props = {
  open: boolean
  agentName: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteAgentDialog({ open, agentName, busy, onConfirm, onCancel }: Props): JSX.Element | null {
  return (
    <ConfirmDialog
      open={open}
      title={`删除「${agentName}」？`}
      confirmLabel={busy ? '删除中…' : '永久删除'}
      cancelLabel="取消"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        此操作不可恢复。将永久删除该角色的全部聊天记录、记忆、角色卡与头像文件，且无法找回。
        预制角色删除后不会在下次启动时自动恢复。
      </p>
      <p className="mt-2 text-ink-muted">
        若你只是想换人设，请使用「编辑」而非删除。
      </p>
    </ConfirmDialog>
  )
}
