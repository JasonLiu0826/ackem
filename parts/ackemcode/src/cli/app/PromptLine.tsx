import React, { memo } from 'react'
import { Box, Text, useCursor } from 'ink'
import { l } from './language.js'
import { theme } from './theme.js'
import {
  caretToWrap,
  charAtDisplayColumn,
  PROMPT_PREFIX,
  promptWrapWidth,
  stringDisplayWidth,
  wrapPromptLines
} from './textWidth.js'

/** CC-style ~530ms blink using the global pulse tick (~90ms). */
function cursorBlinkOn(pulseTick: number): boolean {
  return Math.floor((pulseTick * 90) / 530) % 2 === 0
}

/** Terminal row (0-based) for prompt caret — anchored from bottom chrome. */
export function computePromptCursorY(opts: {
  rows: number
  promptLines: number
  statusLines: number
  wrapLine: number
}): number {
  return Math.max(
    0,
    opts.rows - 1 - opts.promptLines - opts.statusLines + opts.wrapLine
  )
}

export function promptStatusLines(cols: number): number {
  return cols < 72 ? 3 : 1
}

export function PromptFrame(props: {
  cols: number
  children: React.ReactNode
}): React.ReactElement {
  const line = '─'.repeat(Math.max(8, props.cols - 1))
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color={theme.promptBorder}>{line}</Text>
      {props.children}
      <Text color={theme.promptBorder}>{line}</Text>
    </Box>
  )
}

/** CC-style inverse overlay on the grapheme at caret — width never changes. */
function CaretCell(props: {
  char: string
  color: string
  active: boolean
  blinkOn: boolean
}): React.ReactElement {
  const showBlock = props.active && props.blinkOn
  return (
    <Text
      backgroundColor={showBlock ? theme.fg : undefined}
      color={showBlock ? theme.bg : props.color}
    >
      {props.char}
    </Text>
  )
}

function renderCaretInLine(
  text: string,
  lineIndex: number,
  wrap: { line: number; x: number },
  active: boolean,
  blinkOn: boolean,
  color: string,
  xOffset = 0
): React.ReactElement {
  if (!active || lineIndex !== wrap.line) {
    return <Text color={color}>{text || ' '}</Text>
  }
  const splitAt = Math.max(0, wrap.x - xOffset)
  const { before, cursorChar, after } = charAtDisplayColumn(text, splitAt)
  return (
    <Text color={color}>
      {before}
      <CaretCell char={cursorChar} color={color} active={active} blinkOn={blinkOn} />
      {after}
    </Text>
  )
}

export const PromptLine = memo(function PromptLine(props: {
  input: string
  caret: number
  hasKey: boolean
  cols: number
  rows: number
  pulseTick: number
  active: boolean
}): React.ReactElement {
  const { setCursorPosition } = useCursor()
  const isEmpty = props.input.length === 0
  const placeholder = props.hasKey
    ? l('试试做点什么……', 'Try creating or fixing something…')
    : l('请先输入 /setup 完成配置', 'Please enter /setup to finish configuration')
  const wrap = caretToWrap(PROMPT_PREFIX, props.input, props.caret, props.cols)
  const painted = isEmpty
    ? wrapPromptLines(PROMPT_PREFIX + placeholder, props.cols)
    : wrapPromptLines(PROMPT_PREFIX + props.input, props.cols)
  while (painted.length < wrap.lines) painted.push(PROMPT_PREFIX.trim())

  const blinkOn = cursorBlinkOn(props.pulseTick)
  const statusLines = promptStatusLines(props.cols)
  const promptLines = Math.max(painted.length, wrap.lines)
  const cursorY = computePromptCursorY({
    rows: props.rows,
    promptLines,
    statusLines,
    wrapLine: wrap.line
  })

  // IME anchor only — native cursor hidden via onRender in main.tsx (CC-style).
  if (props.active) {
    setCursorPosition({ x: wrap.x, y: cursorY })
  } else {
    setCursorPosition(undefined)
  }

  const prefixW = promptWrapWidth(props.cols)
  const prefixCols = stringDisplayWidth(PROMPT_PREFIX)

  return (
    <Box flexDirection="column" width={prefixW}>
      {painted.map((ln, i) => {
        const isFirst = i === 0
        const indent = isFirst ? PROMPT_PREFIX : ' '.repeat(PROMPT_PREFIX.length)
        const raw = isFirst ? ln.slice(PROMPT_PREFIX.length) : ln.trimStart()
        const body = isEmpty && isFirst ? raw || placeholder : raw || ' '
        const fullLine = indent + body

        if (isEmpty && isFirst) {
          return (
            <Text key={i} wrap="truncate">
              <Text color={theme.fg}>{PROMPT_PREFIX}</Text>
              {renderCaretInLine(
                body,
                i,
                wrap,
                props.active,
                blinkOn,
                theme.fgMuted,
                prefixCols
              )}
            </Text>
          )
        }

        return (
          <Text key={i} wrap="truncate">
            {renderCaretInLine(
              fullLine,
              i,
              wrap,
              props.active,
              blinkOn,
              theme.fg
            )}
          </Text>
        )
      })}
    </Box>
  )
})

export const SetupInputLine = memo(function SetupInputLine(props: {
  value: string
  display: string
  placeholder: string
  rows: number
  cursorY: number
  pulseTick: number
  active: boolean
}): React.ReactElement {
  const { setCursorPosition } = useCursor()
  const shown = props.display || props.placeholder
  const muted = !props.display
  const caretCol = stringDisplayWidth(PROMPT_PREFIX) + stringDisplayWidth(props.value)
  const full = PROMPT_PREFIX + shown
  const blinkOn = cursorBlinkOn(props.pulseTick)

  if (props.active) {
    setCursorPosition({ x: caretCol, y: props.cursorY })
  } else {
    setCursorPosition(undefined)
  }

  if (!props.active) {
    return (
      <Box>
        <Text color={theme.fg}>{PROMPT_PREFIX}</Text>
        <Text color={muted ? theme.fgMuted : theme.fg}>{shown}</Text>
      </Box>
    )
  }

  const { before, cursorChar, after } = charAtDisplayColumn(full, caretCol)
  const color = muted ? theme.fgMuted : theme.fg
  return (
    <Box>
      <Text color={color}>
        {before}
        <CaretCell char={cursorChar} color={color} active={props.active} blinkOn={blinkOn} />
        {after}
      </Text>
    </Box>
  )
})
