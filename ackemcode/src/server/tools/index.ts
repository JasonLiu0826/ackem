import fs from 'node:fs/promises'
import type {
  ToolDefinition,
  EffortLevel,
  PermissionRulesConfig,
  AgentEvent,
  PermissionMode
} from '../../shared/types.js'
import {
  ASK_USER_MAX_OPTIONS,
  ASK_USER_MAX_QUESTIONS,
  ASK_USER_MIN_OPTIONS,
  ASK_USER_TOOL_DESCRIPTION,
  formatAskUserToolResult,
  formatExitPlanApprovedOutput,
  formatExitPlanRejectedOutput
} from '../../shared/planInterview.js'
import type { LoadedSkill } from '../skills/loadSkills.js'
import {
  findSkill,
  formatSkillsListing,
  invokeSkillByName
} from '../skills/loadSkills.js'
import {
  installSkillFromSpec,
  parseInstallSpec,
  uninstallSkill,
  type InstallScope
} from '../skills/installSkill.js'
import { runWebFetch, discoverSkillInstallSpecs } from './webFetch/index.js'
import {
  isWebSearchEnabled,
  runWebSearch,
  webSearchToolDescription,
  type WebSearchSettings
} from './webSearch/index.js'
import type {
  InteractionBroker,
  AskUserQuestion,
  AskUserAnswerPayload,
  PlanDecisionPayload
} from '../agent/interactions.js'
import { nanoid } from 'nanoid'
import {
  applyTodoWrite,
  formatTodos,
  normalizeTodos,
  type TodoItem
} from '../agent/todos.js'
import type { PermissionBroker } from '../agent/permissions.js'
import { isMcpToolName, mcpManager } from '../mcp/index.js'
import {
  applyBrowserOnboardingChoice,
  manageMcp,
  type ManageMcpAction
} from '../agent/mcpManage.js'
import {
  createBrowserOnboardingRequestId,
  waitBrowserOnboardingChoice
} from '../mcp/browserOnboardingBroker.js'
import {
  isPlaywrightMcpToolName,
  truncatePlaywrightSnapshot
} from '../mcp/snapshotBudget.js'
import {
  createReadFileState,
  globTool,
  grepTool,
  readFileTool,
  resolveFileToolPath,
  searchReplaceTool,
  writeFileTool,
  type ReadFileState
} from './files/index.js'
import type { ToolMediaPart } from './files/types.js'
import { resolveModelMedia } from '../llm/capabilities.js'
import { runShellTool } from './shell/index.js'
import { notebookEditTool } from './notebook/notebookEdit.js'
import {
  attachOutsourcedWorktreeSession,
  cleanupWorktree,
  countWorktreeChanges,
  createWorktreeForSession,
  enterWorktreeMessage,
  hasWorktreeCreateHooks,
  hasWorktreeRemoveHooks,
  keepWorktree,
  type WorktreeSession,
  validateWorktreeSlug
} from './worktree/worktree.js'
import {
  createAgentWorktree,
  parseIsolationMode,
  restoreIsolationWorktree,
  settleAgentWorktree
} from './worktree/agentIsolation.js'
import { isCronEnabled, type SessionCronStore } from './cron/cronStore.js'
import { lspManager } from '../lsp/manager.js'
import { runHooks, type HooksConfig } from '../hooks/index.js'
import { openPathTool, openUrlTool } from './openExternalTool.js'
import { documentConvertTool, documentEditTool } from './files/documents/documentTools.js'

export type { WorktreeSession }

export interface ToolContext {
  cwd: string
  /** Mutate session cwd (Enter/Exit Worktree). May be async (GM-WT settles hooks/permissions). */
  setCwd: (cwd: string) => void | Promise<void>
  getWorktree: () => WorktreeSession | null
  setWorktree: (session: WorktreeSession | null) => void
  getCron?: () => SessionCronStore
  sessionId?: string
  skills?: LoadedSkill[]
  llm?: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort: EffortLevel
  }
  /** settings.multimodal / ACKEM_MULTIMODAL — auto|off|vision */
  multimodal?: import('../../shared/types.js').AckemCodeSettings['multimodal']
  signal?: AbortSignal
  getMode: () => PermissionMode
  setMode: (mode: PermissionMode) => void
  interactions: InteractionBroker
  permissions: PermissionBroker
  /** CC additionalWorkingDirectories (also on PermissionBroker). */
  additionalWorkingDirectories?: string[]
  permissionRules?: PermissionRulesConfig
  /** Session-scoped read tracking for read-before-write (CC readFileState). */
  readFileState?: ReadFileState
  /** Auto-memory dir carve-out for Read/Write/Edit (CC isAutoMemPath). */
  memoryDir?: string | null
  noteMemoryWrite?: () => void
  /**
   * S06: backup BEFORE Write/Edit/NotebookEdit mutate (CC fileHistoryTrackEdit).
   */
  trackFileEdit?: (absPath: string) => void | Promise<void>
  /** S02 web_search provider settings */
  webSearch?: WebSearchSettings
  /** S08: default verify shell command from settings. */
  verifyCommand?: string
  /** Hooks config for SubagentStart/Stop (S03.1). */
  hooks?: import('../../shared/types.js').AckemCodeSettings['hooks']
  disableAllHooks?: boolean
  /** Auto-mode classifier customization (inherited by sub-agents). */
  autoMode?: import('../../shared/types.js').AckemCodeSettings['autoMode']
  /** Turn abort controller — sub-agent user deny bubbles here (CC query abort). */
  parentAbortController?: AbortController
  /** S08: record last verify evidence for W3. */
  noteVerifyEvidence?: (ev: import('../agent/verification.js').VerifyEvidence) => void
  /** R10: record last plan-execution verify evidence for W3 delivery gate. */
  notePlanVerifyEvidence?: (
    ev: import('../agent/verification.js').VerifyEvidence
  ) => void
  /**
   * S09: nesting depth of the *current* agent (0 = main). Children run at depth+1;
   * spawning when depth ≥ MAX_AGENT_DEPTH is rejected.
   */
  agentDepth?: number
  /** S09: session sidechain registry for resume-by-agentId */
  agentRegistry?: import('../agent/agentRegistry.js').AgentRegistry
  /** §5.3 #11: background / async agent hub */
  backgroundAgents?: import('../agent/backgroundAgents.js').BackgroundAgentHub
  /** §5.3 #11: session queue (main + scoped sub-agent notifications). */
  messageQueue?: import('../agent/messageQueue.js').SessionMessageQueue
  /** Current runner agent id (undefined = main session). */
  currentAgentId?: string
  /** §5.3 #11: enqueue task-notification into session queue */
  enqueueTaskNotification?: (text: string) => void
  /** Optional tool_use id for notification bookkeeping */
  currentToolUseId?: string
  /** S09: parent/current conversation for fork prefix inheritance */
  getParentMessages?: () => import('../../shared/types.js').ChatMessage[]
  /** S09: rendered system prompt for fork cache-prefix parity */
  parentSystemPrompt?: string
  /** S09: true when current runner is a fork child (recursive-fork guard) */
  isForkChild?: boolean
  /** S10: session Task v2 store (CC Task* tools). */
  taskStore?: import('../agent/tasks.js').TaskStore
  /** Batch 8: remove messages from live session context (History snip). */
  snipContextMessages?: (
    messageIds: string[]
  ) => Promise<{ ok: boolean; output: string }>
  /** S10 PlanV2: effective parallel Explore count (tier-aware). */
  planExploreAgents?: number
  /** Agents bar tier — solo hides agent tool at main session. */
  agentTier?: import('../../shared/types.js').AgentTier
  /** S10: Explore agents launched since enter_plan_mode. */
  getPlanExploreCount?: () => number
  notePlanExplore?: (focus?: string) => void
  resetPlanExplore?: () => void
  /** Distinct Explore foci this plan session (for multi-view soft tips). */
  getPlanExploreFoci?: () => string[]
  /** Plan file on disk (CC ~/.claude/plans). */
  getPlanFilePath?: () => string | null
  planModeInterviewPhase?: boolean
  plansDirectory?: string
  getPrePlanMode?: () => PermissionMode | null
  onEnterPlanMode?: (fromMode: PermissionMode) => void | Promise<string | void>
  onExitPlanModeApproved?: (
    nextMode: PermissionMode,
    opts?: { allowedPrompts?: Array<{ tool: string; prompt: string }> }
  ) => void | Promise<void>
  onExitPlanModeRejected?: (
    kind: 'keep_planning' | 'exit_to_default'
  ) => void | Promise<void>
  onPlanFileUpdated?: (planFilePath: string, chars: number) => void
  emit: (event: AgentEvent) => void
  getTodos: () => TodoItem[]
  setTodos: (todos: TodoItem[]) => void
}

export interface ToolResult {
  ok: boolean
  output: string
  media?: ToolMediaPart[]
}

