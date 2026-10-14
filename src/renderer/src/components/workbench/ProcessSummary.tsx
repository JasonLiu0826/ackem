export function ProcessSummary(props: { text: string }): JSX.Element | null {
  if (!props.text) return null
  return <div className="wb-process">{props.text}</div>
}
