/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
          inset: 'var(--color-surface-inset)'
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
          subtle: 'var(--color-ink-subtle)'
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          glow: 'var(--color-accent-glow)'
        },
        emotion: {
          sweet: 'var(--color-emotion-sweet)',
          warm: 'var(--color-emotion-warm)',
          cold: 'var(--color-emotion-cold)',
          fear: 'var(--color-emotion-fear)'
        },
        success: 'var(--color-success)',
        danger: 'var(--color-danger)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Zen Maru Gothic"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        glow: 'var(--glow-soft)',
        'glow-md': 'var(--glow-medium)',
        'glow-lg': 'var(--glow-strong)'
      },
      transitionTimingFunction: {
        'ackem-out': 'var(--ease-out)',
        'ackem-bounce': 'var(--ease-bounce)'
      }
    }
  },
  plugins: []
}