export { createReadFileState, type ReadFileState, type ToolMediaPart }

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a file under the working directory (cat -n style). Always extracts text from PDF / Word (.docx) / PowerPoint (.pptx) / Excel (.xlsx). For PDFs use pages (e.g. "1-5", max 20); default is the first 10 pages. Vision/multimodal models also receive page images (or a native PDF on Anthropic). png/jpg/gif/webp attach as images only for vision models. Also allowed under the auto-memory directory. Use offset/limit for large extracts (max ~256KB without limit for plain text).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path relative to cwd, absolute under cwd, or absolute under auto-memory'
          },
          offset: { type: 'integer', description: '1-based start line (optional, default 1)' },
          limit: { type: 'integer', description: 'Max lines to return (optional)' },
          pages: {
            type: 'string',
            description:
              'PDF page range only: "1-5", "3", or "10-20" (1-indexed, max 20 pages per read)'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or overwrite a text file under cwd (or absolute path under auto-memory). Prefer search_replace on existing files; write_file only for new files or a true whole-file rewrite. Existing files must be read first in this session (read-before-write). Never write secrets to memory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description:
        'Exact string replace (CC FileEdit). File must be read first. Prefer the smallest unique old_string (often 2–4 lines); do not paste read_file line-number prefixes. Fails if not found or not unique unless replace_all=true. Use replace_all to rename a symbol across the file. Auto-memory paths allowed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean', description: 'Replace every match (default false)' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files by glob pattern. Default max 100 results (truncated note if more).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'Optional search root under cwd' },
          head_limit: {
            type: 'integer',
            description: 'Max results (default 100; 0 = soft unlimited)'
          }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        'Search file contents with regex (prefer this over bash/rg). Omit glob to search the whole project under path (default cwd); pass glob to narrow. Uses ripgrep when available. output_mode: content | files_with_matches | count. Default head_limit 250 (0=unlimited).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'Optional root under cwd' },
          glob: {
            type: 'string',
            description: 'Optional file glob filter; omit to search all text files'
          },
          output_mode: {
            type: 'string',
            description: 'content | files_with_matches | count (default content)'
          },
          case_insensitive: { type: 'boolean' },
          '-i': { type: 'boolean', description: 'Case insensitive (alias)' },
          '-A': { type: 'integer', description: 'Lines after match (content mode)' },
          '-B': { type: 'integer', description: 'Lines before match (content mode)' },
          '-C': { type: 'integer', description: 'Context lines before and after (content mode)' },
          context: { type: 'integer', description: 'Alias for -C' },
          type: {
            type: 'string',
            description: 'File type filter (rg --type), e.g. java, ts, py'
          },
          multiline: {
            type: 'boolean',
            description: 'Multiline regex (. matches newline)'
          },
          head_limit: { type: 'integer', description: 'Default 250; 0 = unlimited' },
          offset: { type: 'integer', description: 'Skip first N hits (default 0)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'powershell',
      description:
        'Preferred shell on Windows. Run a PowerShell command in cwd (-NoProfile -NonInteractive). Default timeout 120s (max 600s). Use this instead of bash unless the user explicitly asks for bash/Git Bash/WSL. When settings.sandbox.enabled, runs inside OS sandbox (ASRT). Output capped ~30k chars.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout_ms: {
            type: 'integer',
            description: 'Timeout in ms (default 120000, max 600000)'
          },
          description: { type: 'string', description: 'Short active-voice summary (optional)' },
          dangerouslyDisableSandbox: {
            type: 'boolean',
            description:
              'Escape OS sandbox for this command (only if settings.sandbox.allowUnsandboxedCommands). Prefer keeping sandbox on.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Run a bash command in cwd. Default timeout 120s (max 600s). On Windows, do not use this first — prefer the powershell tool. Only use bash if the user explicitly wants bash, Git Bash, or WSL. When settings.sandbox.enabled, runs inside OS sandbox (ASRT). Output capped ~30k chars.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout_ms: {
            type: 'integer',
            description: 'Timeout in ms (default 120000, max 600000)'
          },
          description: { type: 'string', description: 'Short active-voice summary (optional)' },
          dangerouslyDisableSandbox: {
            type: 'boolean',
            description:
              'Escape OS sandbox for this command (only if settings.sandbox.allowUnsandboxedCommands). Prefer keeping sandbox on.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List entries in a directory under cwd.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path, default .' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_snapshot',
      description:
        'Read-only git workspace snapshot: branch, short status, unstaged/staged diff --stat. Use before commit/PR or when claiming work is done. Optional patch_path for a single-file unstaged diff (size-capped). Does not mutate git state.',
      parameters: {
        type: 'object',
        properties: {
          include_stat: {
            type: 'boolean',
            description: 'Include diff --stat sections (default true)'
          },
          patch_path: {
            type: 'string',
            description: 'Optional repo-relative file for a small unstaged patch preview'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Fetch a URL (HTML→markdown). Optional prompt extracts/summarizes content. Use for docs/intro pages; then install_skill with discovered GitHub/zip/SKILL.md links. Cross-host redirects are reported — call again with the new URL. Prefer web_search first when you do not know the URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Fully-formed http(s) URL' },
          prompt: {
            type: 'string',
            description: 'What to extract from the page (default: summary + skill install links)'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: webSearchToolDescription(),
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (min 2 chars). Include current year for recent docs.'
          },
          allowed_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only include these hosts (mutually exclusive with blocked_domains)'
          },
          blocked_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exclude these hosts (mutually exclusive with allowed_domains)'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_path',
      description:
        'Open a local file or folder with the user\'s default OS app (Word, WPS, Typora, Notepad, Explorer, Preview, etc.). Use when the user asks to open/show/launch a path. Do not use this to read file contents (use read_file). Refuses executables (.exe/.bat/.ps1/…). Absolute paths, ~, and paths relative to cwd are allowed.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Local file or folder path (absolute, ~, or relative to cwd)'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'document_edit',
      description:
        'Edit an existing Office file: Word .docx/.doc, Excel .xlsx/.xls, PowerPoint .pptx. Ops: replace (keeps styles/tables; use for placeholders like {{NAME}}), append (new unstyled paragraphs), rewrite (DESTROYS body layout — last resort), set_cell (Excel A1). Optional `to` writes a copy so the template stays intact. Do not use write_file on Office binaries. To mint a new file from a template: path=template, to=new.docx, op=replace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Office file path (cwd-relative or absolute)' },
          op: {
            type: 'string',
            enum: ['replace', 'append', 'rewrite', 'set_cell'],
            description: 'replace (keep format) | append | rewrite (wipes layout) | set_cell'
          },
          find: { type: 'string', description: 'Text to find (replace)' },
          replace: { type: 'string', description: 'Replacement text (replace)' },
          all: { type: 'boolean', description: 'Replace all matches (default true)' },
          text: { type: 'string', description: 'New/appended body text (append/rewrite)' },
          cell: { type: 'string', description: 'Excel cell like A1 (set_cell)' },
          value: { type: 'string', description: 'Excel cell value (set_cell)' },
          sheet: { type: 'string', description: 'Excel sheet name (optional)' },
          to: {
            type: 'string',
            description: 'Optional output path. If set, copy first then edit the copy (template-safe).'
          }
        },
        required: ['path', 'op']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'document_convert',
      description:
        'Convert markdown/txt/html (or an existing .docx) into a new .docx or .pdf. Tries pandoc, then Windows Word/WPS COM, then a simple unstyled docx fallback. Optional `template` is a .docx passed to pandoc --reference-doc (page/heading styles). For an existing filled template, prefer document_edit replace + to. PDF in-place pretty edit is not supported.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Source path (.md .txt .html .docx)' },
          format: { type: 'string', enum: ['docx', 'pdf'], description: 'Output format (default docx)' },
          to: { type: 'string', description: 'Optional output path; default is same stem + new ext' },
          template: {
            type: 'string',
            description: 'Optional reference .docx (pandoc --reference-doc) for heading/page styles'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description:
        'Open an http(s) URL in the user\'s default browser and show the page. Use when the user asks to open/visit a webpage or pastes a URL to open. Do not use web_fetch just to display a page. Only http and https.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Fully-formed http(s) URL'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: ASK_USER_TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: '1–4 questions. Do not include an Other option; the host adds it.',
            items: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'Full question ending with ?'
                },
                header: {
                  type: 'string',
                  description: 'Short chip label (max ~12 chars), e.g. Auth, Store'
                },
                options: {
                  type: 'array',
                  description: '2–4 mutually exclusive choices (unless multiSelect)',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: '1–5 words' },
                      description: {
                        type: 'string',
                        description: 'What this choice means / trade-off'
                      },
                      preview: {
                        type: 'string',
                        description:
                          'Optional markdown mockup or snippet shown when this option is focused'
                      }
                    },
                    required: ['label']
                  }
                },
                multiSelect: {
                  type: 'boolean',
                  description: 'Allow selecting several options'
                }
              },
              required: ['question', 'options']
            }
          }
        },
        required: ['questions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enter_plan_mode',
      description:
        'Request user consent to enter plan mode. Use for non-trivial implementation: new features, multiple approaches, multi-file changes, or unclear requirements. Skip for typos and obvious small fixes. In auto mode, only use when the user explicitly asked to plan. User can also enter plan via Shift+Tab without this tool.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'exit_plan_mode',
      description:
        'Submit plan for user approval and exit plan mode. Present markdown plan; do not ask for approval in chat text. On approve, implementation may begin. Prefer Explore/Plan agents first; soft gate on Explore count unless force=true for trivial plans. Plan body may be omitted when a plan file exists on disk.',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'string',
            description:
              'Markdown plan (optional if plan file on disk — disk is used as fallback)'
          },
          force: {
            type: 'boolean',
            description:
              'Skip PlanV2 Explore-count soft gate (trivial typo/single-file plans only)'
          },
          allowedPrompts: {
            type: 'array',
            description:
              'Semantic bash permissions needed to implement the plan (CC allowedPrompts)',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', enum: ['bash', 'Bash'] },
                prompt: {
                  type: 'string',
                  description: 'e.g. "run tests", "install dependencies"'
                }
              },
              required: ['tool', 'prompt']
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'todo_write',
      description:
        'Replace the session todo checklist. Use for multi-step tasks. Each item: content, status (pending|in_progress|completed), activeForm (present continuous). Exactly one item should be in_progress when working. When all are completed, the list clears.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed']
                },
                activeForm: {
                  type: 'string',
                  description: 'Present continuous, e.g. "Editing login page"'
                }
              },
              required: ['content', 'status', 'activeForm']
            }
          }
        },
        required: ['todos']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_create',
      description:
        'Create a durable Task v2 item. Unlike todo_write, tasks keep stable ids and are NOT cleared when all completed. Use for multi-step / long-lived work.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Brief title' },
          description: { type: 'string', description: 'What needs to be done' },
          activeForm: {
            type: 'string',
            description: 'Present continuous for spinner, e.g. "Running tests"'
          },
          metadata: {
            type: 'object',
            description: 'Optional arbitrary metadata object'
          }
        },
        required: ['subject', 'description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_get',
      description: 'Get a Task v2 item by id.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task id' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_update',
      description:
        'Update a Task v2 item: status, subject, deps (addBlocks/addBlockedBy), owner, metadata. status=deleted removes the task. Completing all tasks does not clear the list. Cannot set in_progress/completed while open blockers remain; dependency cycles are rejected.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          subject: { type: 'string' },
          description: { type: 'string' },
          activeForm: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'deleted']
          },
          owner: { type: 'string' },
          addBlocks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Task ids that this task blocks'
          },
          addBlockedBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Task ids that block this task'
          },
          metadata: {
            type: 'object',
            description: 'Merge keys; set a key to null to delete'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_list',
      description:
        'List Task v2 items. blockedBy omits already-completed blockers.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'context_snip',
      description:
        'Remove specific prior messages from the session context by message id (History snip). Does not rewind files. Use when old read/search output is stale noise. Cannot remove system messages or the latest user prompt.',
      parameters: {
        type: 'object',
        properties: {
          message_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Stable message ids to remove (assistant/tool/user).'
          }
        },
        required: ['message_ids']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent',
      description:
        'Dispatch a sub-agent. Omit subagent_type (or use fork) to fork: child inherits parent conversation prefix. Pass agentId to resume a prior sidechain. Prefer Explore for codebase search (read-only; concurrency-safe — launch several in one turn with distinct focus for Plan multi-view). Prefer Plan for design synthesis with a design lens (read-only; concurrency-safe). Use general-purpose for multi-step edits. Use verification before claiming delivery (VERDICT). Custom agents from .claude/agents/*.md by name. Nesting depth ≥2 is rejected. Set run_in_background=true to detach (prefer foreground parallel Explores/Plans in Plan mode).',
      parameters: {
        type: 'object',
        properties: {
          subagent_type: {
            type: 'string',
            description:
              'Optional. Omit or "fork" = inherit parent context. Else: Explore | Plan | general-purpose | verification | custom agent name'
          },
          agentId: {
            type: 'string',
            description:
              'Resume a previous sub-agent by id (same sidechain transcript). When set, continues that agent.'
          },
          description: {
            type: 'string',
            description: 'Short label for UI (3–8 words)'
          },
          prompt: {
            type: 'string',
            description: 'Full task instructions (or resume continuation) for the sub-agent'
          },
          thoroughness: {
            type: 'string',
            enum: ['quick', 'medium', 'very thorough'],
            description: 'Explore/Plan/verification: how deep (default medium)'
          },
          focus: {
            type: 'string',
            description:
              'Plan multi-view: distinct lens for this Explore (e.g. "tests and edge cases") or design lens for Plan (e.g. "simplicity / minimal diff"). Prepended to the prompt. Prefer different focus values when launching several agents in one turn.'
          },
          run_in_background: {
            type: 'boolean',
            description:
              'If true, start the sub-agent asynchronously and return agentId immediately. Completion is delivered as a task-notification (XML) on the main session queue. Independent of parent abort. For PlanV2 Phase 1 prefer foreground parallel Explores (omit this) so results land before design. Use agent_stop / agent_output to cancel or retrieve output.'
          },
          isolation: {
            type: 'string',
            enum: ['none', 'worktree'],
            description:
              'Spawn-time isolation. "worktree" creates a git worktree and runs the child there so it cannot clobber the main tree. Default none. Explore/verification usually omit this. Sub-agents never get enter/exit_worktree tools.'
          }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_stop',
      description:
        'Stop a running background agent by id. Alias fields: task_id or agent_id. Fails if missing / not running. Completion still arrives as task-notification (killed).',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'Background agent id (from agent run_in_background result)'
          },
          agent_id: {
            type: 'string',
            description: 'Alias for task_id'
          },
          shell_id: {
            type: 'string',
            description: 'Deprecated KillShell compat alias for task_id'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_output',
      description:
        'Retrieve output/status from a background agent. block=true (default) waits up to timeout_ms; block=false returns current state (not_ready while running). Prefer this when you need the report without waiting for the idle task-notification pump.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'Background agent id'
          },
          agent_id: {
            type: 'string',
            description: 'Alias for task_id'
          },
          block: {
            type: 'boolean',
            description: 'Wait for completion (default true)'
          },
          timeout_ms: {
            type: 'number',
            description: 'Max wait in ms when block=true (default 30000, max 600000)'
          }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_delivery',
        description:
        'GM-VERIFY delivery gate: run verifyCommand (or override) and/or auto-discover package.json test/lint/build scripts; return VERDICT PASS/FAIL/PARTIAL. FAIL/PARTIAL must not be treated as delivered. Prefer agent subagent_type=verification for deeper multi-strategy adversarial checks.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'Optional shell command override (default: settings.verifyCommand)'
          },
          reason: {
            type: 'string',
            description: 'Why verification is running (for the report)'
          },
          autoDiscover: {
            type: 'boolean',
            description:
              'Also run discoverable package.json test/lint/build scripts (default true when command empty)'
          },
          taskSummary: {
            type: 'string',
            description: 'Original task summary — selects verify strategies'
          },
          changedFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Changed file paths — selects verify strategies'
          },
          strategies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional strategy ids: baseline|frontend|backend_api|cli|infra|bugfix|library|refactor|adversarial'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_plan_execution',
      description:
        'R10 plan-acceptance gate: compare session tasks (or an explicit markdown checklist) against delivery evidence item-by-item (PASS/FAIL/PARTIAL). When a plan/tasks exist, W3 delivery requires this PASS in addition to verify_delivery. Frontend strategy with browser MCP requires interaction/screenshot evidence; without browser → PARTIAL (never fake PASS).',
      parameters: {
        type: 'object',
        properties: {
          planMarkdown: {
            type: 'string',
            description:
              'Optional markdown checklist (- [ ] / - [x]). Defaults to session TaskStore items when omitted.'
          },
          changedFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Changed file paths used as evidence + strategy selection'
          },
          taskSummary: {
            type: 'string',
            description: 'Task summary for strategy selection'
          },
          strategies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional strategy ids (same as verify_delivery)'
          },
          browserEvidencePresent: {
            type: 'boolean',
            description:
              'Set true when this turn already collected browser interaction/screenshot evidence'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'install_skill',
      description:
        'Download and install a skill into Ackem (~/.ackemcode/skills or project .ackemcode/skills). Specs: owner/repo, GitHub URL, zip URL, SKILL.md URL, local path, OR an intro/docs page URL (will web-discover install links). For multi-skill repos pass skillName. After install, use invoke_skill with the returned invoke name (frontmatter) or folder name.',
      parameters: {
        type: 'object',
        properties: {
          spec: {
            type: 'string',
            description: 'GitHub owner/repo, URL, zip, SKILL.md, local path, or docs/intro page URL'
          },
          skillName: {
            type: 'string',
            description: 'When the repo/page has many skills, which folder to install'
          },
          scope: {
            type: 'string',
            enum: ['user', 'project'],
            description: 'user = ~/.ackemcode/skills (default); project = {cwd}/.ackemcode/skills'
          }
        },
        required: ['spec']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description:
        'List installed skills (name, optional folder alias, source). Prefer this before invoke_skill when unsure what is installed.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'uninstall_skill',
      description:
        'Remove an Ackem-installed skill from ~/.ackemcode/skills or project .ackemcode/skills (by frontmatter name or folder name). Does not delete agents/claude/extra roots.',
      parameters: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            description: 'Skill name (frontmatter or folder)'
          },
          scope: {
            type: 'string',
            enum: ['user', 'project', 'auto'],
            description: 'Where to look (default auto = user then project)'
          }
        },
        required: ['skill']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'invoke_skill',
      description:
        'Load an installed skill (skill-name/SKILL.md) into context and follow it. Name may be frontmatter name or folder name.',
      parameters: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            description: 'Skill name (frontmatter or folder), e.g. "commit" or "docx"'
          },
          args: {
            type: 'string',
            description: 'Optional arguments substituted for $ARGUMENTS / $0 in the skill body'
          }
        },
        required: ['skill']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_mcp_resources',
      description:
        'List resources from connected MCP servers. Optional server filter.',
      parameters: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description: 'MCP server name (optional)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_mcp_resource',
      description: 'Read a resource URI from a connected MCP server.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP server name' },
          uri: { type: 'string', description: 'Resource URI' }
        },
        required: ['server', 'uri']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'notebook_edit',
      description:
        'Edit a Jupyter notebook (.ipynb) cell: replace, insert, or delete. Read the notebook first (read-before-write). cell_id can be the cell UUID or cell-N index.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'Path to .ipynb under cwd'
          },
          cell_id: {
            type: 'string',
            description:
              'Cell id (or cell-N). Required for replace/delete. For insert: insert after this cell (or at start if omitted).'
          },
          new_source: {
            type: 'string',
            description: 'New cell source (ignored for delete; may be empty)'
          },
          cell_type: {
            type: 'string',
            enum: ['code', 'markdown'],
            description: 'Required for insert; optional for replace'
          },
          edit_mode: {
            type: 'string',
            enum: ['replace', 'insert', 'delete'],
            description: 'Defaults to replace'
          }
        },
        required: ['notebook_path', 'new_source']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enter_worktree',
      description:
        'Create an isolated git worktree under .ackemcode/worktrees and switch the session cwd into it.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Optional worktree slug (letters/digits/._- per segment, max 64). Random if omitted.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'exit_worktree',
      description:
        'Leave a worktree created by enter_worktree in this session. action=keep preserves the tree; action=remove deletes it (needs discard_changes if dirty).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['keep', 'remove'],
            description: 'keep leaves worktree on disk; remove deletes worktree + branch'
          },
          discard_changes: {
            type: 'boolean',
            description: 'Required true to remove when there are uncommitted files or commits'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cron_create',
      description:
        'Schedule a prompt on a 5-field cron (local time). Default is session-only (dies with process). Set durable=true to persist across restarts (~/.ackemcode/scheduled_tasks.json). recurring default true; false = one-shot.',
      parameters: {
        type: 'object',
        properties: {
          cron: {
            type: 'string',
            description: 'M H DoM Mon DoW, e.g. "*/5 * * * *" or "30 14 * * 1"'
          },
          prompt: { type: 'string', description: 'Prompt to enqueue when due' },
          recurring: {
            type: 'boolean',
            description: 'true (default) until deleted/expired; false = fire once'
          },
          durable: {
            type: 'boolean',
            description:
              'When true, persist the job across process restarts (R9 durable cron). Default false = session-only.'
          }
        },
        required: ['cron', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cron_delete',
      description: 'Cancel a session cron job by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cron_list',
      description:
        'List cron jobs (schedule, next fire, lastFired, fireCount, durable). Includes session-only and durable jobs loaded from disk.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lsp',
      description:
        'Language Server ops (goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls). Enabled when settings.lspServers is configured (ACKEM_ENABLE_LSP no longer required; set to 0 to force off).',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'goToDefinition',
              'findReferences',
              'hover',
              'documentSymbol',
              'workspaceSymbol',
              'goToImplementation',
              'prepareCallHierarchy',
              'incomingCalls',
              'outgoingCalls'
            ]
          },
          filePath: { type: 'string' },
          line: { type: 'integer', description: '1-based line' },
          character: { type: 'integer', description: '1-based character' },
          query: {
            type: 'string',
            description: 'Optional workspaceSymbol query (defaults to file basename)'
          }
        },
        required: ['operation', 'filePath', 'line', 'character']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tool_search',
      description:
        'GM-CORE: when many MCP/tools are deferred, search deferred tools by name/description and unlock matches for later turns.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Substring match against deferred tool names and descriptions'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_mcp',
      description:
        'List or change MCP servers in settings (enable/disable/add/remove/reconnect/auth). Required when the user asks to turn an MCP on or off — do not pretend.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'enable', 'disable', 'add', 'remove', 'reconnect', 'auth']
          },
          name: { type: 'string', description: 'Server name' },
          command: { type: 'string', description: 'stdio command (add)' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'stdio args (add)'
          },
          url: { type: 'string', description: 'http/sse URL (add)' },
          type: { type: 'string', enum: ['stdio', 'http', 'sse'] }
        },
        required: ['action']
      }
    }
  }
]

