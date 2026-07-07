import type { DesktopAgentAction } from '../../shared/desktopAgent'

export const DESKTOP_AGENT_ACTION_LABELS: Record<DesktopAgentAction, string> = {
  list_folder: '鍒楀嚭鐩綍鍐呭',
  search_files: '鎼滅储鏂囦欢',
  stat_file: '鏌ョ湅鏂囦欢淇℃伅',
  grep_text: '鍦ㄧ洰褰曚腑鎼滅储鏂囨湰',
  read_text: '璇诲彇鏂囨湰鏂囦欢',
  read_document: '璇诲彇鏂囨。',
  read_image: '璇诲彇鍥剧墖',
  open_folder: '鎵撳紑鏂囦欢澶?,
  open_file: '鎵撳紑鏂囦欢',
  open_app: '鎵撳紑搴旂敤绋嬪簭',
  close_file: '鍏抽棴鏂囦欢绐楀彛',
  close_app: '鍏抽棴搴旂敤绋嬪簭',
  copy_path: '澶嶅埗',
  move_path: '绉诲姩鎴栭噸鍛藉悕',
  mkdir: '鏂板缓鏂囦欢澶?,
  write_text: '鍐欏叆鏂囨湰鏂囦欢',
  delete_path: '鍒犻櫎',
  download_file: '涓嬭浇鏂囦欢',
  download_and_install: '涓嬭浇骞跺畨瑁?,
  run_installer: '杩愯瀹夎鍖?,
  import_to_Ackem: '瀵煎叆鍒?Ackem',
  focus_app: '灏嗗簲鐢ㄥ甫鍒板墠鍙?
}

export const CLOSE_ACTIONS = new Set<DesktopAgentAction>(['close_file', 'close_app'])

export const APP_ACTIONS = new Set<DesktopAgentAction>([
  'open_app',
  'close_app',
  'close_file',
  'focus_app'
])

export const WRITE_ACTIONS = new Set<DesktopAgentAction>([
  'copy_path',
  'move_path',
  'mkdir',
  'write_text',
  'delete_path'
])

export const DOWNLOAD_ACTIONS = new Set<DesktopAgentAction>([
  'download_file',
  'download_and_install',
  'run_installer'
])

export const DOCUMENT_READ_ACTIONS = new Set<DesktopAgentAction>([
  'read_document',
  'read_image'
])

export function actionLabel(action: DesktopAgentAction): string {
  return DESKTOP_AGENT_ACTION_LABELS[action] ?? action
}
