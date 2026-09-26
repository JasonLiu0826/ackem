import { getUiTheme, setUiTheme } from '../../../../../uiTheme'

export function toggleBritneyTheme(): 'light' | 'dark' {
  const next = getUiTheme() === 'dark' ? 'light' : 'dark'
  setUiTheme(next)
  return next
}
