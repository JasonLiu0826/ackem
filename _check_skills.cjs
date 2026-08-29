const fs = require('fs');
let t = fs.readFileSync('src/main/extensions/coordinator.ts', 'utf-8');
// Just replace the specific string regardless of line endings
t = t.replace("} from './protocols'", "} from './skills/types'");
// But only for the import that has SkillInvocation/SkillResult
// Check if there are other imports from ./protocols that should stay
// The import block has DispatchCatalogEntry, EngineSnapshot, ExtensionEvent, SkillInvocation, SkillResult
// SkillInvocation and SkillResult are in skills/types, the rest are in protocols
// So we need to split the import
// Actually, let's check if skills/types re-exports them or if we need separate imports

// Check skills/types.ts for SkillInvocation/SkillResult
const st = fs.readFileSync('src/main/extensions/skills/types.ts', 'utf-8');
console.log('skills/types.ts has SkillInvocation:', st.includes('SkillInvocation'));
console.log('skills/types.ts has SkillResult:', st.includes('SkillResult'));

// If not in skills/types, check protocols.ts
const pt = fs.readFileSync('src/main/extensions/protocols.ts', 'utf-8');
console.log('protocols.ts has SkillInvocation:', pt.includes('SkillInvocation'));
console.log('protocols.ts has SkillResult:', pt.includes('SkillResult'));

// If they're in protocols.ts but not exported, we need to export them
if (pt.includes('SkillInvocation') && !pt.match(/export.*SkillInvocation/)) {
  console.log('SkillInvocation found in protocols.ts but not exported');
  // Check if it's a type definition
  const pl = pt.split(/\r?\n/);
  for (let i = 0; i < pl.length; i++) {
    if (pl[i].includes('SkillInvocation') || pl[i].includes('SkillResult')) {
      console.log('  ' + (i+1) + ': ' + pl[i]);
    }
  }
}
