import { useState } from 'react'
import type { Approval } from '../../store/workbenchStore'
import { MarkdownContent } from '../MarkdownContent'

export function ApprovalCard(props: {
  approval: Approval
  onAllow: () => void
  onDeny: () => void
  onAnswer?: (answers: Record<string, string>, cancelled?: boolean) => void
  onPath?: (path: string) => void
}): JSX.Element {
  const done = props.approval.resolved
  const [answers, setAnswers] = useState<Record<string, string>>({})
  if (done) return <details className="wb-supervision-log"><summary>{done === 'allow' ? '已允许' : done === 'expired' ? '已失效' : '已拒绝'} · {props.approval.title}</summary><p>{props.approval.detail}</p>{props.approval.path ? <p>{props.approval.path}</p> : null}</details>
  return (
    <div className="wb-card is-approval">
      <h3>{props.approval.title}</h3>
      {props.approval.kind === 'plan'
        ? <MarkdownContent source={props.approval.detail} />
        : <p>{props.approval.detail}</p>}
      {props.approval.path ? (
        <p>
          {props.onPath ? (
            <button type="button" className="wb-md-link" onClick={() => props.onPath?.(props.approval.path!)}>
              {props.approval.path}
            </button>
          ) : (
            props.approval.path
          )}
        </p>
      ) : null}
      {props.approval.kind === 'question' && !done ? (
        <div className="wb-question-form">
          {(props.approval.questions ?? []).map((question) => <label key={question.question} className="wb-field">
            <span>{question.question}</span>
            {question.options.length ? <select value={answers[question.question] ?? ''}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [question.question]: event.target.value }))}>
              <option value="">请选择</option>
              {question.options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
            </select> : <input value={answers[question.question] ?? ''}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [question.question]: event.target.value }))} />}
          </label>)}
          <div className="wb-actions">
            <button type="button" className="wb-btn" onClick={() => props.onAnswer?.({}, true)}>取消</button>
            <button type="button" className="wb-btn primary"
              disabled={(props.approval.questions ?? []).some((question) => !answers[question.question]?.trim())}
              onClick={() => props.onAnswer?.(answers)}>提交回答</button>
          </div>
        </div>
      ) : done ? (
        <p>{done === 'allow' ? '已允许' : '已拒绝'}</p>
      ) : (
        <div className="wb-actions">
          <button type="button" className="wb-btn primary" onClick={props.onAllow}>
            {props.approval.kind === 'plan' ? '批准计划' : '仅允许本次'}
          </button>
          <button type="button" className="wb-btn danger" onClick={props.onDeny}>
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}
