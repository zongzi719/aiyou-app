/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}",
    "./app/**/*.{js,ts,tsx}",
    "./global.css",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        'outfit': ['Outfit_400Regular'],
        'outfit-bold': ['Outfit_700Bold'],
      },
      spacing: {
        global: '16px'
      },
      colors: {
        primary: "var(--color-primary)",
        invert: "var(--color-invert)",
        secondary: "var(--color-secondary)",
        background: "var(--color-background)",
        text: "var(--color-text)",
        subtext: "var(--color-subtext)",
        highlight: "var(--color-highlight)",
        border: "var(--color-border)",
        darker: "var(--color-darker)",
      },
    },
  },
  plugins: [],
};
