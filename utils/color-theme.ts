import { vars } from "nativewind";

export const themes = {
  light: vars({
    "--color-primary": "#000000",
    "--color-invert": "#ffffff",
    "--color-secondary": "#ffffff",
    "--color-background": "#f5f5f5",
    "--color-darker": "#F4F4F5",
    "--color-text": "#000000",
    "--color-subtext": "#64748B",
    "--color-highlight": "#0EA5E9",
    "--color-border": "rgba(0, 0, 0, 0.1)",
    "--color-gradient": "rgba(0,0,0,0.1)",
  }),
  dark: vars({
    "--color-primary": "#ffffff",
    "--color-invert": "#000000",
    "--color-secondary": "#323232",
    "--color-background": "#171717",
    "--color-darker": "#000000",
    "--color-text": "#ffffff",
    "--color-subtext": "#A1A1A1",
    "--color-highlight": "#0EA5E9",
    "--color-border": "rgba(255, 255, 255, 0.15)",
    "--color-gradient": "rgba(0,0,0,0.6)",
  }),
};
