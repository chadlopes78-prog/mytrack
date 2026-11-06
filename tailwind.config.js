/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "Manrope", "system-ui", "sans-serif"] },
      colors: {
        ink: { 950: "#0B0B0C", 900: "#111113", 850: "#141416", 800: "#18181B", 700: "#212125", 600: "#2C2C31", 500: "#3A3A40" },
        bone: { DEFAULT: "#F2EFE8", 200: "#D8D4CB", 400: "#A19D94", 500: "#7D7A73", 600: "#5F5C56" },
        gold: { DEFAULT: "#E2BC63", 300: "#F0D58F", 600: "#B8913A", 900: "#3A2F15" },
        gain: { DEFAULT: "#34D399", 300: "#6EE7B7", 900: "#0D2E22" },
        loss: { DEFAULT: "#F87171", 300: "#FCA5A5", 900: "#3A1818" },
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.7)",
        lift: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 48px -20px rgba(0,0,0,0.85)",
        gold: "0 0 0 1px rgba(217,180,90,0.35), 0 10px 30px -12px rgba(217,180,90,0.35)",
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "none" } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        sheet: { from: { transform: "translateY(16px)", opacity: 0 }, to: { transform: "none", opacity: 1 } },
      },
      animation: {
        rise: "rise .35s cubic-bezier(.2,.7,.2,1) both",
        fade: "fade .2s ease-out both",
        sheet: "sheet .28s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
};
