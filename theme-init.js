(function () {
  const root = document.documentElement;
  root.style.visibility = "hidden";

  const fallback = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const reveal = (theme) => {
    root.dataset.theme = theme === "system" || !theme ? fallback : theme;
    root.style.visibility = "";
  };

  const timer = setTimeout(() => reveal(fallback), 500);
  if (!globalThis.chrome?.storage?.local) {
    clearTimeout(timer);
    reveal(fallback);
    return;
  }
  chrome.storage.local.get(["bookmarkLensSettings", "theme"], (stored) => {
    clearTimeout(timer);
    reveal(stored.bookmarkLensSettings?.theme || stored.theme || "system");
  });
})();