/** Tools gated off when env/settings disable them (CC isEnabled spirit). */
export function filterEnabledTools(defs: ToolDefinition[]): ToolDefinition[] {
  return defs.filter((d) => {
    const n = d.function.name
    if (n.startsWith('cron_') && !isCronEnabled()) return false
    // S12: use manager (servers configured) not env-only
    if (n === 'lsp' && !lspManager.isEnabled()) return false
    if (n === 'web_search' && !isWebSearchEnabled()) return false
    return true
  })
}

async function listDirTool(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> {
  if (ctx.signal?.aborted) {
    return {
      ok: false,
      output:
        ctx.signal.reason === 'sibling_error'
          ? 'Cancelled: parallel tool call sibling errored'
          : ctx.signal.reason === 'streaming_fallback'
            ? 'Error: Streaming fallback - tool execution discarded'
            : 'Tool execution aborted by user.'
    }
  }
  const rel = String(input.path ?? '.')
  let abs: string
  try {
    abs = resolveFileToolPath(ctx.cwd, rel, {
      additionalWorkingDirectories: ctx.additionalWorkingDirectories
    })
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
  const entries = await fs.readdir(abs, { withFileTypes: true })
  const lines = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
  return { ok: true, output: lines.join('\n') || '(empty)' }
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext
): Promise<ToolResult> {
  let input: Record<string, unknown> = {}
  try {
    input = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return { ok: false, output: 'Invalid JSON arguments' }
  }

  /** GM-WT: await async setCwd so CwdChanged + permissions settle mid-turn. */
  const settleCwd = async (next: string) => {
    await Promise.resolve(ctx.setCwd(next))
  }

  try {
    switch (name) {
      case 'read_file':
        return await readFileTool(
          ctx.cwd,
          input,
          ctx.readFileState,
          ctx.memoryDir,
          ctx.signal,
          resolveModelMedia({
            model: ctx.llm?.model,
            apiBaseUrl: ctx.llm?.apiBaseUrl,
            multimodal: ctx.multimodal
          }),
          ctx.additionalWorkingDirectories
        )
      case 'write_file':
        return await writeFileTool(ctx.cwd, input, ctx.readFileState, {
          additionalWorkingDirectories: ctx.additionalWorkingDirectories,
          memoryDir: ctx.memoryDir,
          onMemoryWrite: ctx.noteMemoryWrite,
          signal: ctx.signal,
          trackFileEdit: ctx.trackFileEdit
        })
      case 'search_replace':
        return await searchReplaceTool(ctx.cwd, input, ctx.readFileState, {
          additionalWorkingDirectories: ctx.additionalWorkingDirectories,
          memoryDir: ctx.memoryDir,
          onMemoryWrite: ctx.noteMemoryWrite,
          signal: ctx.signal,
          trackFileEdit: ctx.trackFileEdit
        })
      case 'notebook_edit':
        return await notebookEditTool(ctx.cwd, input, ctx.readFileState, {
          additionalWorkingDirectories: ctx.additionalWorkingDirectories,
          trackFileEdit: ctx.trackFileEdit
        })
      case 'glob':
        return await globTool(
          ctx.cwd,
          input,
          ctx.signal,
          ctx.additionalWorkingDirectories
        )
      case 'grep':
        return await grepTool(
          ctx.cwd,
          input,
          ctx.signal,
          ctx.additionalWorkingDirectories
        )
      case 'bash':
        return await runShellTool(ctx.cwd, input, 'bash', ctx.signal)
      case 'powershell':
        return await runShellTool(ctx.cwd, input, 'powershell', ctx.signal)
      case 'list_dir':
        return await listDirTool(ctx, input)
      case 'git_snapshot': {
        const { runGitSnapshot } = await import('./git/gitSnapshotCore.js')
        const r = await runGitSnapshot({
          cwd: ctx.cwd,
          includeStat: input.include_stat !== false,
          patchPath:
            typeof input.patch_path === 'string' ? input.patch_path : undefined,
          signal: ctx.signal
        })
        return { ok: r.ok, output: r.output }
      }
      case 'web_fetch':
        return await runWebFetch({
          url: String(input.url ?? ''),
          prompt: input.prompt != null ? String(input.prompt) : undefined,
          llm: ctx.llm,
          signal: ctx.signal
        })
      case 'web_search':
        return await runWebSearch({
          input,
          settings: ctx.webSearch,
          signal: ctx.signal
        })
      case 'open_path':
        return await openPathTool(ctx.cwd, input)
      case 'open_url':
        return await openUrlTool(input)
      case 'document_edit':
        return await documentEditTool(ctx.cwd, input, {
          additionalWorkingDirectories: ctx.additionalWorkingDirectories,
          memoryDir: ctx.memoryDir,
          trackFileEdit: ctx.trackFileEdit
        })
      case 'document_convert':
        return await documentConvertTool(ctx.cwd, input, {
          additionalWorkingDirectories: ctx.additionalWorkingDirectories,
          memoryDir: ctx.memoryDir,
          trackFileEdit: ctx.trackFileEdit
        })
      case 'ask_user': {
        const questions = (input.questions as AskUserQuestion[]) || []
        if (!Array.isArray(questions) || !questions.length) {
          return { ok: false, output: 'questions array required (1–4)' }
        }
        if (questions.length > ASK_USER_MAX_QUESTIONS) {
          return { ok: false, output: 'At most 4 questions allowed (AskUserQuestion).' }
        }
        const seenQ = new Set<string>()
        for (const q of questions) {
          if (!q.question?.trim()) {
            return { ok: false, output: 'Each question needs a non-empty question string.' }
          }
          if (seenQ.has(q.question)) {
            return { ok: false, output: `Duplicate question: ${q.question}` }
          }
          seenQ.add(q.question)
          const opts = q.options || []
          if (opts.length < ASK_USER_MIN_OPTIONS || opts.length > ASK_USER_MAX_OPTIONS) {
            return {
              ok: false,
              output: `Question "${q.question}" must have 2–4 options (got ${opts.length}).`
            }
          }
          const labels = new Set<string>()
          for (const o of opts) {
            if (!o.label?.trim()) {
              return { ok: false, output: `Empty option label in "${q.question}".` }
            }
            if (labels.has(o.label)) {
              return {
                ok: false,
                output: `Duplicate option "${o.label}" in "${q.question}".`
              }
            }
            labels.add(o.label)
          }
        }
        const requestId = nanoid()
        ctx.emit({ type: 'session_state', state: 'requires_action', detail: 'ask_user' })
        ctx.emit({ type: 'ask_user', requestId, questions })
        const answer = await ctx.interactions.wait<AskUserAnswerPayload>(requestId)
        ctx.emit({ type: 'session_state', state: 'running' })
        if (answer.cancelled) {
          return {
            ok: false,
            output: formatAskUserToolResult({ answers: {}, cancelled: true })
          }
        }
        return {
          ok: true,
          output: formatAskUserToolResult({
            answers: answer.answers || {},
            annotations: answer.annotations
          })
        }
      }
      case 'enter_plan_mode': {
        if (ctx.getMode() === 'plan') {
          return { ok: true, output: 'Already in plan mode.' }
        }
        const requestId = nanoid()
        const fromMode = ctx.getMode()
        ctx.emit({ type: 'session_state', state: 'requires_action', detail: 'enter_plan' })
        ctx.emit({
          type: 'enter_plan_approval',
          requestId
        })
        const decision = await ctx.interactions.wait<PlanDecisionPayload>(requestId)
        ctx.emit({ type: 'session_state', state: 'running' })
        if (decision.decision !== 'approve') {
          return {
            ok: false,
            output: 'User declined entering plan mode. Continue in the current mode.'
          }
        }
        let planFilePath: string | undefined
        if (ctx.sessionId && ctx.onEnterPlanMode) {
          planFilePath = (await ctx.onEnterPlanMode(fromMode)) ?? undefined
        }
        ctx.setMode('plan')
        ctx.resetPlanExplore?.()
        ctx.emit({ type: 'mode_changed', mode: 'plan' })
        if (planFilePath) {
          const { planExists } = await import('../plans/plans.js')
          const exists = ctx.sessionId
            ? await planExists(ctx.sessionId, { plansDirectory: ctx.plansDirectory }, ctx.cwd)
            : false
          ctx.emit({
            type: 'plan_mode_entered',
            planFilePath,
            planExists: exists
          })
        }
        const {
          buildPlanModeV2Guidance,
          clampPlanExploreAgents
        } = await import('../agent/tasks.js')
        const exploreN = clampPlanExploreAgents(ctx.planExploreAgents ?? 2)
        const fp = ctx.getPlanFilePath?.() ?? planFilePath ?? '(plan file)'
        return {
          ok: true,
          output: [
            'Entered plan mode. Mutating tools blocked except the plan file.',
            `Plan file: ${fp}`,
            '',
            buildPlanModeV2Guidance(exploreN, {
              planFilePath: fp,
              interviewPhase: ctx.planModeInterviewPhase !== false
            })
          ].join('\n')
        }
      }
      case 'exit_plan_mode': {
        if (ctx.getMode() !== 'plan') {
          return {
            ok: false,
            output: 'Not in plan mode. Call enter_plan_mode first (or user already left plan).'
          }
        }
        const planSettings = { plansDirectory: ctx.plansDirectory }
        const { readPlan } = await import('../plans/plans.js')
        let plan = String(input.plan ?? '').trim()
        if (!plan && ctx.sessionId) {
          plan = (await readPlan(ctx.sessionId, planSettings, ctx.cwd)).trim()
          if (!plan && ctx.getPlanFilePath) {
            const fp = ctx.getPlanFilePath()
            if (fp) {
              try {
                plan = (await (await import('node:fs/promises')).readFile(fp, 'utf8')).trim()
              } catch {
                /* empty */
              }
            }
          }
        }
        plan = plan.trim()
        if (!plan) {
          const fp = ctx.getPlanFilePath?.()
          return {
            ok: false,
            output: fp
              ? `No plan content. Write your plan to ${fp} then call exit_plan_mode again.`
              : 'plan text required (or create a plan file first)'
          }
        }
        const { evaluatePlanExitGate, clampPlanExploreAgents } = await import(
          '../agent/tasks.js'
        )
        const gate = evaluatePlanExitGate({
          exploreCount: ctx.getPlanExploreCount?.() ?? 0,
          required: clampPlanExploreAgents(ctx.planExploreAgents ?? 2),
          force: Boolean(input.force),
          planChars: plan.length,
          distinctFocusCount: ctx.getPlanExploreFoci?.().length
        })
        if (!gate.ok) {
          return { ok: false, output: gate.reason }
        }
        const planFilePath = ctx.getPlanFilePath?.()
        const allowedPrompts = Array.isArray(input.allowedPrompts)
          ? (input.allowedPrompts as Array<{ tool: string; prompt: string }>)
          : undefined
        const requestId = nanoid()
        ctx.emit({ type: 'session_state', state: 'requires_action', detail: 'exit_plan' })
        ctx.emit({
          type: 'plan_approval',
          requestId,
          plan,
          planFilePath: planFilePath ?? undefined
        })
        const decision = await ctx.interactions.wait<PlanDecisionPayload>(requestId)
        ctx.emit({ type: 'session_state', state: 'running' })
        if (decision.decision === 'approve') {
          const edited = decision.plan?.trim()
          if (edited && edited !== plan && ctx.sessionId && planFilePath) {
            const { writePlan } = await import('../plans/plans.js')
            await writePlan(
              ctx.sessionId,
              { plansDirectory: ctx.plansDirectory },
              ctx.cwd,
              edited
            )
            plan = edited
            ctx.onPlanFileUpdated?.(planFilePath, plan.length)
          }
          let nextMode: PermissionMode =
            decision.mode === 'acceptEdits' ||
            decision.mode === 'auto' ||
            decision.mode === 'bypassPermissions' ||
            decision.mode === 'default'
              ? decision.mode
              : ctx.getPrePlanMode?.() ?? 'default'
          if (nextMode === 'plan') nextMode = 'default'
          if (ctx.onExitPlanModeApproved) {
            await ctx.onExitPlanModeApproved(nextMode, { allowedPrompts })
          } else {
            ctx.setMode(nextMode)
            ctx.emit({ type: 'mode_changed', mode: nextMode })
            const { applyPlanAllowedPrompts } = await import('../plans/planModeState.js')
            applyPlanAllowedPrompts(ctx.permissions, allowedPrompts)
          }
          return {
            ok: true,
            output: formatExitPlanApprovedOutput({
              nextMode,
              plan,
              edited: Boolean(decision.planWasEdited || edited),
              acceptFeedback: decision.message
            })
          }
        }
        const rejectKind =
          decision.rejectAction === 'exit_to_default'
            ? 'exit_to_default'
            : 'keep_planning'
        if (ctx.onExitPlanModeRejected) {
          await ctx.onExitPlanModeRejected(rejectKind)
        } else if (rejectKind === 'exit_to_default') {
          const restore = ctx.getPrePlanMode?.() ?? 'default'
          ctx.setMode(restore === 'plan' ? 'default' : restore)
          ctx.emit({ type: 'mode_changed', mode: ctx.getMode() })
        }
        return {
          ok: false,
          output: formatExitPlanRejectedOutput({
            keepPlanning: rejectKind !== 'exit_to_default',
            feedback: decision.message
          })
        }
      }
      case 'task_create': {
        if (!ctx.taskStore) {
          return { ok: false, output: 'Task store unavailable in this context' }
        }
        const subject = String(input.subject ?? '')
        const description = String(input.description ?? '')
        // CC TaskCreate: create → TaskCreated(real id) → rollback delete if blocked
        let task: import('../agent/tasks.js').Task
        try {
          task = ctx.taskStore.create({
            subject,
            description,
            activeForm:
              input.activeForm != null ? String(input.activeForm) : undefined,
            metadata:
              input.metadata && typeof input.metadata === 'object'
                ? (input.metadata as Record<string, unknown>)
                : undefined
          })
        } catch (e) {
          return {
            ok: false,
            output: e instanceof Error ? e.message : String(e)
          }
        }
        try {
          const tc = await runHooks({
            event: 'TaskCreated',
            config: (ctx.hooks ?? {}) as HooksConfig,
            disabled: ctx.disableAllHooks === true,
            cwd: ctx.cwd,
            signal: ctx.signal,
            input: {
              session_id: ctx.sessionId || 'session',
              cwd: ctx.cwd,
              permission_mode: ctx.getMode(),
              hook_event_name: 'TaskCreated',
              task_id: task.id,
              task_subject: subject,
              task_description: description
            }
          })
          if (tc.blocking) {
            ctx.taskStore.update(task.id, { status: 'deleted' })
            const listed = ctx.taskStore.listForTool()
            ctx.emit({ type: 'tasks_updated', tasks: listed })
            return {
              ok: false,
              output:
                tc.blockMessage ||
                'TaskCreated hook blocked task creation'
            }
          }
        } catch {
          /* ignore hook errors; task remains */
        }
        const listed = ctx.taskStore.listForTool()
        ctx.emit({ type: 'tasks_updated', tasks: listed })
        return {
          ok: true,
          output: `Task #${task.id} created successfully: ${task.subject}`
        }
      }
      case 'task_get': {
        if (!ctx.taskStore) {
          return { ok: false, output: 'Task store unavailable in this context' }
        }
        const taskId = String(input.taskId ?? '').trim()
        const task = ctx.taskStore.get(taskId)
        if (!task) {
          return { ok: false, output: `Task #${taskId} not found` }
        }
        return {
          ok: true,
          output: JSON.stringify(
            {
              id: task.id,
              subject: task.subject,
              description: task.description,
              status: task.status,
              activeForm: task.activeForm,
              owner: task.owner,
              blocks: task.blocks,
              blockedBy: task.blockedBy,
              metadata: task.metadata
            },
            null,
            2
          )
        }
      }
      case 'task_update': {
        if (!ctx.taskStore) {
          return { ok: false, output: 'Task store unavailable in this context' }
        }
        const taskId = String(input.taskId ?? '').trim()
        const existing = ctx.taskStore.get(taskId)
        const nextStatus =
          input.status != null
            ? (String(input.status) as
                | 'pending'
                | 'in_progress'
                | 'completed'
                | 'deleted')
            : undefined
        if (
          nextStatus === 'completed' &&
          existing &&
          existing.status !== 'completed'
        ) {
          try {
            const done = await runHooks({
              event: 'TaskCompleted',
              config: (ctx.hooks ?? {}) as HooksConfig,
              disabled: ctx.disableAllHooks === true,
              cwd: ctx.cwd,
              signal: ctx.signal,
              input: {
                session_id: ctx.sessionId || 'session',
                cwd: ctx.cwd,
                permission_mode: ctx.getMode(),
                hook_event_name: 'TaskCompleted',
                task_id: taskId,
                task_subject: existing.subject,
                task_description: existing.description
              }
            })
            if (done.blocking) {
              return {
                ok: false,
                output:
                  done.blockMessage ||
                  'TaskCompleted hook blocked marking task complete'
              }
            }
          } catch {
            /* ignore */
          }
        }
        const result = ctx.taskStore.update(taskId, {
          subject: input.subject != null ? String(input.subject) : undefined,
          description:
            input.description != null ? String(input.description) : undefined,
          activeForm:
            input.activeForm != null ? String(input.activeForm) : undefined,
          status: nextStatus,
          owner: input.owner != null ? String(input.owner) : undefined,
          addBlocks: Array.isArray(input.addBlocks)
            ? input.addBlocks.map(String)
            : undefined,
          addBlockedBy: Array.isArray(input.addBlockedBy)
            ? input.addBlockedBy.map(String)
            : undefined,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as Record<string, unknown>)
              : undefined
        })
        if (!result.success) {
          return {
            ok: false,
            output: result.error || `Failed to update task #${taskId}`
          }
        }
        const listed = ctx.taskStore.listForTool()
        ctx.emit({ type: 'tasks_updated', tasks: listed })
        const change = result.statusChange
          ? ` status ${result.statusChange.from}→${result.statusChange.to}`
          : ''
        let output = `Task #${taskId} updated (${result.updatedFields.join(', ') || 'no-op'})${change}`
        if (result.statusChange?.to === 'completed') {
          const { tasksUnblockedBy, shouldNudgeVerification } = await import(
            '../agent/tasks.js'
          )
          const all = ctx.taskStore.list(true)
          const freed = tasksUnblockedBy(all, taskId)
          if (freed.length > 0) {
            output +=
              `\n\nTask completed. Call task_list now — unblocked: ` +
              freed.map((t) => `#${t.id} ${t.subject}`).join(', ')
          } else {
            output +=
              '\n\nTask completed. Call task_list to find your next available task.'
          }
          if (shouldNudgeVerification(all)) {
            output +=
              '\n\nNOTE: You just closed out 3+ tasks and none of them was a verification step. Before writing your final summary, spawn the verification agent (subagent_type="verification") or call verify_delivery. You cannot self-assign PARTIAL by listing caveats — only the verifier issues a verdict.'
          }
        }
        return { ok: true, output }
      }
      case 'task_list': {
        if (!ctx.taskStore) {
          return { ok: false, output: 'Task store unavailable in this context' }
        }
        const tasks = ctx.taskStore.listForTool()
        if (!tasks.length) return { ok: true, output: 'No tasks found' }
        const lines = tasks.map((t) => {
          const owner = t.owner ? ` owner=${t.owner}` : ''
          const blocked =
            t.blockedBy.length > 0
              ? ` blockedBy=[${t.blockedBy.join(',')}]`
              : ''
          return `#${t.id} [${t.status}] ${t.subject}${owner}${blocked}`
        })
        return { ok: true, output: lines.join('\n') }
      }
      case 'context_snip': {
        if (!ctx.snipContextMessages) {
          return {
            ok: false,
            output: 'context_snip is not available in this runner context'
          }
        }
        const raw = input.message_ids
        const ids = Array.isArray(raw)
          ? raw.filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0
            )
          : []
        return ctx.snipContextMessages(ids.map((x) => x.trim()))
      }
      case 'todo_write': {
        const oldTodos = ctx.getTodos()
        const incoming = normalizeTodos(input.todos)
        const inProgress = incoming.filter((t) => t.status === 'in_progress')
        if (inProgress.length > 1) {
          return {
            ok: false,
            output: 'At most one todo may be in_progress at a time.'
          }
        }
        const newTodos = applyTodoWrite(incoming)
        ctx.setTodos(newTodos)
        ctx.emit({ type: 'todos_updated', todos: newTodos })
        const warnZero =
          newTodos.length > 0 && !newTodos.some((t) => t.status === 'in_progress')
            ? '\n(Note: no in_progress item — mark exactly one task in_progress when actively working.)'
            : ''
        return {
          ok: true,
          output: [
            'Todo list updated.',
            '',
            'Before:',
            formatTodos(oldTodos),
            '',
            'After:',
            formatTodos(newTodos),
            newTodos.length === 0 && incoming.length > 0
              ? '\n(All items completed — list cleared.)'
              : '',
            warnZero
          ].join('\n')
        }
      }
      case 'agent': {
        if (!ctx.llm?.apiKey?.trim()) {
          return { ok: false, output: 'API Key required to run sub-agent' }
        }
        const promptRaw = String(input.prompt ?? '').trim()
        if (!promptRaw) return { ok: false, output: 'prompt required' }
        const focusRaw =
          input.focus != null ? String(input.focus).trim() : ''
        const prompt = focusRaw
          ? `[Plan perspective / focus: ${focusRaw}]\n\n${promptRaw}`
          : promptRaw

        const {
          MAX_AGENT_DEPTH,
          nestDepthRejectMessage,
          recursiveForkRejectMessage,
          FORK_SUBAGENT_TYPE,
          runSubAgent
        } = await import('../agent/subAgent.js')
        const { isInForkChild } = await import('../agent/forkContext.js')
        const { isBackgroundTasksDisabled } = await import(
          '../agent/taskNotification.js'
        )
        const { nanoid } = await import('nanoid')
        const { agentToolsEnabled, normalizeAgentTier } = await import(
          '../agent/agentCollaboration.js'
        )

        const depth = ctx.agentDepth ?? 0
        if (depth >= MAX_AGENT_DEPTH) {
          return { ok: false, output: nestDepthRejectMessage(depth) }
        }
        if (!agentToolsEnabled(normalizeAgentTier(ctx.agentTier)) && depth === 0) {
          return {
            ok: false,
            output:
              'agent tool is disabled (agents tier=solo). Explore with read_file/grep/bash directly, or raise tier via /agents auto|team or settings.agentTier.'
          }
        }
        if (ctx.isForkChild) {
          return { ok: false, output: recursiveForkRejectMessage() }
        }

        const resumeAgentId =
          input.agentId != null ? String(input.agentId).trim() : ''
        const rawTypeOpt =
          input.subagent_type != null && String(input.subagent_type).trim() !== ''
            ? String(input.subagent_type).trim()
            : undefined

        // CC fork routing: omit subagent_type → fork; explicit "fork" also forks
        const wantsFork =
          !resumeAgentId &&
          (rawTypeOpt === undefined ||
            rawTypeOpt.toLowerCase() === FORK_SUBAGENT_TYPE)

        const parentMessages = ctx.getParentMessages?.() ?? []
        if (wantsFork && isInForkChild(parentMessages)) {
          return { ok: false, output: recursiveForkRejectMessage() }
        }

        const thoroughnessRaw = String(input.thoroughness ?? 'medium')
        const thoroughness: import('../agent/subAgent.js').Thoroughness =
          thoroughnessRaw === 'quick' || thoroughnessRaw === 'very thorough'
            ? thoroughnessRaw
            : 'medium'

        let type: string = FORK_SUBAGENT_TYPE
        let custom: Awaited<
          ReturnType<
            typeof import('../agent/loadAgentsDir.js').loadCustomAgents
          >
        >[number] | undefined

        if (resumeAgentId) {
          type = 'resume'
        } else if (wantsFork) {
          type = FORK_SUBAGENT_TYPE
        } else {
          const rawType = rawTypeOpt!
          const { loadCustomAgents } = await import('../agent/loadAgentsDir.js')
          const customs = await loadCustomAgents(ctx.cwd)
          custom =
            customs.find(
              (a) => a.name.toLowerCase() === rawType.toLowerCase()
            ) || undefined
          type = custom
            ? custom.name
            : rawType === 'general-purpose' || rawType === 'generalPurpose'
              ? 'general-purpose'
              : rawType === 'verification'
                ? 'verification'
                : rawType === 'Plan' || rawType === 'plan'
                  ? 'Plan'
                  : rawType === 'Explore' || rawType === 'explore'
                    ? 'Explore'
                    : 'Explore'
        }

        // PlanV2: count Explore at spawn (so parallel/background still satisfy gate)
        if (ctx.getMode() === 'plan' && type === 'Explore') {
          ctx.notePlanExplore?.(focusRaw || undefined)
        }

        const isolation = parseIsolationMode(input.isolation)
        const isolationAgentId = resumeAgentId || nanoid(10)
        let isolationWt: Awaited<ReturnType<typeof createAgentWorktree>> | undefined
        let isolationNote = ''
        if (resumeAgentId) {
          const saved = ctx.agentRegistry?.get(resumeAgentId)
          const restored = await restoreIsolationWorktree(
            saved,
            ctx.sessionId || 'session'
          )
          if (restored.session) {
            isolationWt = restored.session
            isolationNote = restored.note
            ctx.permissions.addAdditionalWorkingDirectory(isolationWt.worktreePath)
          } else if (restored.note) {
            isolationNote = restored.note
          }
        }
        if (!isolationWt && isolation === 'worktree') {
          try {
            isolationWt = await createAgentWorktree({
              sessionId: ctx.sessionId || 'session',
              cwd: ctx.cwd,
              agentId: isolationAgentId
            })
            ctx.permissions.addAdditionalWorkingDirectory(isolationWt.worktreePath)
            isolationNote = `isolation=worktree path=${isolationWt.worktreePath}`
          } catch (e) {
            return {
              ok: false,
              output:
                e instanceof Error
                  ? e.message
                  : 'Cannot create isolated worktree (need a git repository).'
            }
          }
        }

        const runInBackground =
          Boolean(input.run_in_background) && !isBackgroundTasksDisabled()
        if (Boolean(input.run_in_background) && isBackgroundTasksDisabled()) {
          return {
            ok: false,
            output:
              'Background agents disabled (ACKEM_DISABLE_BACKGROUND_TASKS / CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).'
          }
        }

        const subOpts = {
          type: type === 'resume' ? 'general-purpose' : type,
          prompt,
          description: input.description
            ? String(input.description)
            : focusRaw
              ? focusRaw.slice(0, 80)
              : undefined,
          thoroughness:
            type === 'Explore' ||
            type === 'Plan' ||
            type === 'verification'
              ? thoroughness
              : undefined,
          customAgent: custom,
          settings: {
            apiBaseUrl: ctx.llm.apiBaseUrl,
            apiKey: ctx.llm.apiKey,
            model: ctx.llm.model,
            effort: ctx.llm.effort,
            cwd: isolationWt?.worktreePath || ctx.cwd,
            permissionRules: ctx.permissionRules ?? { allow: [], deny: [], ask: [] },
            verifyCommand: ctx.verifyCommand,
            hooks: ctx.hooks,
            disableAllHooks: ctx.disableAllHooks,
            autoMode: ctx.autoMode
          },
          permissions: ctx.permissions,
          interactions: ctx.interactions,
          readFileState: ctx.readFileState,
          emit: ctx.emit,
          getTodos: ctx.getTodos,
          setTodos: ctx.setTodos,
          agentRegistry: ctx.agentRegistry,
          resumeAgentId: resumeAgentId || undefined,
          parentMessages: wantsFork ? parentMessages : undefined,
          parentSystemPrompt: wantsFork ? ctx.parentSystemPrompt : undefined,
          parentAgentDepth: depth,
          taskStore: ctx.taskStore,
          sessionId: ctx.sessionId,
          parentPermissionMode: ctx.getMode(),
          messageQueue: ctx.messageQueue,
          backgroundAgents: ctx.backgroundAgents,
          isolationWorktree: isolationWt
        }

        if (runInBackground) {
          const forceAgentId = isolationAgentId
          const description =
            subOpts.description ||
            promptRaw.slice(0, 80) ||
            `background:${type}`
          const abort =
            ctx.backgroundAgents?.register({
              agentId: forceAgentId,
              description,
              subagentType: type === 'resume' ? 'resume' : type,
              toolUseId: ctx.currentToolUseId,
              notifyAgentId: ctx.currentAgentId
            }) ?? new AbortController()

          void runSubAgent({
            ...subOpts,
            forceAgentId,
            signal: abort.signal
          })
            .then(async (result) => {
              if (type === 'verification') {
                void import('../agent/verification.js').then(
                  ({ finalizeVerificationReport }) => {
                    const fin = finalizeVerificationReport(result.report)
                    if (fin.evidence) {
                      ctx.noteVerifyEvidence?.(fin.evidence)
                    }
                  }
                )
              }
              const killed =
                abort.signal.aborted ||
                /abort|killed/i.test(result.error || '')
              ctx.backgroundAgents?.complete({
                agentId: result.agentId,
                ok: result.ok && !killed,
                killed,
                report: result.report,
                error: killed ? 'killed' : result.error,
                description
              })
              if (isolationWt) {
                const settled = await settleAgentWorktree(isolationWt)
                ctx.emit({
                  type: 'status',
                  message: settled.kept
                    ? `isolated worktree kept ${settled.path} (files=${settled.changedFiles})`
                    : `isolated worktree removed (no changes) ${settled.path}`
                })
              }
            })
            .catch(async (e) => {
              const msg = e instanceof Error ? e.message : String(e)
              const killed = abort.signal.aborted
              ctx.backgroundAgents?.complete({
                agentId: forceAgentId,
                ok: false,
                killed,
                report: msg,
                error: killed ? 'killed' : msg,
                description
              })
              if (isolationWt) {
                try {
                  await settleAgentWorktree(isolationWt)
                } catch {
                  /* keep or drop is best-effort after a crash */
                }
              }
            })

          return {
            ok: true,
            output: [
              `Background agent started (async).`,
              `agentId=${forceAgentId}`,
              `type=${type === 'resume' ? 'resume' : type}`,
              focusRaw ? `focus=${focusRaw}` : null,
              `description=${description}`,
              isolationNote || null,
              '',
              ctx.currentAgentId
                ? 'The tool returns immediately. When the agent finishes, a task-notification will be queued for this sub-agent (status completed|failed|killed).'
                : 'The tool returns immediately. When the agent finishes, a task-notification will be queued on the main session (status completed|failed|killed).',
              `Resume later with agent({ agentId: "${forceAgentId}", prompt: "..." }).`,
              `Fetch output: agent_output({ task_id: "${forceAgentId}" }) (block=true waits).`,
              `Stop early: agent_stop({ task_id: "${forceAgentId}" }).`,
              `HTTP fallback: POST /api/session/{id}/background/${forceAgentId}/kill`
            ]
              .filter((l) => l != null)
              .join('\n')
          }
        }

        const result = await runSubAgent({
          ...subOpts,
          signal: ctx.signal,
          parentAbortController: ctx.parentAbortController
        })
        if (isolationWt) {
          const settled = await settleAgentWorktree(isolationWt)
          isolationNote = settled.kept
            ? `isolation=worktree kept ${settled.path} branch=${settled.branch || ''} files=${settled.changedFiles}`
            : `isolation=worktree cleaned (no changes) ${settled.path}`
        }
        if (ctx.parentAbortController?.signal.aborted) {
          throw new Error('user_rejected_tool')
        }

        if (type === 'verification') {
          const { finalizeVerificationReport } = await import(
            '../agent/verification.js'
          )
          const fin = finalizeVerificationReport(result.report)
          if (fin.evidence) ctx.noteVerifyEvidence?.(fin.evidence)
        }

        const label = result.resumed
          ? `resume:${result.agentId}`
          : result.forked
            ? 'fork'
            : type
        const header = [
          `Sub-agent [${label}] ${result.ok ? 'completed' : 'failed'}`,
          `agentId=${result.agentId} turns=${result.turns}`,
          focusRaw ? `focus=${focusRaw}` : null,
          result.forked && result.forkPrefixCount != null
            ? `forkPrefixMessages=${result.forkPrefixCount}`
            : null,
          result.resumed ? 'resumed=true' : null,
          isolationNote || null,
          result.verifyVerdict ? `verifyVerdict=${result.verifyVerdict}` : null,
          result.error ? `error=${result.error}` : null,
          '',
          '=== Report (relay essentials to the user; do not dump raw tool logs) ===',
          result.report,
          type === 'verification' && result.verifyVerdict
            ? `\nVERDICT: ${result.verifyVerdict}`
            : null,
          '',
          `(Use agent with agentId=${result.agentId} to resume this sidechain.)`
        ]
          .filter((l) => l != null)
          .join('\n')

        return { ok: result.ok, output: header }
      }
      case 'agent_stop': {
        const id = String(
          input.task_id ?? input.agent_id ?? input.shell_id ?? ''
        ).trim()
        if (!ctx.backgroundAgents) {
          return { ok: false, output: 'Background agent hub unavailable' }
        }
        const stopped = ctx.backgroundAgents.stop(id)
        if (!stopped.ok) {
          return { ok: false, output: stopped.message }
        }
        return {
          ok: true,
          output: [
            stopped.message,
            `task_id=${stopped.agentId}`,
            `task_type=${stopped.taskType}`,
            `command=${stopped.description}`
          ].join('\n')
        }
      }
      case 'agent_output': {
        const id = String(input.task_id ?? input.agent_id ?? '').trim()
        if (!ctx.backgroundAgents) {
          return { ok: false, output: 'Background agent hub unavailable' }
        }
        const { formatAgentOutputToolResult } = await import(
          '../agent/backgroundAgents.js'
        )
        const timeoutRaw = Number(input.timeout_ms ?? 30_000)
        const timeoutMs = Number.isFinite(timeoutRaw)
          ? Math.max(0, Math.min(600_000, timeoutRaw))
          : 30_000
        const block = input.block === undefined ? true : Boolean(input.block)
        const out = await ctx.backgroundAgents.getOutput({
          agentId: id,
          block,
          timeoutMs,
          signal: ctx.signal
        })
        const text = formatAgentOutputToolResult(out)
        if (out.retrieval_status === 'not_found') {
          return { ok: false, output: text }
        }
        return { ok: true, output: text }
      }
      case 'verify_delivery': {
        const {
          runVerifyGate,
          formatVerifyDeliveryOutput,
          canClaimDelivery
        } = await import('../agent/verification.js')
        const command = String(
          input.command ?? ctx.verifyCommand ?? ''
        ).trim()
        const reason = input.reason != null ? String(input.reason) : ''
        const autoDiscover =
          input.autoDiscover === undefined
            ? !command
            : Boolean(input.autoDiscover)
        const changedFiles = Array.isArray(input.changedFiles)
          ? input.changedFiles.map(String)
          : undefined
        const strategies = Array.isArray(input.strategies)
          ? input.strategies.map(String)
          : undefined
        const taskSummary =
          input.taskSummary != null
            ? String(input.taskSummary)
            : reason || undefined
        const gate = await runVerifyGate({
          cwd: ctx.cwd,
          command,
          autoDiscover,
          signal: ctx.signal,
          strategyCtx: { taskSummary, changedFiles, strategies }
        })
        ctx.noteVerifyEvidence?.(gate.evidence)
        const body = formatVerifyDeliveryOutput({
          command: gate.evidence.command || command || '(none)',
          exitCode: gate.evidence.exitCode ?? null,
          stdout: gate.steps.map((s) => s.stdout).join('\n').slice(-8000),
          stderr: gate.steps.map((s) => s.stderr).join('\n').slice(-4000),
          verdict: gate.evidence.verdict,
          strategies: gate.strategies,
          steps: gate.steps
        })
        const claim = canClaimDelivery(gate.evidence)
          ? ''
          : '\n\n(Delivery gate: NOT deliverable — FAIL/PARTIAL/missing PASS.)'
        return {
          ok: gate.ok,
          output: reason
            ? `reason: ${reason}\n\n${body}${claim}`
            : `${body}${claim}`
        }
      }
      case 'verify_plan_execution': {
        const {
          runVerifyPlanExecution,
          parsePlanChecklist,
          tasksToPlanItems,
          canClaimDeliveryWithPlanGate
        } = await import('../agent/verifyPlanExecution.js')
        const { mcpManager } = await import('../mcp/index.js')
        const planMarkdown =
          input.planMarkdown != null ? String(input.planMarkdown) : ''
        const fromChecklist = planMarkdown
          ? parsePlanChecklist(planMarkdown)
          : []
        const fromTasks = ctx.taskStore
          ? tasksToPlanItems(ctx.taskStore.list())
          : []
        const items = fromChecklist.length ? fromChecklist : fromTasks
        const changedFiles = Array.isArray(input.changedFiles)
          ? input.changedFiles.map(String)
          : undefined
        const strategies = Array.isArray(input.strategies)
          ? input.strategies.map(String)
          : undefined
        const taskSummary =
          input.taskSummary != null ? String(input.taskSummary) : undefined
        const mcpToolNames = mcpManager
          .toolDefinitions()
          .map((t) => t.function.name)
        const result = runVerifyPlanExecution({
          items,
          history: ctx.getParentMessages?.() ?? [],
          changedFiles,
          mcpToolNames,
          strategyCtx: { taskSummary, changedFiles, strategies },
          browserEvidencePresent:
            input.browserEvidencePresent === undefined
              ? undefined
              : Boolean(input.browserEvidencePresent)
        })
        ctx.notePlanVerifyEvidence?.(result.evidence)
        // Also feed ordinary verify evidence when plan verify PASSes so W3
        // canClaimDeliveryWithPlanGate has both sides when only plan gate ran.
        if (result.ok) ctx.noteVerifyEvidence?.(result.evidence)
        const claim = canClaimDeliveryWithPlanGate({
          verifyEvidence: result.evidence,
          planItemCount: items.length,
          planVerifyEvidence: result.evidence
        })
          ? ''
          : '\n\n(Plan delivery gate: NOT deliverable — FAIL/PARTIAL/missing plan PASS.)'
        return {
          ok: result.ok,
          output: result.report + claim
        }
      }
      case 'install_skill': {
        const scope = (String(input.scope ?? 'user') as InstallScope) || 'user'
        const spec = String(input.spec ?? '')
        const skillName = input.skillName ? String(input.skillName) : undefined
        let result = await installSkillFromSpec(spec, {
          scope,
          cwd: ctx.cwd,
          skillName
        })

        // Intro/docs page: discover installable links then install (M16 + M12)
        if (!result.ok && /^https?:\/\//i.test(spec.trim())) {
          let parsedKind: string | null = null
          try {
            parsedKind = parseInstallSpec(spec).kind
          } catch {
            parsedKind = null
          }
          // Intro/docs pages parse as bare `git` URLs; also rediscover when direct clone fails.
          if (
            parsedKind === 'git' ||
            parsedKind === 'github' ||
            parsedKind === null
          ) {
            const discovered = await discoverSkillInstallSpecs(spec, ctx.signal)
            if (!discovered.ok) {
              return {
                ok: false,
                output: `${result.error}\n\nPage discover failed: ${discovered.error}`
              }
            }
            if (!discovered.specs.length) {
              return {
                ok: false,
                output: [
                  `Direct install failed: ${result.error}`,
                  'Fetched page but found no GitHub/zip/SKILL.md links.',
                  'Use web_fetch on the URL, then install_skill with a concrete spec.',
                  '',
                  discovered.markdownExcerpt.slice(0, 1500)
                ].join('\n')
              }
            }
            if (discovered.specs.length > 1 && !skillName) {
              return {
                ok: true,
                output: [
                  'Intro page fetched. Multiple install candidates — pick one and call install_skill again:',
                  ...discovered.specs.slice(0, 20).map((s, i) => `${i + 1}. ${s}`),
                  skillName ? '' : 'Tip: pass skillName when installing from a multi-skill repo.'
                ].join('\n')
              }
            }
            const chosen = skillName
              ? discovered.specs.find((s) => s.includes(skillName)) || discovered.specs[0]!
              : discovered.specs[0]!
            result = await installSkillFromSpec(chosen, {
              scope,
              cwd: ctx.cwd,
              skillName
            })
            if (!result.ok) {
              return {
                ok: false,
                output: `Discovered ${chosen} but install failed: ${result.error}\nCandidates:\n${discovered.specs.join('\n')}`
              }
            }
            result = { ...result, source: `${spec} → ${chosen}` }
          }
        }

        if (!result.ok) {
          return { ok: false, output: result.error || 'install failed' }
        }
        const lines = (result.installed ?? []).map((s) => {
          const invoke = s.invokeName || s.name
          const alias =
            s.invokeName && s.invokeName !== s.name
              ? ` (folder: ${s.name})`
              : ''
          return `→ invoke_skill "${invoke}"${alias} · ${s.targetDir}`
        })
        const invokeHint =
          result.installed?.[0]?.invokeName ||
          result.installed?.[0]?.name ||
          result.name
        return {
          ok: true,
          output: [
            `Installed: ${(result.installed ?? []).map((s) => s.invokeName || s.name).join(', ')}`,
            `Scope: ${scope}`,
            `Source: ${result.source}`,
            ...lines,
            `Next: call invoke_skill with skill="${invokeHint}" (frontmatter or folder name both work).`
          ].join('\n')
        }
      }
      case 'list_skills': {
        const listing = formatSkillsListing(ctx.skills ?? [])
        return {
          ok: true,
          output: `Installed skills:\n${listing}`
        }
      }
      case 'uninstall_skill': {
        const skill = String(input.skill ?? '').trim()
        const scopeRaw = String(input.scope ?? 'auto')
        const scope =
          scopeRaw === 'user' || scopeRaw === 'project' ? scopeRaw : 'auto'
        const result = await uninstallSkill(skill, {
          scope,
          cwd: ctx.cwd
        })
        if (!result.ok) {
          return { ok: false, output: result.error || 'uninstall failed' }
        }
        return {
          ok: true,
          output: `Uninstalled "${result.name}" from ${result.removedDir}`
        }
      }
      case 'invoke_skill': {
        const skillName = String(input.skill ?? '')
        const skillArgs = String(input.args ?? '')
        const skill = findSkill(ctx.skills ?? [], skillName)
        // R6: context:fork skills run in a real isolated sub-agent (CC
        // executeForkedSkill). Inside a child/fork we inline instead (no
        // nested agents) with an explanatory note.
        if (skill && skill.executionContext === 'fork' && !skill.disableModelInvocation) {
          const depth = ctx.agentDepth ?? 0
          const { MAX_AGENT_DEPTH, runForkedSkill } = await import(
            '../agent/subAgent.js'
          )
          if (depth < MAX_AGENT_DEPTH && !ctx.isForkChild && ctx.llm?.apiKey) {
            return await runForkedSkill({
              skill,
              args: skillArgs,
              settings: {
                apiBaseUrl: ctx.llm.apiBaseUrl,
                apiKey: ctx.llm.apiKey,
                model: ctx.llm.model,
                effort: ctx.llm.effort,
                cwd: ctx.cwd,
                permissionRules:
                  ctx.permissionRules ?? { allow: [], deny: [], ask: [] },
                verifyCommand: ctx.verifyCommand,
                hooks: ctx.hooks,
                disableAllHooks: ctx.disableAllHooks,
                autoMode: ctx.autoMode
              },
              permissions: ctx.permissions,
              interactions: ctx.interactions,
              readFileState: ctx.readFileState,
              emit: ctx.emit,
              signal: ctx.signal,
              agentRegistry: ctx.agentRegistry,
              parentAgentDepth: depth,
              taskStore: ctx.taskStore,
              sessionId: ctx.sessionId,
              getTodos: ctx.getTodos,
              setTodos: ctx.setTodos,
              parentPermissionMode: ctx.getMode(),
              parentAbortController: ctx.parentAbortController
            })
            if (ctx.parentAbortController?.signal.aborted) {
              throw new Error('user_rejected_tool')
            }
          }
          return await invokeSkillByName(ctx.skills ?? [], skillName, skillArgs, {
            inlineForkReason: ctx.isForkChild || depth >= MAX_AGENT_DEPTH
              ? 'nested agents are not allowed at this depth — completing inline'
              : 'no LLM credentials for a forked worker — completing inline'
          })
        }
        return await invokeSkillByName(ctx.skills ?? [], skillName, skillArgs)
      }
      case 'list_mcp_resources': {
        const serverFilter = input.server ? String(input.server) : ''
        let rows = mcpManager.listAllResources()
        if (serverFilter) {
          rows = rows.filter((r) => r.server === serverFilter)
        }
        if (!rows.length) {
          return {
            ok: true,
            output: serverFilter
              ? `No resources on MCP server "${serverFilter}" (or not connected).`
              : 'No MCP resources available. Configure mcpServers in settings and reconnect.'
          }
        }
        return {
          ok: true,
          output: rows
            .map(
              (r) =>
                `- [${r.server}] ${r.uri}\n  name: ${r.name}${r.description ? `\n  ${r.description}` : ''}`
            )
            .join('\n')
        }
      }
      case 'read_mcp_resource': {
        const server = String(input.server ?? '')
        const uri = String(input.uri ?? '')
        if (!server || !uri) {
          return { ok: false, output: 'server and uri required' }
        }
        return await mcpManager.readResource(server, uri)
      }
      case 'manage_mcp': {
        const action = String(input.action ?? 'list') as ManageMcpAction
        const result = await manageMcp({
          action,
          name: input.name != null ? String(input.name) : undefined,
          command: input.command != null ? String(input.command) : undefined,
          args: Array.isArray(input.args)
            ? input.args.filter((x): x is string => typeof x === 'string')
            : undefined,
          url: input.url != null ? String(input.url) : undefined,
          type:
            input.type === 'http' || input.type === 'sse' || input.type === 'stdio'
              ? input.type
              : undefined
        })
        if (result.onboarding) {
          const requestId = createBrowserOnboardingRequestId()
          const card = result.onboarding
          ctx.emit({ type: 'session_state', state: 'requires_action', detail: 'browser_onboarding' })
          ctx.emit({
            type: 'browser_onboarding',
            requestId,
            serverName: card.serverName,
            storeUrl: card.storeUrl,
            docUrl: card.docUrl,
            titleZh: card.titleZh,
            titleEn: card.titleEn,
            bodyZh: card.bodyZh,
            bodyEn: card.bodyEn,
            stepsZh: card.stepsZh,
            stepsEn: card.stepsEn,
            noteZh: card.noteZh,
            noteEn: card.noteEn,
            options: card.options
          })
          try {
            const choice = await waitBrowserOnboardingChoice(requestId, ctx.signal)
            ctx.emit({ type: 'session_state', state: 'running' })
            if (choice === 'open_store') {
              return {
                ok: true,
                output:
                  'User opened the extension store. Wait until they choose「我已装好」in the dialog — do not claim the browser is connected.'
              }
            }
            return await applyBrowserOnboardingChoice(choice)
          } catch {
            ctx.emit({ type: 'session_state', state: 'running' })
            return {
              ok: false,
              output:
                'Edge extension onboarding cancelled. Do not claim the user browser is connected.'
            }
          }
        }
        return { ok: result.ok, output: result.output }
      }
      case 'enter_worktree': {
        if (ctx.getWorktree()) {
          return { ok: false, output: 'Already in a worktree session' }
        }
        const name = input.name != null ? String(input.name) : undefined
        if (name) {
          try {
            validateWorktreeSlug(name)
          } catch (e) {
            return { ok: false, output: e instanceof Error ? e.message : String(e) }
          }
        }
        const suggested = name?.trim() || `wt-${Date.now().toString(36)}`
        const hooksConfigured = hasWorktreeCreateHooks(
          ctx.hooks as Record<string, unknown> | undefined
        )
        let hookPath: string | undefined
        try {
          const wc = await runHooks({
            event: 'WorktreeCreate',
            config: (ctx.hooks ?? {}) as HooksConfig,
            disabled: ctx.disableAllHooks === true,
            cwd: ctx.cwd,
            signal: ctx.signal,
            input: {
              session_id: ctx.sessionId || 'session',
              cwd: ctx.cwd,
              permission_mode: ctx.getMode(),
              hook_event_name: 'WorktreeCreate',
              name: suggested
            }
          })
          if (wc.blocking) {
            return {
              ok: false,
              output:
                wc.blockMessage || 'WorktreeCreate hook blocked worktree creation'
            }
          }
          hookPath = wc.worktreePath?.trim() || undefined
        } catch (e) {
          if (hooksConfigured) {
            return {
              ok: false,
              output: `WorktreeCreate hook failed: ${
                e instanceof Error ? e.message : String(e)
              }`
            }
          }
        }

        // CC: configured WorktreeCreate hooks replace git worktree (no silent fallback).
        if (hooksConfigured) {
          if (!hookPath) {
            return {
              ok: false,
              output:
                'WorktreeCreate hook(s) configured but no worktree path returned (stdout absolute path or hookSpecificOutput.worktreePath required).'
            }
          }
          try {
            const session = await attachOutsourcedWorktreeSession({
              sessionId: ctx.sessionId || 'session',
              originalCwd: ctx.cwd,
              worktreePath: hookPath,
              name: suggested
            })
            ctx.setWorktree(session)
            await settleCwd(session.worktreePath)
            ctx.emit({
              type: 'cwd_changed',
              cwd: session.worktreePath,
              reason: 'enter_worktree'
            })
            return { ok: true, output: enterWorktreeMessage(session) }
          } catch (e) {
            return {
              ok: false,
              output: e instanceof Error ? e.message : String(e)
            }
          }
        }

        // Optional override even without exclusive hook mode (path from opportunistic hook)
        if (hookPath) {
          try {
            const session = await attachOutsourcedWorktreeSession({
              sessionId: ctx.sessionId || 'session',
              originalCwd: ctx.cwd,
              worktreePath: hookPath,
              name: suggested
            })
            ctx.setWorktree(session)
            await settleCwd(session.worktreePath)
            ctx.emit({
              type: 'cwd_changed',
              cwd: session.worktreePath,
              reason: 'enter_worktree'
            })
            return { ok: true, output: enterWorktreeMessage(session) }
          } catch (e) {
            return {
              ok: false,
              output: e instanceof Error ? e.message : String(e)
            }
          }
        }

        try {
          const session = await createWorktreeForSession(
            ctx.sessionId || 'session',
            ctx.cwd,
            name
          )
          ctx.setWorktree(session)
          await settleCwd(session.worktreePath)
          ctx.emit({
            type: 'cwd_changed',
            cwd: session.worktreePath,
            reason: 'enter_worktree'
          })
          return { ok: true, output: enterWorktreeMessage(session) }
        } catch (e) {
          return { ok: false, output: e instanceof Error ? e.message : String(e) }
        }
      }
      case 'exit_worktree': {
        const session = ctx.getWorktree()
        if (!session) {
          return {
            ok: false,
            output:
              'No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current session — it will not touch worktrees created manually or in a previous session. No filesystem changes were made.'
          }
        }
        const action = String(input.action ?? '')
        if (action !== 'keep' && action !== 'remove') {
          return { ok: false, output: 'action must be keep or remove' }
        }
        const discard = Boolean(input.discard_changes)
        if (action === 'remove' && !discard) {
          const summary = await countWorktreeChanges(
            session.worktreePath,
            session.originalHeadCommit
          )
          if (summary === null) {
            return {
              ok: false,
              output: `Could not verify worktree state at ${session.worktreePath}. Refusing to remove without explicit confirmation. Re-invoke with discard_changes: true to proceed — or use action: "keep" to preserve the worktree.`
            }
          }
          if (summary.changedFiles > 0 || summary.commits > 0) {
            const parts: string[] = []
            if (summary.changedFiles > 0) {
              parts.push(
                `${summary.changedFiles} uncommitted ${summary.changedFiles === 1 ? 'file' : 'files'}`
              )
            }
            if (summary.commits > 0) {
              parts.push(
                `${summary.commits} ${summary.commits === 1 ? 'commit' : 'commits'} on ${session.worktreeBranch ?? 'the worktree branch'}`
              )
            }
            return {
              ok: false,
              output: `Worktree has ${parts.join(' and ')}. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree.`
            }
          }
        }

        const originalCwd = session.originalCwd
        const worktreePath = session.worktreePath
        if (action === 'remove') {
          try {
            const wr = await runHooks({
              event: 'WorktreeRemove',
              config: (ctx.hooks ?? {}) as HooksConfig,
              disabled: ctx.disableAllHooks === true,
              cwd: ctx.cwd,
              signal: ctx.signal,
              input: {
                session_id: ctx.sessionId || 'session',
                cwd: ctx.cwd,
                permission_mode: ctx.getMode(),
                hook_event_name: 'WorktreeRemove',
                worktree_path: worktreePath
              }
            })
            if (wr.blocking) {
              return {
                ok: false,
                output:
                  wr.blockMessage ||
                  'WorktreeRemove hook blocked worktree removal'
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (action === 'keep') {
          await keepWorktree(session)
        } else {
          await cleanupWorktree(session)
        }
        ctx.setWorktree(null)
        await settleCwd(originalCwd)
        ctx.emit({
          type: 'cwd_changed',
          cwd: originalCwd,
          reason: 'exit_worktree'
        })
        const removeHooks = hasWorktreeRemoveHooks(
          ctx.hooks as Record<string, unknown> | undefined
        )
        return {
          ok: true,
          output:
            action === 'keep'
              ? `Exited worktree. Preserved at ${worktreePath}. Session cwd restored to ${originalCwd}.`
              : session.outsourced
                ? removeHooks
                  ? `Exited outsourced worktree at ${worktreePath} (WorktreeRemove hooks ran; directory left for hook/host cleanup). Session cwd restored to ${originalCwd}.`
                  : `Exited outsourced worktree at ${worktreePath} (directory preserved — not a git worktree managed by Ackem). Session cwd restored to ${originalCwd}.`
                : `Removed worktree at ${worktreePath}. Session cwd restored to ${originalCwd}.`
        }
      }
      case 'cron_create': {
        if (!isCronEnabled()) {
          return { ok: false, output: 'Cron disabled (ACKEM_ENABLE_CRON=0 or CLAUDE_CODE_DISABLE_CRON=1).' }
        }
        const store = ctx.getCron?.()
        if (!store) return { ok: false, output: 'Cron store unavailable' }
        const durable = Boolean(input.durable)
        const r = store.create({
          cron: String(input.cron ?? ''),
          prompt: String(input.prompt ?? ''),
          recurring: input.recurring === undefined ? true : Boolean(input.recurring),
          durable
        })
        if (!r.ok) return { ok: false, output: r.error }
        return {
          ok: true,
          output: [
            `Scheduled id=${r.job.id}`,
            `schedule=${r.humanSchedule}`,
            `recurring=${r.job.recurring}`,
            `durable=${Boolean(r.job.durable)}`,
            `nextRunAt=${new Date(r.job.nextRunAt).toISOString()}`,
            r.job.durable
              ? '(durable — survives process restarts)'
              : '(session-only; not durable across restarts)'
          ].join('\n')
        }
      }
      case 'cron_delete': {
        const store = ctx.getCron?.()
        if (!store) return { ok: false, output: 'Cron store unavailable' }
        const id = String(input.id ?? '')
        if (!id) return { ok: false, output: 'id required' }
        const ok = store.delete(id)
        return ok
          ? { ok: true, output: `Deleted cron job ${id}` }
          : { ok: false, output: `No cron job with id ${id}` }
      }
      case 'cron_list': {
        const store = ctx.getCron?.()
        if (!store) return { ok: false, output: 'Cron store unavailable' }
        const jobs = store.list()
        const nextFire = store.getNextFireTime()
        if (!jobs.length) {
          return {
            ok: true,
            output: '(no session cron jobs)\nnextFireAt=(none)'
          }
        }
        return {
          ok: true,
          output: [
            `nextFireAt=${nextFire ? new Date(nextFire).toISOString() : '(none)'}`,
            ...jobs.map(
              (j) =>
                `- ${j.id} | ${j.humanSchedule} | recurring=${j.recurring} | durable=${Boolean(j.durable)} | fires=${j.fireCount} | next=${new Date(j.nextRunAt).toISOString()}${j.lastFiredAt ? ` | last=${new Date(j.lastFiredAt).toISOString()}` : ''}\n  prompt: ${j.prompt.slice(0, 120)}`
            )
          ].join('\n')
        }
      }
      case 'lsp':
        return await lspManager.run({
          operation: String(input.operation ?? ''),
          filePath: String(input.filePath ?? input.path ?? ''),
          line: Number(input.line),
          character: Number(input.character),
          cwd: ctx.cwd,
          query: input.query != null ? String(input.query) : undefined
        })
      case 'tool_search': {
        const {
          formatToolSearchResult,
          searchDeferredTools
        } = await import('./toolDeferred.js')
        const query = String(input.query ?? '')
        const all = [
          ...filterEnabledTools(TOOL_DEFINITIONS),
          ...mcpManager.toolDefinitions()
        ]
        const matches = searchDeferredTools(all, new Set(), query)
        return {
          ok: true,
          output: formatToolSearchResult(query, matches)
        }
      }
      default:
        if (isMcpToolName(name)) {
          const result = await mcpManager.callTool(name, input)
          if (isPlaywrightMcpToolName(name) && result.output) {
            return { ...result, output: truncatePlaywrightSnapshot(result.output) }
          }
          return result
        }
        return { ok: false, output: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
}
