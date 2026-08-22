import { getThemeWithFallback, resolveTheme } from "@/utils/theme";

/**
 * Ensures exactly one highlight.js theme <style> (tagged `data-hljs-theme`) is
 * present, matching the current app theme. Shared by the read-only memo view
 * (MemoContent/CodeBlock) and the WYSIWYG editor's code-block node view so
 * syntax-highlighted code looks identical in both. Idempotent: repeated calls
 * for the current theme are no-ops, so the two renderers never fight over the
 * single style tag.
 */
export async function ensureHighlightTheme(isDark: boolean): Promise<void> {
  const target = isDark ? "dark" : "light";
  const existing = document.querySelector<HTMLStyleElement>("style[data-hljs-theme]");
  if (existing?.dataset.hljsTheme === target) {
    return;
  }

  try {
    const cssModule = isDark
      ? await import("highlight.js/styles/github-dark-dimmed.css?inline")
      : await import("highlight.js/styles/github.css?inline");

    // Another call may have swapped the theme while we were importing.
    const current = document.querySelector<HTMLStyleElement>("style[data-hljs-theme]");
    if (current?.dataset.hljsTheme === target) {
      return;
    }
    current?.remove();

    const style = document.createElement("style");
    style.textContent = cssModule.default;
    style.setAttribute("data-hljs-theme", target);
    document.head.appendChild(style);
  } catch (error) {
    console.warn("Failed to load highlight.js theme:", error);
  }
}

/** Resolve the app's light/dark flag from the user's stored theme setting. */
export function isDarkThemeFromSettings(theme?: string): boolean {
  return resolveTheme(getThemeWithFallback(theme)).includes("dark");
}

/** Detect the currently applied (resolved) theme's dark flag from the DOM. */
export function isAppliedDarkTheme(): boolean {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) {
    return theme.endsWith("-dark") || theme.endsWith(".dark");
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
