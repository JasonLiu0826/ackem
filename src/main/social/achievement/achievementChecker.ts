import { unlockAchievement } from '../../db/repos/achievementsRepo'
import { ACHIEVEMENT_DEFS } from './achievementDefs'
export function checkAchievements(root:string,eventType:string){return ACHIEVEMENT_DEFS.filter(x=>x.eventType===eventType&&unlockAchievement(root,x.id)).map(x=>x.id)}
