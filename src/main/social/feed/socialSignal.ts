import { clamp } from '../types'
export type SocialSignalInput={aff:number;aro:number;se:number;sp?:number;so?:number;closeness?:number;resonance?:number}
export type SocialSignal={exposure:number;comparison:number;confirmation:number;silence:number;deltaAff:number;deltaAro:number}
/** Four pure phases: exposure, comparison, interaction confirmation, and silence. */
export function socialSignal(x:SocialSignalInput):SocialSignal{const closeness=x.closeness??.5,res=x.resonance??.5,se=x.se/100,sp=(x.sp??50)/100,so=(x.so??50)/100;const exposure=se*closeness;const comparison=(x.aff<0?1:-.35)*exposure*(1-so*.5);const confirmation=se*sp*closeness*res;const silence=(1-so)*Math.max(0,1-closeness)*.15;return{exposure,comparison,confirmation,silence,deltaAff:clamp(confirmation*.12-comparison*.1-silence*.08),deltaAro:clamp(exposure*.08+comparison*.12-silence*.05)}}
export const likeProbability=(se:number,closeness:number,resonance:number)=>Math.max(0,Math.min(1,se/100*closeness*resonance*.25))
export const commentProbability=(se:number,sp:number,closeness:number)=>Math.max(0,Math.min(1,se/100*sp/100*closeness*.5*.15))
