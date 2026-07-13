/**
 * In-app「开源协议须知」正文（设置 → 开源协议须知）。
 * 与 dist/应用内合规文本.md、仓库 LICENSE/CLA 保持一致。
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
      title: '开源许可',
      paragraphs: [
        'Ackem 以 GNU Affero 通用公共许可证第 3 版（AGPL-3.0）开源发布。',
        '版权所有 © 2026 Jason Liu（JasonLiu0826）。',
        '在遵守 AGPL-3.0 的前提下，您可自由使用、研究、修改与分发本软件；修改后的衍生作品须以相同协议开源。',
        '若您通过网络向他人提供基于本软件的服务（含 SaaS、远程 API 等），须向用户提供获取完整源代码的途径。'
      ],
      links: [
        { label: '完整 LICENSE（GitHub）', url: `${REPO}/blob/main/LICENSE` },
        { label: 'AGPL-3.0 官方全文', url: 'https://www.gnu.org/licenses/agpl-3.0.html' }
      ]
    },
    {
      title: '允许的使用（无需单独商业授权）',
      paragraphs: [],
      bullets: [
        '个人学习、研究与非商业自用',
        'Fork 或集成到其他项目，且衍生作品同样以 AGPL-3.0 开源',
        '学术论文、教学与公开演示（注明 Ackem 与许可证）'
      ]
    },
    {
      title: '需要商业授权的场景',
      bullets: [
        '闭源商业产品或服务中嵌入、分发或修改 Ackem',
        'SaaS / 托管服务且不愿向终端用户提供对应源代码',
        '企业内私有化部署且不愿按 AGPL 开源定制部分',
        '闭源产品仅通过 API 调用 Ackem（边界情形，建议事先咨询）'
      ],
      paragraphs: [`商业授权申请：${COMMERCIAL_EMAIL}`]
    },
    {
      title: '第三方组件',
      paragraphs: [
        'Ackem 基于 Electron、Chromium、Node.js 及多项 npm 开源库构建；另可能捆绑 embedding 模型、语音服务等运行时。',
        '各组件保留其原有许可证。Windows 绿色版目录内可提供 LICENSE.electron.txt；完整依赖摘要见仓库 NOTICE.md。'
      ],
      links: [{ label: 'NOTICE.md（GitHub）', url: `${REPO}/blob/main/NOTICE.md` }]
    },
    {
      title: '贡献者',
      paragraphs: [
        '感谢所有为 Ackem 提交代码、文档与扩展的开发者。',
        '向本项目提交 Pull Request 即表示您同意贡献者许可协议（CLA v1.1）。'
      ],
      links: [
        { label: 'CLA.md', url: `${REPO}/blob/main/CLA.md` },
        { label: '贡献者列表', url: `${REPO}/graphs/contributors` }
      ]
    },
    {
      title: '隐私与用户数据',
      paragraphs: [
        'Ackem 以本地优先方式运行：对话、记忆、情绪状态、导入文件与 OpenForU 工作区均保存在您的设备上。',
        '本应用默认不收集、不上传、不共享您的对话内容；API Key 与模型凭证仅在您填写后存于本机设置文件。',
        '便携版数据目录：安装目录旁 .\\data\\',
        '用户目录模式：%LOCALAPPDATA%\\Ackem\\',
        '备份建议：完全退出 Ackem 后，拷贝整棵 data 目录（含 ackem.db）。卸载应用不会上传您的数据。'
      ]
    },
    {
      title: '官方发行包说明',
      bullets: [
        '不含任何用户的 data/（记忆、聊天、导入）',
        '不含 API Key、.env 或开发者密钥',
        '不含维护者或第三方的私人数据',
        '凭证需在首次运行后于「设置」中自行配置'
      ],
      paragraphs: ['详细分发说明见随包 docs/ 或 GitHub 仓库 docs/distribution-windows.md。']
    }
  ],
  footer: `Ackem ${'v1.0.0'} · 开源仓库 ${REPO}`
}

const EN: OssNoticeContent = {
  productVersion: 'v1.0.0',
  updated: '2026-06-28',
  sections: [
    {
      title: 'Open-source license',
      paragraphs: [
        'Ackem is released under the GNU Affero General Public License v3.0 (AGPL-3.0).',
        'Copyright © 2026 Jason Liu (JasonLiu0826).',
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
      paragraphs: [],
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
        'Closed-source products calling Ackem via API only (gray area — contact us first)'
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
        'Backup tip: quit Ackem fully, then copy the entire data folder (including ackem.db). Uninstall does not upload your data.'
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
  footer: `Ackem v1.0.0 · ${REPO}`
}

export function getOssNoticeContent(locale: string): OssNoticeContent {
  return locale === 'en' ? EN : ZH
}
