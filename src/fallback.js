// Simple DOM/CSS fallback for the PixiJS game shell (no WebGL, no audio)
// Provides a minimal API compatible with src/main.js usage

export function createFallbackGame(mountSelector, opts = {}) {
  const root =
    typeof mountSelector === "string"
      ? document.querySelector(mountSelector)
      : mountSelector;

  if (!root) throw new Error("fallback: mount not found");
  root.innerHTML = "";

  const size = Math.max(1, opts.size ?? 5);
  const board = document.createElement("div");
  board.className = "fallback-board";
  board.style.setProperty("--grid", size);
  root.appendChild(board);

  const placeholder = document.createElement("div");
  placeholder.className = "fallback-placeholder";
  placeholder.textContent = "Fallback mode";
  board.appendChild(placeholder);

  return {
    reset: () => {},
    destroy: () => {
      root.innerHTML = "";
    },
    setBackgroundColor: (color) => {
      board.style.background = typeof color === "string" ? color : `#${color.toString(16).padStart(6, "0")}`;
    },
    getBackgroundColor: () => board.style.background,
  };
}
