/**
 * First-run Edge extension onboarding — copy locked in
 * doc/开发文档/浏览器MCP-首次引导.md
 */
import { PLAYWRIGHT_EDGE_SERVER } from './seedPresets.js'

export const PLAYWRIGHT_MCP_BRIDGE_STORE_URL =
  'https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm'

export const PLAYWRIGHT_MCP_EXTENSION_DOC_URL =
  'https://playwright.dev/mcp/configuration/browser-extension'

export const EXTENSION_DISPLAY_NAME = 'Playwright MCP Bridge'

export const BROWSER_ONBOARDING_TITLE_ZH = '用你的 Edge 办事：先装一次扩展'
export const BROWSER_ONBOARDING_TITLE_EN =
  'Use your Edge: install the official extension once'

export const BROWSER_ONBOARDING_BODY_ZH = `AckemCode 可以在你已经打开的 Microsoft Edge 里帮你点网页、填表、在已登录网站办理事务。

浏览器不允许本机程序直接接管你正在用的窗口。需要在 Edge 里安装微软官方扩展「${EXTENSION_DISPLAY_NAME}」（一次即可）。装好后，扩展会让你挑选交给 AckemCode 的标签。AckemCode 只会操作你选中的那一页，不会默默扫完全部标签。`

export const BROWSER_ONBOARDING_BODY_EN = `AckemCode can click pages, fill forms, and handle tasks on sites where you are already signed in, in the Microsoft Edge window you already have open.

A local program cannot take over your browser by itself. Install the official Microsoft extension "${EXTENSION_DISPLAY_NAME}" in Edge (once). The extension will ask you to pick a tab. AckemCode only uses that tab — it will not silently scan every open page.`

export const BROWSER_ONBOARDING_STEPS_ZH = [
  '打开 Microsoft Edge（请用你平时上网的那只，不要新开 InPrivate）。',
  `在 Edge 地址栏打开扩展商店页：\n   ${PLAYWRIGHT_MCP_BRIDGE_STORE_URL}\n   若 Edge 提示「允许来自其他应用商店的扩展」，请允许。`,
  `安装「${EXTENSION_DISPLAY_NAME}」。按钮可能写「获取」或「添加至 Chrome」——在 Edge 里就是装到 Edge。`,
  '安装完成后，保持 Edge 开着。需要时把扩展钉在工具栏，方便看到它。',
  '回到这里，选「我已装好」。AckemCode 连接时，若扩展弹出标签列表，请点选要交给它的那一个页面。'
]

export const BROWSER_ONBOARDING_STEPS_EN = [
  'Open Microsoft Edge (your everyday profile, not InPrivate).',
  `Open this store page in Edge:\n   ${PLAYWRIGHT_MCP_BRIDGE_STORE_URL}\n   If Edge asks to allow extensions from other stores, allow it.`,
  `Install "${EXTENSION_DISPLAY_NAME}". The button may say "Add to Chrome" — on Edge that installs into Edge.`,
  'Leave Edge open. Optionally pin the extension.',
  'Come back here and choose "I\'ve installed it". If the extension shows a tab list, pick the page you want AckemCode to use.'
]

export const BROWSER_ONBOARDING_NOTE_ZH = `之后一般不用再装。点网页前仍会问你一声（尤其是提交、支付、改密码）。

这不是再开一只没登录的空浏览器。若你暂时不想挂自己的号，可以选「改用独立窗口」——那只窗口里没有你平时的登录。`

export const BROWSER_ONBOARDING_NOTE_EN = `You usually will not install again. AckemCode still asks before clicks (especially submit, pay, or change password).

This is not an empty extra browser. Choose "Use a separate window" if you do not want to attach your logged-in Edge.`

export const BROWSER_ONBOARDING_FAIL_ZH = `还连不上你的 Edge。请核对：

· Edge 是否开着（不是关掉再只留本终端）
· 扩展「${EXTENSION_DISPLAY_NAME}」是否已启用（edge://extensions）
· 是否装在你现在正在用的那个 Edge 配置文件里（换了配置文件要再装一次）
· 扩展弹出时是否已经选了一个标签

商店：${PLAYWRIGHT_MCP_BRIDGE_STORE_URL}
说明：${PLAYWRIGHT_MCP_EXTENSION_DOC_URL}

装好并选好标签后，再说「再连一次」或点「我已装好」。`

