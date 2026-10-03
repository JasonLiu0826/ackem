import { commentProbability,likeProbability } from './socialSignal'
export function decideInteraction(x:{se:number;sp:number;closeness:number;resonance:number;rng?:number}){const r=x.rng??Math.random();const like=likeProbability(x.se,x.closeness,x.resonance);const comment=commentProbability(x.se,x.sp,x.closeness);return {like:r<like,comment:r>=like&&r<like+comment,likeP:like,commentP:comment}}
