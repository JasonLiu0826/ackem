import React from 'react'
import { Box, Text } from 'ink'
import { theme } from './theme.js'

/** Right-edge scrollbar: thumb position follows scroll-from-bottom (0 = latest). */
export function HistoryScrollbar(props: {
  trackHeight: number
  scroll: number
  maxScroll: number
}): React.ReactElement | null {
  const { trackHeight, scroll, maxScroll } = props
  if (maxScroll <= 0 || trackHeight < 2) return null

  const total = maxScroll + trackHeight
  const thumbH = Math.max(1, Math.round((trackHeight * trackHeight) / total))
  const travel = Math.max(0, trackHeight - thumbH)
  const fromTop = maxScroll > 0 ? Math.round(((maxScroll - scroll) / maxScroll) * travel) : 0

  const lines: React.ReactElement[] = []
  for (let i = 0; i < trackHeight; i++) {
    const inThumb = i >= fromTop && i < fromTop + thumbH
    lines.push(
      <Text key={i} color={inThumb ? theme.cyan : theme.fgMuted}>
        {inThumb ? '▮' : '│'}
      </Text>
    )
  }
  return (
    <Box flexDirection="column" width={1} flexShrink={0}>
      {lines}
    </Box>
  )
}

/** Map a click row (1-based terminal row) within the track to scroll-from-bottom. */
export function scrollFromScrollbarRow(
  row1: number,
  trackTopRow1: number,
  trackHeight: number,
  maxScroll: number
): number {
  if (maxScroll <= 0) return 0
  const y = Math.max(0, Math.min(trackHeight - 1, row1 - trackTopRow1))
  const ratio = trackHeight <= 1 ? 0 : y / (trackHeight - 1)
  return Math.round((1 - ratio) * maxScroll)
}
