import { SOCIAL } from '../types'
export type TrustEntry={agentId:string;trust:number;se:number;so:number}
export function detectJealousy(entries:TrustEntry[],recentAgentIds:string[]){const sorted=[...entries].sort((a,b)=>b.trust-a.trust),fav=sorted[0];if(!fav)return[];const share=recentAgentIds.filter(x=>x===fav.agentId).length/Math.max(1,recentAgentIds.length);if(share<SOCIAL.JEALOUSY_CHAT_SHARE)return[];return sorted.slice(1).filter(x=>fav.trust-x.trust>=SOCIAL.JEALOUSY_TRUST_GAP).map(x=>({agentId:x.agentId,favoriteId:fav.agentId,mode:x.so>=60?'sour_post':x.so<20?'memory':'whisper'}))}
