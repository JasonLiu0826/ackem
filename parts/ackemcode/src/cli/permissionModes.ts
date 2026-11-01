import type {PermissionMode} from '../shared/types.js'

export const CLI_PERMISSION_MODES:PermissionMode[]=['default','sessionType','bypassPermissions']
export function cliPermissionMode(value?:string):PermissionMode {
 if(value===undefined)return 'default'
 if(!CLI_PERMISSION_MODES.includes(value as PermissionMode))throw Error('CLI 权限请选择 default、sessionType 或 bypassPermissions；自动允许编辑仅用于工作页。')
 return value as PermissionMode
}
