export type Goal = {
  id:string; domainId:string; originalUserBasis:string; expectedOutcome:string; constraints:string[];
  state:'active'|'paused'|'completed'|'cancelled'|'abandoned'|'evidence_insufficient'|'revoked'; taskIds:string[]; version:number; nextCheckAt?:number;
  authorityRefs:string[]; evidenceIds:string[]; sourceVersions:Record<string,string>; budget:{maxRuns:number;expiresAt:number}; updatedAt:number
}
export type DecisionRecord = {
  id:string; actor:'user'|'ackem'|'system'; choice:string; basis:string; evidenceIds:string[];
  taskId:string; goalId?:string; domainId:string; goalRevision:number; policyRevision:number;
  sourceVersions:Record<string,string>; applicability:string; supersedes?:string; invalidatedAt?:number
}
export type Observation = {
  id:string; source:'task'|'system'|'time'; domainId:string; taskId:string; sequence:number;
  observedAt:number; expiresAt:number; evidenceIds:string[]; trust:'observed'|'claim'|'inference';
  sourceVersions:Record<string,string>;
  kind:string; value:string
}
export type StandingRule = {
  id:string; taskId:string; domainId:string; purpose:string; originalUserBasis:string;
  source:Observation['source']; filter:{kind:string;value?:string}; allowedActions:['resume_task'];
  maxRuns:number; maxDurationMs:number; maxContextTokens:number; maxModelCalls:number;
  maxCostUsd?:number; expiresAt:number; cooldownMs:number; evidenceIds:string[]; authorityRef:string;
  goalRevision:number; policyRevision:number; sourceVersions:Record<string,string>; revokedAt?:number
}
export type GoalGrantInput = Pick<Goal,'originalUserBasis'|'expectedOutcome'|'constraints'|'taskIds'|'budget'|'nextCheckAt'>
export type RuleGrantInput = Omit<StandingRule,'id'|'domainId'|'authorityRef'|'goalRevision'|'policyRevision'|'evidenceIds'|'sourceVersions'|'revokedAt'>
