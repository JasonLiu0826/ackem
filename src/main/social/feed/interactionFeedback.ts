import { socialSignal } from './socialSignal'
export const interactionFeedback=(x:{aff:number;aro:number;se:number;sp?:number;so?:number;closeness?:number;resonance?:number})=>socialSignal(x)
