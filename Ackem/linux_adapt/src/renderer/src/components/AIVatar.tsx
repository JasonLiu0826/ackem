import { useEffect, useRef } from 'react'
import { t } from '../lib/i18n'
import type { CompanionAvatarState } from '../../../shared/companionSkin'

export type AvatarState = CompanionAvatarState

/** 保证 blur 光晕在 speaking 态也不贴 canvas 边被方形裁切 */
function resolveCanvasSize(displaySize: number, scale: number): number {
  const scaled = Math.round(displaySize * Math.max(1, scale))
  const haloRadius = displaySize * 0.52 * 1.45
  const blurPad = displaySize * 0.55 + 72
  const minSide = Math.ceil((haloRadius + blurPad) * 2)
  return Math.max(scaled, minSide)
}

export interface AIVatarProps {
  state?: AvatarState
  size?: number
  /**
   * 画布相对显示尺寸的倍数（>1 扩大离屏绘制区，光晕可自然发散至透明边缘）
   * 布局与交互仍按 size 计算；实际边长由 resolveCanvasSize 保证足够留白
   */
  glowCanvasScale?: number
  /** 鼠标视差最大倾角（弧度），默认约 0.12 */
  parallaxStrength?: number
  /** listening 态下用户正在键入：加强转速与光晕 */
  inputTyping?: boolean
  showStatePicker?: boolean
  className?: string
}

interface Point3D {
  x: number
  y: number
  z: number
}

const rotateX = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos }
}

const rotateY = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos }
}

const rotateZ = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: p.z }
}

function project(
  pt: Point3D,
  centerX: number,
  centerY: number,
  depthScale = 0.0012
): { x: number; y: number; z: number } {
  const scale = 1 + pt.z * depthScale
  return { x: pt.x * scale + centerX, y: pt.y * scale + centerY, z: pt.z }
}

/** 各状态的动画目标值（由惯性系统平滑逼近，避免切换时突变） */
type MotionParams = {
  spinSpeed: number
  pulseSpeed: number
  pulseRange: number
  breathSpeed: number
  breathAmp: number
  glowStrength: number
  breathLateFreq: number
}

const MOTION_BY_STATE: Record<AvatarState, MotionParams> = {
  idle: {
    spinSpeed: 0.003,
    pulseSpeed: 0.02,
    pulseRange: 0.04,
    breathSpeed: 1,
    breathAmp: 0.14,
    glowStrength: 0.62,
    breathLateFreq: 0.72
  },
  listening: {
    spinSpeed: 0.004,
    pulseSpeed: 0.02,
    pulseRange: 0.042,
    breathSpeed: 0.55,
    breathAmp: 0.11,
    glowStrength: 0.68,
    breathLateFreq: 0.52
  },
  thinking: {
    spinSpeed: 0.028,
    pulseSpeed: 0.04,
    pulseRange: 0.03,
    breathSpeed: 0.85,
    breathAmp: 0.1,
    glowStrength: 0.7,
    breathLateFreq: 0.72
  },
  speaking: {
    spinSpeed: 0.004,
    pulseSpeed: 0.12,
    pulseRange: 0.12,
    breathSpeed: 1.6,
    breathAmp: 0.24,
    glowStrength: 0.9,
    breathLateFreq: 0.72
  }
}

/** 正在键入时的 listening 加强动效（比仅获焦更明显） */
const LISTENING_TYPING_MOTION: MotionParams = {
  spinSpeed: 0.014,
  pulseSpeed: 0.036,
  pulseRange: 0.072,
  breathSpeed: 0.72,
  breathAmp: 0.16,
  glowStrength: 0.84,
  breathLateFreq: 0.48
}

function motionTargetForState(state: AvatarState, inputTyping: boolean): MotionParams {
  if (state === 'listening' && inputTyping) return LISTENING_TYPING_MOTION
  return MOTION_BY_STATE[state]
}

/** 标量惯性（用于呼吸/光晕参数） */
function inertiaStep(current: number, target: number, blend: number): number {
  return current + (target - current) * blend
}

/** 帧率无关的指数趋近：blend = 1 - e^(-lambda * dt) */
function expBlend(lambda: number, dtSec: number): number {
  return 1 - Math.exp(-lambda * dtSec)
}