export const BROWSER_ONBOARDING_FAIL_EN = `Still cannot attach to Edge. Check that Edge is open, "${EXTENSION_DISPLAY_NAME}" is enabled on this profile (edge://extensions), and you picked a tab if the extension asked.

Store: ${PLAYWRIGHT_MCP_BRIDGE_STORE_URL}
Docs: ${PLAYWRIGHT_MCP_EXTENSION_DOC_URL}

Then say "connect again" or choose "I've installed it".`

export const ISOLATED_WINDOW_NOTE_ZH =
  '已打开独立浏览器窗口。这不是你平时的 Edge，里面没有你的登录。只要打开网页、验收本地页面可以用；要动已登录的账号，请改走「用我的浏览器」。'

export const ISOLATED_WINDOW_NOTE_EN =
  'Opened a separate browser window. It is not your everyday Edge and has no your logins. Use "use my browser" if you need a signed-in site.'

export type BrowserOnboardingOptionId =
  | 'open_store'
  | 'installed'
  | 'isolated'
  | 'later'
  | 'never'

export const BROWSER_ONBOARDING_OPTIONS: Array<{
  id: BrowserOnboardingOptionId
  labelZh: string
  labelEn: string
}> = [
  { id: 'open_store', labelZh: '在 Edge 中打开扩展商店', labelEn: 'Open the extension store in Edge' },
  { id: 'installed', labelZh: '我已装好', labelEn: "I've installed it" },
  {
    id: 'isolated',
    labelZh: '改用独立窗口（无登录）',
    labelEn: 'Use a separate window (signed out)'
  },
  { id: 'later', labelZh: '稍后再说', labelEn: 'Not now' },
  {
    id: 'never',
    labelZh: '不要用我的浏览器，且不再提醒',
    labelEn: "Don't use my browser, and don't ask again"
  }
]

export type BrowserOnboardingSettings = {
  skipPrompt?: boolean
  lastShownAt?: string
  lastChoice?: BrowserOnboardingOptionId
}

export type BrowserOnboardingInfo = {
  showPrompt: boolean
  serverName: typeof PLAYWRIGHT_EDGE_SERVER
  storeUrl: string
  docUrl: string
  extensionName: string
  titleZh: string
  titleEn: string
  bodyZh: string
  bodyEn: string
  stepsZh: string[]
  stepsEn: string[]
  noteZh: string
  noteEn: string
  failZh: string
  failEn: string
  options: typeof BROWSER_ONBOARDING_OPTIONS
}

export function shouldShowBrowserOnboarding(opts: {
  skipPrompt?: boolean
  connected?: boolean
}): boolean {
  if (opts.skipPrompt) return false
  if (opts.connected) return false
  return true
}

export function getBrowserOnboardingInfo(): BrowserOnboardingInfo {
  return {
    showPrompt: true,
    serverName: PLAYWRIGHT_EDGE_SERVER,
    storeUrl: PLAYWRIGHT_MCP_BRIDGE_STORE_URL,
    docUrl: PLAYWRIGHT_MCP_EXTENSION_DOC_URL,
    extensionName: EXTENSION_DISPLAY_NAME,
    titleZh: BROWSER_ONBOARDING_TITLE_ZH,
    titleEn: BROWSER_ONBOARDING_TITLE_EN,
    bodyZh: BROWSER_ONBOARDING_BODY_ZH,
    bodyEn: BROWSER_ONBOARDING_BODY_EN,
    stepsZh: BROWSER_ONBOARDING_STEPS_ZH,
    stepsEn: BROWSER_ONBOARDING_STEPS_EN,
    noteZh: BROWSER_ONBOARDING_NOTE_ZH,
    noteEn: BROWSER_ONBOARDING_NOTE_EN,
    failZh: BROWSER_ONBOARDING_FAIL_ZH,
    failEn: BROWSER_ONBOARDING_FAIL_EN,
    options: BROWSER_ONBOARDING_OPTIONS
  }
}
