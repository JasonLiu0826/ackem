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
        primary: {
          DEFAULT: 'var(--color-primary)',
          light: 'var(--color-primary-light)',
          dark: 'var(--color-primary-dark)'
        },
        emotion: {
          sweet: 'var(--color-emotion-sweet)',
          warm: 'var(--color-emotion-warm)',
          cold: 'var(--color-emotion-cold)',
          fear: 'var(--color-emotion-fear)'
        },
        success: 'var(--color-success)',
        danger: 'var(--color-danger)',
        'bg-base': 'var(--color-bg-base)',
        'bg-elevated': 'var(--color-bg-elevated)',
        'bg-surface': 'var(--color-bg-surface)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        'border-default': 'var(--color-border-default)',
        'border-subtle': 'var(--color-border-subtle)',
        'border-strong': 'var(--color-border-strong)'
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', '"Noto Serif SC"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace']
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
