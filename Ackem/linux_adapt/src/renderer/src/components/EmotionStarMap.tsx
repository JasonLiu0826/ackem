import { useMemo } from 'react'
import { t } from '../lib/i18n'
import { emotionLightColor } from '../lib/emotionColors'

type Props = {
  aff: number
  sec: number
  aro: number
  dom: number
  primaryLabel: string
  size?: number
}

/** 全息情绪星图：aff/sec/aro/dom 四边形 + 同心网格 + 发光边框 */
export function EmotionStarMap({
  aff,
  sec,
  aro,
  dom,
  primaryLabel,
  size = 180
}: Props): JSX.Element {
  const fillColor = emotionLightColor(primaryLabel)
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36

  const toAngle = (i: number) => (i * Math.PI * 2) / 4 - Math.PI / 2
  const toPoint = (i: number, val: number) => {
    const v = (val + 100) / 200
    const a = toAngle(i)
    return { x: cx + Math.cos(a) * r * v, y: cy + Math.sin(a) * r * v }
  }

  const dims = useMemo(
    () => [
      { name: '亲密', val: aff, i: 0 },
      { name: '安全', val: sec, i: 1 },
      { name: '支配', val: dom, i: 2 },
      { name: '唤醒', val: aro, i: 3 }
    ],
    [aff, sec, aro, dom]
  )

  const gridRings = [0.25, 0.5, 0.75, 1]
  const dataPts = dims.map((d) => toPoint(d.i, d.val))
  const dataPath =
    dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

  const ghostFrames = [0.88, 0.76, 0.64].map((scale, fi) => {
    const pts = dims.map((d) => {
      const v = ((d.val + 100) / 200) * scale
      const a = toAngle(d.i)
      return { x: cx + Math.cos(a) * r * v, y: cy + Math.sin(a) * r * v }
    })
    return (
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
    )
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden>
      {/* Layer 1: 全息参考网格 */}
      {gridRings.map((s, ri) => {
        const pts = dims.map((d) => toPoint(d.i, s * 200 - 100))
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        return (
          <path
            key={`ring-${ri}`}
            d={path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="0.5"
            opacity={0.06 + ri * 0.01}
          />
        )
      })}
      {dims.map((d) => {
        const p = toPoint(d.i, 100)
        return (
          <line
            key={`axis-${d.i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="var(--color-accent)"
            strokeWidth="0.5"
            opacity={0.08}
          />
        )
      })}

      {/* Layer 4: 残影 */}
      {ghostFrames.map((path, i) => (
        <path
          key={`ghost-${i}`}
          d={path}
          fill={fillColor}
          fillOpacity={0.04 + i * 0.02}
          stroke="none"
          style={{ transition: 'all 800ms ease-out' }}
        />
      ))}

      {/* Layer 2–3: 四边形 + 发光边 */}
      <path
        d={dataPath}
        fill={fillColor}
        fillOpacity={0.35}
        stroke={fillColor}
        strokeWidth={1}
        strokeOpacity={0.7}
        style={{
          filter: `drop-shadow(0 0 4px ${fillColor})`,
          transition: 'all 800ms ease-out'
        }}
      />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={fillColor} fillOpacity={0.9} />
      ))}
      {dims.map((d) => {
        const p = toPoint(d.i, 118)
        return (
          <text
            key={`lbl-${d.i}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-ink-muted)"
            style={{ fontSize: '9px', fontFamily: 'Inter, sans-serif' }}
          >
            {d.name}
          </text>
        )
      })}
    </svg>
  )
}
