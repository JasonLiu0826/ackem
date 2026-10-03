export type RelationshipStage='STRANGER'|'FAMILIAR'|'INTIMATE'
export function stageForTrust(trust:number):RelationshipStage{return trust<30?'STRANGER':trust<=70?'FAMILIAR':'INTIMATE'}
export const stageWeight=(stage:RelationshipStage)=>stage==='STRANGER'?.5:stage==='INTIMATE'?1.2:1
