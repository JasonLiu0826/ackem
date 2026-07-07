/**
 * In-app銆屽紑婧愬崗璁』鐭ャ€嶆鏂囷紙璁剧疆 鈫?寮€婧愬崗璁』鐭ワ級銆?
 * 涓?dist/搴旂敤鍐呭悎瑙勬枃鏈?md銆佷粨搴?LICENSE/CLA 淇濇寔涓€鑷淬€?
 */

export type OssNoticeLink = {
  label: string
  url: string
}

export type OssNoticeSection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
  links?: OssNoticeLink[]
}

export type OssNoticeContent = {
  productVersion: string
  updated: string
  sections: OssNoticeSection[]
  footer: string
}

const REPO = 'https://github.com/JasonLiu0826/Ackem'
const COMMERCIAL_EMAIL = 'jasonliu_lyf_2005@qq.com'

const ZH: OssNoticeContent = {
  productVersion: 'v1.0.0',
  updated: '2026-06-28',
  sections: [
    {
      title: '寮€婧愯鍙?,
      paragraphs: [
        'Ackem 浠?GNU Affero 閫氱敤鍏叡璁稿彲璇佺 3 鐗堬紙AGPL-3.0锛夊紑婧愬彂甯冦€?,
        '鐗堟潈鎵€鏈?漏 2026 Jason Liu锛圝asonLiu0826锛夈€?,
        '鍦ㄩ伒瀹?AGPL-3.0 鐨勫墠鎻愪笅锛屾偍鍙嚜鐢变娇鐢ㄣ€佺爺绌躲€佷慨鏀逛笌鍒嗗彂鏈蒋浠讹紱淇敼鍚庣殑琛嶇敓浣滃搧椤讳互鐩稿悓鍗忚寮€婧愩€?,
        '鑻ユ偍閫氳繃缃戠粶鍚戜粬浜烘彁渚涘熀浜庢湰杞欢鐨勬湇鍔★紙鍚?SaaS銆佽繙绋?API 绛夛級锛岄』鍚戠敤鎴锋彁渚涜幏鍙栧畬鏁存簮浠ｇ爜鐨勯€斿緞銆?
      ],
      links: [
        { label: '瀹屾暣 LICENSE锛圙itHub锛?, url: `${REPO}/blob/main/LICENSE` },
        { label: 'AGPL-3.0 瀹樻柟鍏ㄦ枃', url: 'https://www.gnu.org/licenses/agpl-3.0.html' }
      ]
    },
    {
      title: '鍏佽鐨勪娇鐢紙鏃犻渶鍗曠嫭鍟嗕笟鎺堟潈锛?,
      bullets: [
        '涓汉瀛︿範銆佺爺绌朵笌闈炲晢涓氳嚜鐢?,
        'Fork 鎴栭泦鎴愬埌鍏朵粬椤圭洰锛屼笖琛嶇敓浣滃搧鍚屾牱浠?AGPL-3.0 寮€婧?,
        '瀛︽湳璁烘枃銆佹暀瀛︿笌鍏紑婕旂ず锛堟敞鏄?Ackem 涓庤鍙瘉锛?
      ]
    },
    {
      title: '闇€瑕佸晢涓氭巿鏉冪殑鍦烘櫙',
      bullets: [
        '闂簮鍟嗕笟浜у搧鎴栨湇鍔′腑宓屽叆銆佸垎鍙戞垨淇敼 Ackem',
        'SaaS / 鎵樼鏈嶅姟涓斾笉鎰垮悜缁堢鐢ㄦ埛鎻愪緵瀵瑰簲婧愪唬鐮?,
        '浼佷笟鍐呯鏈夊寲閮ㄧ讲涓斾笉鎰挎寜 AGPL 寮€婧愬畾鍒堕儴鍒?,
        '闂簮浜у搧浠呴€氳繃 API 璋冪敤 Ackem锛堣竟鐣屾儏褰紝寤鸿浜嬪厛鍜ㄨ锛?
      ],
      paragraphs: [`鍟嗕笟鎺堟潈鐢宠锛?{COMMERCIAL_EMAIL}`]
    },
    {
      title: '绗笁鏂圭粍浠?,
      paragraphs: [
        'Ackem 鍩轰簬 Electron銆丆hromium銆丯ode.js 鍙婂椤?npm 寮€婧愬簱鏋勫缓锛涘彟鍙兘鎹嗙粦 embedding 妯″瀷銆佽闊虫湇鍔＄瓑杩愯鏃躲€?,
        '鍚勭粍浠朵繚鐣欏叾鍘熸湁璁稿彲璇併€俉indows 缁胯壊鐗堢洰褰曞唴鍙彁渚?LICENSE.electron.txt锛涘畬鏁翠緷璧栨憳瑕佽浠撳簱 NOTICE.md銆?
      ],
      links: [{ label: 'NOTICE.md锛圙itHub锛?, url: `${REPO}/blob/main/NOTICE.md` }]
    },
    {
      title: '璐＄尞鑰?,
      paragraphs: [
        '鎰熻阿鎵€鏈変负 Ackem 鎻愪氦浠ｇ爜銆佹枃妗ｄ笌鎵╁睍鐨勫紑鍙戣€呫€?,
        '鍚戞湰椤圭洰鎻愪氦 Pull Request 鍗宠〃绀烘偍鍚屾剰璐＄尞鑰呰鍙崗璁紙CLA v1.1锛夈€?
      ],
      links: [
        { label: 'CLA.md', url: `${REPO}/blob/main/CLA.md` },
        { label: '璐＄尞鑰呭垪琛?, url: `${REPO}/graphs/contributors` }
      ]
    },
    {
      title: '闅愮涓庣敤鎴锋暟鎹?,
      paragraphs: [
        'Ackem 浠ユ湰鍦颁紭鍏堟柟寮忚繍琛岋細瀵硅瘽銆佽蹇嗐€佹儏缁姸鎬併€佸鍏ユ枃浠朵笌 OpenForU 宸ヤ綔鍖哄潎淇濆瓨鍦ㄦ偍鐨勮澶囦笂銆?,
        '鏈簲鐢ㄩ粯璁や笉鏀堕泦銆佷笉涓婁紶銆佷笉鍏变韩鎮ㄧ殑瀵硅瘽鍐呭锛汚PI Key 涓庢ā鍨嬪嚟璇佷粎鍦ㄦ偍濉啓鍚庡瓨浜庢湰鏈鸿缃枃浠躲€?,
        '渚挎惡鐗堟暟鎹洰褰曪細瀹夎鐩綍鏃?.\\data\\',
        '鐢ㄦ埛鐩綍妯″紡锛?LOCALAPPDATA%\\Ackem\\',
        '澶囦唤寤鸿锛氬畬鍏ㄩ€€鍑?Ackem 鍚庯紝鎷疯礉鏁存５ data 鐩綍锛堝惈 Ackem.db锛夈€傚嵏杞藉簲鐢ㄤ笉浼氫笂浼犳偍鐨勬暟鎹€?
      ]
    },
    {
      title: '瀹樻柟鍙戣鍖呰鏄?,
      bullets: [
        '涓嶅惈浠讳綍鐢ㄦ埛鐨?data/锛堣蹇嗐€佽亰澶┿€佸鍏ワ級',
        '涓嶅惈 API Key銆?env 鎴栧紑鍙戣€呭瘑閽?,
        '涓嶅惈缁存姢鑰呮垨绗笁鏂圭殑绉佷汉鏁版嵁',
        '鍑瘉闇€鍦ㄩ娆¤繍琛屽悗浜庛€岃缃€嶄腑鑷閰嶇疆'
      ],
      paragraphs: ['璇︾粏鍒嗗彂璇存槑瑙侀殢鍖?docs/ 鎴?GitHub 浠撳簱 docs/distribution-windows.md銆?]
    }
  ],
  footer: `Ackem ${'v1.0.0'} 路 寮€婧愪粨搴?${REPO}`
}

const EN: OssNoticeContent = {
  productVersion: 'v1.0.0',
  updated: '2026-06-28',
  sections: [
    {
      title: 'Open-source license',
      paragraphs: [
        'Ackem is released under the GNU Affero General Public License v3.0 (AGPL-3.0).',
        'Copyright 漏 2026 Jason Liu (JasonLiu0826).',
        'You may use, study, modify, and distribute this software under AGPL-3.0; derivative works must use the same license.',
        'If you offer network-facing services based on Ackem (including SaaS or remote APIs), you must provide a way for users to obtain the complete corresponding source code.'
      ],
      links: [
        { label: 'Full LICENSE (GitHub)', url: `${REPO}/blob/main/LICENSE` },
        { label: 'AGPL-3.0 official text', url: 'https://www.gnu.org/licenses/agpl-3.0.html' }
      ]
    },
    {
      title: 'Permitted use (no separate commercial license)',
      bullets: [
        'Personal learning, research, and non-commercial use',
        'Forking or integrating into other projects when derivatives remain AGPL-3.0',
        'Academic papers, teaching, and public demos (with attribution)'
      ]
    },
    {
      title: 'Commercial license required',
      bullets: [
        'Embedding, distributing, or modifying Ackem in a closed-source commercial product',
        'SaaS / hosted service without offering source code to end users',
        'Private enterprise deployment without open-sourcing customizations under AGPL',
        'Closed-source products calling Ackem via API only (gray area 鈥?contact us first)'
      ],
      paragraphs: [`Commercial licensing: ${COMMERCIAL_EMAIL}`]
    },
    {
      title: 'Third-party components',
      paragraphs: [
        'Ackem is built on Electron, Chromium, Node.js, and many npm libraries; embedding models and voice runtimes may be bundled.',
        'Each component keeps its original license. Windows builds may include LICENSE.electron.txt; see NOTICE.md in the repository for a summary.'
      ],
      links: [{ label: 'NOTICE.md (GitHub)', url: `${REPO}/blob/main/NOTICE.md` }]
    },
    {
      title: 'Contributors',
      paragraphs: [
        'Thank you to everyone who contributes code, docs, and extensions.',
        'By opening a pull request you agree to the Contributor License Agreement (CLA v1.1).'
      ],
      links: [
        { label: 'CLA.md', url: `${REPO}/blob/main/CLA.md` },
        { label: 'Contributors', url: `${REPO}/graphs/contributors` }
      ]
    },
    {
      title: 'Privacy and your data',
      paragraphs: [
        'Ackem is local-first: chats, memory, emotional state, imports, and OpenForU workspaces stay on your device.',
        'By default the app does not collect or upload conversation content; API keys are stored locally after you enter them in Settings.',
        'Portable data folder: .\\data\\ next to Ackem.exe',
        'User-directory mode: %LOCALAPPDATA%\\Ackem\\',
        'Backup tip: quit Ackem fully, then copy the entire data folder (including Ackem.db). Uninstall does not upload your data.'
      ]
    },
    {
      title: 'What official releases include',
      bullets: [
        'No user data/ (memory, chats, imports)',
        'No API keys, .env files, or developer secrets',
        'No maintainer or third-party private data',
        'Credentials are configured in Settings after first run'
      ],
      paragraphs: ['See bundled docs/ or docs/distribution-windows.md on GitHub.']
    }
  ],
  footer: `Ackem v1.0.0 路 ${REPO}`
}

export function getOssNoticeContent(locale: string): OssNoticeContent {
  return locale === 'en' ? EN : ZH
}
