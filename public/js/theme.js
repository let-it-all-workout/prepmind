export const THEME_KEY = "prepMind_theme";

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function setTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Keep header theme button in sync when theme changes elsewhere (e.g. Settings). */
export function syncThemeToggleLabel(button) {
  if (!button) return;
  const isDark = document.documentElement.dataset.theme === "dark";
  button.textContent = isDark ? "Light mode" : "Dark mode";
  button.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode"
  );
}

/** Call after DOM; syncs storage → html and wires the button. */
export function initThemeToggle(button) {
  if (!button) return;
  setTheme(getTheme());

  syncThemeToggleLabel(button);
  button.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
    syncThemeToggleLabel(button);
  });
}
