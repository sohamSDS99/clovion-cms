import type { Config } from "tailwindcss";

/**
 * Clovion CMS Tailwind config.
 * Design tokens are sourced from CSS variables defined in app/globals.css so the
 * palette stays single-sourced. The "Refined editorial admin" theme: warm paper,
 * near-black ink, deep-emerald accent, Fraunces display + Hanken Grotesk sans.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "var(--paper)",
          raised: "var(--paper-raised)",
          sunken: "var(--paper-sunken)",
          sidebar: "var(--sidebar)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
          mute: "var(--ink-mute)",
          faint: "var(--ink-faint)",
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-serif)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 26, 23, 0.04), 0 1px 1px rgba(28, 26, 23, 0.03)",
        raised:
          "0 4px 14px rgba(28, 26, 23, 0.08), 0 1px 3px rgba(28, 26, 23, 0.05)",
        pop: "0 12px 40px rgba(28, 26, 23, 0.16), 0 2px 8px rgba(28, 26, 23, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
