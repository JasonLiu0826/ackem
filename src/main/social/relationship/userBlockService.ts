import { getBlock,listBlocks,removeBlock,setBlock } from '../../db/repos/userBlocksRepo'
export const muteAgent=(r:string,id:string)=>setBlock(r,{user_id:'local',agent_id:id,block_type:'mute',created_at:new Date().toISOString()})
export const blockAgent=(r:string,id:string)=>setBlock(r,{user_id:'local',agent_id:id,block_type:'block',created_at:new Date().toISOString()})
export const unblockAgent=(r:string,id:string)=>removeBlock(r,id)
export const isMuted=(r:string,id:string)=>getBlock(r,id)?.block_type==='mute'
export const isBlocked=(r:string,id:string)=>getBlock(r,id)?.block_type==='block'
export {listBlocks}
