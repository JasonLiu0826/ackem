export {
  assembleContext,
  formatContextSections,
  type AssembledContext,
  type AssembleContextOpts
} from './assemble.js'
export {
  loadProjectInstructions,
  expandIncludes,
  collectInstructionDirs,
  type InstructionSource
} from './projectInstructions.js'
export { getGitStatusBlock } from './gitStatus.js'
export {
  MAX_INSTRUCTION_FILE_CHARS,
  MAX_TOTAL_INSTRUCTIONS_CHARS,
  MAX_GIT_STATUS_CHARS
} from './constants.js'
