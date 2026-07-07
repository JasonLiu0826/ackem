import { getLocale } from '../../lib/i18n'
import { getOssNoticeContent } from '../../../../shared/compliance/ossNoticeContent'

export function OssNoticePanel(): JSX.Element {
  const content = getOssNoticeContent(getLocale())

  return (
    <div className="settings-oss-notice-panel max-h-[min(62vh,520px)] overflow-y-auto rounded-xl border border-surface-inset/60 bg-black/15 px-4 py-3">
      <p className="text-[11px] text-ink-muted">
        Ackem {content.productVersion} 路 {content.updated}
      </p>
      <div className="mt-3 space-y-5">
        {content.sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h4 className="text-xs font-semibold text-ink">{section.title}</h4>
            {section.paragraphs.map((p) => (
              <p key={p} className="text-xs leading-relaxed text-ink-muted">
                {p}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-muted">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.links?.length ? (
              <ul className="space-y-1 text-xs">
                {section.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      <p className="mt-5 border-t border-surface-inset/40 pt-3 text-[10px] leading-relaxed text-ink-muted">
        {content.footer}
      </p>
    </div>
  )
}
