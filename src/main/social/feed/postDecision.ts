import { SOCIAL,clamp01 } from '../types'
export type PostDecisionInput={recentCount:number;se:number;aff:number;aro:number;rng?:number;jealous?:boolean}
export function postRate(x:PostDecisionInput){const intensity=clamp01((Math.abs(x.aff)+Math.abs(x.aro))/4);return (x.se/100)*intensity*SOCIAL.GLOBAL_POST_RATE*(x.jealous?1+.3*x.se/100:1)}
export function shouldPost(x:PostDecisionInput){return x.recentCount<SOCIAL.MAX_POSTS_PER_AGENT_WINDOW&&(x.rng??Math.random())<postRate(x)}
