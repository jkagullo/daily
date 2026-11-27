import { ACCENTS, type Accent, type Theme } from "./settings";

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear sRGB mix, t = 0 → a, t = 1 → b. Same math as CSS color-mix(in srgb). */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/**
 * Apply theme + accent to <html>. "system" follows Windows and keeps following it
 * if you switch while the app is running. Returns a cleanup for that listener.
 */
export function applyAppearance(theme: Theme, accent: Accent): () => void {
  const root = document.documentElement;
  root.style.setProperty("--accent", ACCENTS[accent]);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const mode = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
  };
  apply();
  if (theme !== "system") return () => {};
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}
