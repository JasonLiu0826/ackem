export const SOCIAL={TICK_MS:60_000,MAX_POSTS_PER_AGENT_WINDOW:5,POST_WINDOW_MS:7_200_000,GLOBAL_POST_RATE:.15,MAX_POSTS_PER_TICK:2,FRIEND_TRUST_PASS:50,FRIEND_TRUST_SOFT:35,FRIEND_REJECT_COOLDOWN_MS:86_400_000,JEALOUSY_TRUST_GAP:25,JEALOUSY_CHAT_SHARE:.70,JEALOUSY_CHAT_N:20,SILENCE_HOURS_START:1,OFFLINE_MAX_EVENTS:5,GROUP_MAX_REPLIES:2,GROUP_FORM_TRUST:70,GROUP_FORM_SHARED_EVENTS:8,ACHIEVE_RARE_EVERY_N_TICKS:5} as const
export type ContentMode='template'|'llm'
export type SocialEmotion={aff:number;aro:number;valence?:number;label?:string}
export const clamp=(n:number,min=-1,max=1)=>Math.max(min,Math.min(max,n))
export const clamp01=(n:number)=>clamp(n,0,1)
export const socialId=(prefix='social')=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