function stepMotion(current: MotionParams, target: MotionParams, blend: number): MotionParams {
  return {
    spinSpeed: inertiaStep(current.spinSpeed, target.spinSpeed, blend),
    pulseSpeed: inertiaStep(current.pulseSpeed, target.pulseSpeed, blend),
    pulseRange: inertiaStep(current.pulseRange, target.pulseRange, blend),
    breathSpeed: inertiaStep(current.breathSpeed, target.breathSpeed, blend),
    breathAmp: inertiaStep(current.breathAmp, target.breathAmp, blend),
    glowStrength: inertiaStep(current.glowStrength, target.glowStrength, blend),
    breathLateFreq: inertiaStep(current.breathLateFreq, target.breathLateFreq, blend)
  }
}

/** 加速跟手（进入思索等需要提速时） */
const SPIN_ACCEL_LAMBDA = 3.6
/** 减速摩擦：只衰减当前角速度，不立刻向 idle 目标转速靠拢（约 2s 半程） */
const SPIN_DRAG_LAMBDA = 0.32
const SPIN_EPS = 1e-5

/**
 * 角速度惯性：加速时朝状态目标靠拢；减速时摩擦滑行，避免“一顿立刻变慢”。
 */
function stepSpinVelocity(current: number, driveTarget: number, dtSec: number): number {
  if (driveTarget > current + SPIN_EPS) {
    const blend = expBlend(SPIN_ACCEL_LAMBDA, dtSec)
    return current + (driveTarget - current) * blend
  }
  if (current > driveTarget + SPIN_EPS) {
    const decayed = current * Math.exp(-SPIN_DRAG_LAMBDA * dtSec)
    if (decayed <= driveTarget + SPIN_EPS) {
      const blend = expBlend(0.85, dtSec)
      return decayed + (driveTarget - decayed) * blend
    }
    return decayed
  }
  const blend = expBlend(0.85, dtSec)
  return current + (driveTarget - current) * blend
}

function strokeGradient(
  ctx: CanvasRenderingContext2D,
  size: number,
  alpha = 1
): CanvasGradient {
  const g = ctx.createLinearGradient(size * 0.1, size * 0.9, size * 0.9, size * 0.1)
  g.addColorStop(0, `rgba(74, 222, 128, ${0.12 * alpha})`)
  g.addColorStop(0.15, `rgba(34, 211, 238, ${0.75 * alpha})`)
  g.addColorStop(0.5, `rgba(56, 189, 248, ${0.35 * alpha})`)
  g.addColorStop(0.85, `rgba(251, 146, 60, ${0.8 * alpha})`)
  g.addColorStop(1, `rgba(254, 215, 170, ${0.25 * alpha})`)
  return g
}

