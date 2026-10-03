import { clamp01 } from '../types'
export const offlinePressure=(hours:number,se:number,aff:number,aro:number)=>hours*(se/100)*clamp01((Math.abs(aff)+Math.abs(aro))/4)*.01
