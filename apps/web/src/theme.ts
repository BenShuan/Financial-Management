const DARK_MQ = "(prefers-color-scheme: dark)";

function syncDarkClassFromPreference(): void {
  const root = document.documentElement;
  if (window.matchMedia(DARK_MQ).matches) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/** Keeps `html.dark` aligned with OS light/dark preference (see inline script in index.html for first paint). */
export function initSystemColorScheme(): void {
  syncDarkClassFromPreference();
  window.matchMedia(DARK_MQ).addEventListener("change", syncDarkClassFromPreference);
}