/** 立体呼吸光晕：多层延展、随视差倾斜，替代外球线框 */
function drawBreathingEnvelope(
  ctx: CanvasRenderingContext2D,
  size: number,
  centerX: number,
  centerY: number,
  pulsePhase: number,
  motion: MotionParams,
  rotX: number,
  rotY: number,
  pulseFactor: number
): void {
  const { breathSpeed, breathAmp, glowStrength, breathLateFreq } = motion

  const t = pulsePhase * breathSpeed
  const breath = 0.5 + 0.5 * Math.sin(t)
  const breathLate = 0.5 + 0.5 * Math.sin(t * breathLateFreq + 1.1)
  const breathe = 1 + (breath - 0.5) * 2 * breathAmp * pulseFactor
  const extend = 1 + (breathLate - 0.5) * 2 * breathAmp * 1.15
  const alpha = glowStrength * (0.5 + 0.5 * breath)

  const tiltX = 1 + rotX * 0.22
  const tiltY = 1 + rotY * 0.22
  const depthX = rotY * size * 0.06
  const depthY = rotX * size * 0.06
  const coreGap = size * 0.1 * pulseFactor

  const fillGlowBlob = (
    ox: number,
    oy: number,
    sx: number,
    sy: number,
    radius: number,
    blur: number,
    fill: CanvasGradient | string
  ) => {
    ctx.save()
    ctx.translate(centerX + ox, centerY + oy)
    ctx.scale(sx, sy)
    ctx.filter = `blur(${blur}px)`
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const layers: Array<{
    ox: number
    oy: number
    sx: number
    sy: number
    r: number
    blur: number
    aMul: number
  }> = [
    { ox: depthX * 0.35, oy: depthY * 0.35, sx: tiltY * extend * 1.08, sy: tiltX * extend * 1.08, r: size * 0.5, blur: 36, aMul: 0.35 },
    { ox: depthX * 0.55, oy: depthY * 0.55, sx: tiltY * breathe * 1.02, sy: tiltX * breathe * 1.02, r: size * 0.4, blur: 26, aMul: 0.55 },
    { ox: depthX, oy: depthY, sx: tiltY * breathe, sy: tiltX * breathe, r: size * 0.3, blur: 16, aMul: 0.75 },
    { ox: depthX * 1.1, oy: depthY * 1.1, sx: tiltY * 0.92, sy: tiltX * 0.92, r: size * 0.2, blur: 10, aMul: 0.9 }
  ]

  for (const layer of layers) {
    const conic = ctx.createConicGradient(Math.PI * 0.62 + rotY * 0.15, 0, 0)
    const a = alpha * layer.aMul
    conic.addColorStop(0, `rgba(34, 211, 238, ${0.28 * a})`)
    conic.addColorStop(0.25, `rgba(56, 189, 248, ${0.12 * a})`)
    conic.addColorStop(0.5, `rgba(251, 146, 60, ${0.26 * a})`)
    conic.addColorStop(0.78, `rgba(253, 186, 116, ${0.14 * a})`)
    conic.addColorStop(1, `rgba(34, 211, 238, ${0.22 * a})`)
    fillGlowBlob(layer.ox, layer.oy, layer.sx, layer.sy, layer.r, layer.blur, conic)
  }

  // 立体径向壳层：中心空、向外延展
  for (let i = 0; i < 3; i++) {
    const shell = 0.88 + i * 0.06 + (breath - 0.5) * 0.08
    const radial = ctx.createRadialGradient(
      centerX + depthX * (0.4 + i * 0.15),
      centerY + depthY * (0.4 + i * 0.15),
      coreGap * (0.8 + i * 0.15),
      centerX + depthX * 0.5,
      centerY + depthY * 0.5,
      size * 0.48 * shell * extend
    )
    const a = alpha * (0.45 - i * 0.1)
    radial.addColorStop(0, 'rgba(255,255,255,0)')
    radial.addColorStop(0.25, `rgba(34, 211, 238, ${0.2 * a})`)
    radial.addColorStop(0.55, `rgba(129, 140, 248, ${0.08 * a})`)
    radial.addColorStop(0.78, `rgba(251, 146, 60, ${0.22 * a})`)
    radial.addColorStop(1, 'rgba(255,255,255,0)')
    fillGlowBlob(depthX * 0.3, depthY * 0.3, tiltY * breathe, tiltX * breathe, size * 0.46 * shell, 20 - i * 4, radial)
  }

  // 呼吸延展波纹（外扩晕圈）
  const ripple = size * (0.28 + breathLate * 0.14) * extend
  ctx.save()
  ctx.translate(centerX + depthX * 0.8, centerY + depthY * 0.8)
  ctx.scale(tiltY, tiltX)
  ctx.filter = 'blur(8px)'
  ctx.beginPath()
  ctx.arc(0, 0, ripple, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.14 * alpha * (1 - breath * 0.3)})`
  ctx.lineWidth = size * 0.025 * breathe
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, ripple * 1.12, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(251, 146, 60, ${0.1 * alpha * breath})`
  ctx.lineWidth = size * 0.015 * extend
  ctx.stroke()
  ctx.restore()

  ctx.filter = 'none'
  ctx.restore()
}

/** 中心蜂窝：纬向层数（半球）与赤道六边形数量 */
const HONEY_BANDS = 6
const HONEY_EQUATOR = 14

