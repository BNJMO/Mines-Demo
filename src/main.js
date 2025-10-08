import { createGame } from "./game.js";

let game;
const opts = {
  size: 600,
  backgroundColor: "#121212",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",
};

(async () => {
  try {
    game = await createGame("#game", opts);
    window.game = game;
  } catch (e) {
    console.error("Game initialization failed:", e);
    const gameDiv = document.querySelector("#game");
    if (gameDiv) {
      gameDiv.innerHTML = `
        <div style="color: #f44336; padding: 20px; background: rgba(0,0,0,0.8); border-radius: 8px;">
          <h3>❌ Game Failed to Initialize</h3>
          <p><strong>Error:</strong> ${e.message}</p>
          <p>Check console (F12) for full details.</p>
        </div>
      `;
    }
  }
})();

document
  .querySelector("#resetBtn")
  ?.addEventListener("click", () => game?.reset?.());

document
  .querySelector("#backgroundToggle")
  ?.addEventListener("click", () => {
    if (!game) return;
    const current = game.getBackgroundColor();
    const next = current === 0x121212 ? 0x1e3a8a : 0x121212;
    game.setBackgroundColor(next);
  });
