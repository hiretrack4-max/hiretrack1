import type { Config } from 'tailwindcss';

/**
 * HireTrack design system — LIGHT-first · ORANGE + BLACK + WHITE.
 *
 * - LIGHT is the default theme: warm near-white page (#FAFAF9), pure-white
 *   cards, near-black ink (#1A1A1A), neutral warm-gray borders, and a single
 *   burnt-orange accent (#E8501F / hover #C2410C) for primary actions, active
 *   nav/tabs, links and focus rings.
 * - A clean DARK theme is provided via `[data-theme="dark"]` (neutral #0A0A0A
 *   surfaces + light ink + the same orange) — modern, not heavy/editorial.
 * - Semantic surface/ink/border tokens are driven by CSS variables (see
 *   src/index.css) so they flip cleanly between the two themes.
 * - Status hues (green/amber/blue/red) + the 9 pipeline / 4 job-status colours
 *   live here as static values so StatusPill and the charts share one source
 *   of truth, kept visually distinct from the orange accent.
 */
export default {
  // Light is the default; dark is toggled via [data-theme="dark"] on <html>.
  // ThemeContext keeps the `.dark` class in sync so `dark:` variants still work.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Theme-aware semantic tokens (CSS-variable driven) ---
        panel: 'var(--panel)',
        panel2: 'var(--panel-2)',
        line2: 'var(--line-2)',
        dim: 'var(--dim)',
        text: 'var(--text)',
        orange: {
          DEFAULT: 'var(--orange)',
          dim: 'var(--orange-dim)',
        },
        wash: 'var(--wash)',
        // Status hues (theme-aware).
        green: 'var(--green)',
        amber: 'var(--amber)',
        blue: 'var(--blue)',
        red: 'var(--red)',
        // --- Brand: burnt-orange scale (static) ---
        brand: {
          50: '#FFF4ED',
          100: '#FFE4D3',
          200: '#FFC5A6',
          300: '#FB9B6E',
          400: '#F5713C',
          500: '#E8501F',
          600: '#C2410C',
          700: '#9A3412',
          800: '#7C2D12',
          900: '#68280F',
        },
        blueaccent: '#2563EB',
        accent: {
          DEFAULT: '#F5713C',
          soft: '#FB9B6E',
          strong: '#C2410C',
        },
        // "Black" structural family used by the login showcase panel + modal
        // scrim (static across themes).
        midnight: {
          DEFAULT: '#17140F',
          700: '#211C15',
          600: '#2C261D',
          500: '#3A3227',
          muted: '#B0A99B',
        },
        // --- Legacy semantic aliases mapped onto the token system ---
        surface: 'var(--ink)', // page background
        card: 'var(--panel)',
        elevated: 'var(--panel-2)',
        ink: 'var(--text)', // foreground you write with
        muted: 'var(--muted)',
        label: 'var(--label)', // dark, bold form + read-view field labels
        line: 'var(--line)',
        // --- Nine candidate pipeline stages ---
        status: {
          received: '#64748B',
          shortlisted: '#2563EB',
          scheduled: '#EA580C',
          inprogress: '#C2410C',
          completed: '#0891B2',
          offer: '#E8501F',
          joined: '#16A34A',
          rejected: '#DC2626',
          onhold: '#D97706',
        },
        // --- Job statuses ---
        job: {
          open: '#16A34A',
          progress: '#2563EB',
          closed: '#78716C',
          hold: '#D97706',
        },
      },
      fontFamily: {
        sans: ['"InterVariable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"InterVariable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,20,15,0.04), 0 4px 16px -8px rgba(23,20,15,0.10)',
        'card-hover': '0 2px 4px rgba(23,20,15,0.06), 0 16px 36px -14px rgba(23,20,15,0.18)',
        brand: '0 10px 26px -10px rgba(232,80,31,0.45)',
        'brand-sm': '0 4px 12px -6px rgba(232,80,31,0.4)',
        glow: '0 0 0 1px rgba(232,80,31,0.16), 0 12px 34px -12px rgba(245,113,60,0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(120deg, #E8501F 0%, #F97316 100%)',
        'brand-gradient-br': 'linear-gradient(135deg, #E8501F 0%, #F97316 100%)',
        'accent-gradient': 'linear-gradient(120deg, #F5713C 0%, #C2410C 100%)',
        'sidebar-glow':
          'radial-gradient(120% 80% at 10% -10%, rgba(232,80,31,0.28) 0%, rgba(23,20,15,0) 55%)',
        'mesh-light':
          'radial-gradient(90% 60% at 100% 0%, rgba(232,80,31,0.06) 0%, rgba(250,250,249,0) 55%), radial-gradient(80% 60% at 0% 100%, rgba(245,113,60,0.05) 0%, rgba(250,250,249,0) 55%)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        'toast-in': 'toast-in 0.3s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