function sphericalPoint(
  radius: number,
  phi: number,
  theta: number,
  transform: (p: Point3D) => Point3D
): Point3D {
  const sinPhi = Math.sin(phi)
  return transform({
    x: radius * sinPhi * Math.cos(theta),
    y: radius * sinPhi * Math.sin(theta),
    z: radius * Math.cos(phi)
  })
}

/** 球面蜂窝网：交错纬环 + 六边形邻接 */
function drawHoneycombCore(
  ctx: CanvasRenderingContext2D,
  size: number,
  centerX: number,
  centerY: number,
  radius: number,
  transform: (p: Point3D) => Point3D,
  alpha: number
): void {
  const poleN = sphericalPoint(radius, 0, 0, transform)
  const poleS = sphericalPoint(radius, Math.PI, 0, transform)

  const northRings: Point3D[][] = []
  const southRings: Point3D[][] = []
  for (let band = 1; band <= HONEY_BANDS; band++) {
    const phiN = (band / (HONEY_BANDS + 1)) * (Math.PI / 2)
    const phiS = Math.PI - phiN
    const count = Math.max(6, Math.round((HONEY_EQUATOR * Math.sin(phiN)) / HONEY_BANDS))
    const staggerN = band % 2 === 0 ? Math.PI / count : 0
    const staggerS = band % 2 === 1 ? Math.PI / count : 0
    const ringN: Point3D[] = []
    const ringS: Point3D[] = []
    for (let k = 0; k < count; k++) {
      const t = (k / count) * Math.PI * 2
      ringN.push(sphericalPoint(radius, phiN, staggerN + t, transform))
      ringS.push(sphericalPoint(radius, phiS, staggerS + t, transform))
    }
    northRings.push(ringN)
    southRings.push(ringS)
  }

  const zLimit = -radius * 0.35
  ctx.save()
  ctx.lineWidth = 0.55
  ctx.strokeStyle = strokeGradient(ctx, size, alpha)

  const drawSeg = (a: Point3D, b: Point3D) => {
    const pa = project(a, centerX, centerY)
    const pb = project(b, centerX, centerY)
    if (pa.z < zLimit && pb.z < zLimit) return
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  const linkRing = (ring: Point3D[]) => {
    for (let j = 0; j < ring.length; j++) {
      drawSeg(ring[j], ring[(j + 1) % ring.length])
    }
  }

  /** 两层纬环之间织六边形：每点连本圈邻点 + 外圈两个最近点 */
  const linkBands = (inner: Point3D[], outer: Point3D[]) => {
    const n = inner.length
    const m = outer.length
    if (n === 0 || m === 0) return
    for (let j = 0; j < n; j++) {
      const o0 = Math.floor((j * m) / n) % m
      const o1 = (o0 + 1) % m
      drawSeg(inner[j], outer[o0])
      drawSeg(inner[j], outer[o1])
    }
  }

  const fanPole = (pole: Point3D, ring: Point3D[]) => {
    for (let j = 0; j < ring.length; j++) {
      drawSeg(pole, ring[j])
    }
  }

  if (northRings.length > 0) {
    fanPole(poleN, northRings[0])
    for (let i = 0; i < northRings.length; i++) {
      linkRing(northRings[i])
      if (i + 1 < northRings.length) linkBands(northRings[i], northRings[i + 1])
    }
  }

  if (southRings.length > 0) {
    fanPole(poleS, southRings[0])
    for (let i = 0; i < southRings.length; i++) {
      linkRing(southRings[i])
      if (i + 1 < southRings.length) linkBands(southRings[i], southRings[i + 1])
    }
  }

  const equator = northRings[northRings.length - 1]
  const equatorS = southRings[southRings.length - 1]
  if (equator && equatorS && equator.length === equatorS.length) {
    for (let j = 0; j < equator.length; j++) {
      drawSeg(equator[j], equatorS[j])
      drawSeg(equator[j], equatorS[(j + 1) % equator.length])
    }
  }

  ctx.restore()
}

/** 中心小球：蜂窝网线框 */
function drawInnerCoreWireframe(
  ctx: CanvasRenderingContext2D,
  size: number,
  centerX: number,
  centerY: number,
  pulseFactor: number,
  rotX: number,
  rotY: number,
  rotationZ: number,
  innerSpin: number
): void {
  const coreRadius = size * 0.14 * pulseFactor

  const transform = (p: Point3D): Point3D => {
    let pt = rotateZ(p, rotationZ * 1.4 + innerSpin)
    pt = rotateX(pt, rotX * 0.6)
    pt = rotateY(pt, rotY * 0.6)
    return pt
  }

  drawHoneycombCore(ctx, size, centerX, centerY, coreRadius, transform, 0.5)
}

export function AIVatar({
  state = 'idle',
  size = 500,
  glowCanvasScale = 1,
  parallaxStrength = 0.12,
  inputTyping = false,
  showStatePicker = false,
  className = ''
}: AIVatarProps): JSX.Element {
  const canvasSize = resolveCanvasSize(size, glowCanvasScale)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
  const stateRef = useRef(state)
  const inputTypingRef = useRef(inputTyping)
  const parallaxRef = useRef(parallaxStrength)
  /** 跨 effect 重挂载保留角速度，避免“顿一下再变慢” */
  const animRef = useRef({
    rotationZ: 0,
    pulsePhase: 0,
    innerSpin: 0,
    spinVelocity: MOTION_BY_STATE.idle.spinSpeed,
    motion: { ...MOTION_BY_STATE.idle } as MotionParams,
    lastFrameTs: 0
  })
  stateRef.current = state
  inputTypingRef.current = inputTyping
  parallaxRef.current = parallaxStrength

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      mouseRef.current.targetX = (e.clientX - centerX) / (rect.width / 2)
      mouseRef.current.targetY = (e.clientY - centerY) / (rect.height / 2)
    }

    const handleMouseLeave = () => {
      mouseRef.current.targetX = 0
      mouseRef.current.targetY = 0
    }

    window.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize * dpr
    canvas.height = canvasSize * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let animationId = 0
    const anim = animRef.current

    const render = () => {
      const avatarState = stateRef.current
      const now = performance.now()
      if (anim.lastFrameTs === 0) anim.lastFrameTs = now
      const dtSec = Math.min(Math.max((now - anim.lastFrameTs) / 1000, 0.001), 0.05)
      anim.lastFrameTs = now

      ctx.clearRect(0, 0, canvasSize, canvasSize)

      const centerX = canvasSize / 2
      const centerY = canvasSize / 2

      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.04
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.04

      const target = motionTargetForState(avatarState, inputTypingRef.current)
      const motionBlend = expBlend(4.2, dtSec)
      anim.motion = stepMotion(anim.motion, target, motionBlend)

      anim.spinVelocity = stepSpinVelocity(anim.spinVelocity, target.spinSpeed, dtSec)

      const frameScale = dtSec * 60
      anim.pulsePhase += anim.motion.pulseSpeed * frameScale
      anim.rotationZ += anim.spinVelocity * frameScale
      anim.innerSpin += anim.spinVelocity * 0.7 * frameScale

      const pulseFactor = 1 + Math.sin(anim.pulsePhase) * anim.motion.pulseRange
      const parallax = parallaxRef.current
      const rotX = mouseRef.current.y * parallax
      const rotY = -mouseRef.current.x * parallax

      drawBreathingEnvelope(
        ctx,
        size,
        centerX,
        centerY,
        anim.pulsePhase,
        anim.motion,
        rotX,
        rotY,
        pulseFactor
      )

      drawInnerCoreWireframe(
        ctx,
        size,
        centerX,
        centerY,
        pulseFactor,
        rotX,
        rotY,
        anim.rotationZ,
        anim.innerSpin
      )

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [size, canvasSize])

  return (
    <div
      className={['flex flex-col items-center justify-center select-none', className].join(' ')}
    >
      <div
        ref={containerRef}
        className="ai-avatar-stage relative flex items-center justify-center overflow-visible"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <canvas
          ref={canvasRef}
          className="ai-avatar-canvas pointer-events-none absolute left-1/2 top-1/2 z-10 block max-w-none -translate-x-1/2 -translate-y-1/2"
          style={{ width: canvasSize, height: canvasSize }}
        />
      </div>

      {showStatePicker && (
        <p className="mt-3 text-[10px] text-slate-500">状态由父组件 state 控制</p>
      )}
    </div>
  )
}
