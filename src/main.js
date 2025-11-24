import { createGame } from "./game/game.js";

(async () => {
  const game = await createGame("#game", { controlPanelMount: "#control-panel" });
  window.flipGame = game.flipGame;
  window.app = game.app;
})();
