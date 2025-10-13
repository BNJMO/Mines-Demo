import { createGame } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";

import diamondTextureUrl from "../assets/sprites/Diamond.png";
import bombTextureUrl from "../assets/sprites/Bomb.png";
import explosionSheetUrl from "../assets/sprites/Explosion_Spritesheet.png";
import tileTapDownSoundUrl from "../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../assets/sounds/TileHover.wav";
import diamondRevealedSoundUrl from "../assets/sounds/DiamondRevealed.wav";
import bombRevealedSoundUrl from "../assets/sounds/BombRevealed.wav";
import winSoundUrl from "../assets/sounds/Win.wav";
import gameStartSoundUrl from "../assets/sounds/GameStart.wav";

let game;
let controlPanel;
const opts = {
  // Window visuals
  size: 600,
  backgroundColor: "#0C0B0F",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",

  // Game setup
  grid: 5,
  mines: 5,

  // Visuals
  diamondTexturePath: diamondTextureUrl,
  bombTexturePath: bombTextureUrl,
  iconSizePercentage: 0.7,
  iconRevealedSizeOpacity: 0.2,
  iconRevealedSizeFactor: 0.7,
  cardsSpawnDuration: 350,
  revealAllIntervalDelay: 40,
  strokeWidth: 1,
  gapBetweenTiles: 0.013,

  // Animations feel
  hoverEnabled: true,
  hoverEnterDuration: 120,
  hoverExitDuration: 200,
  hoverTiltAxis: "x",
  hoverSkewAmount: 0.02,

  // Card Selected Wiggle
  wiggleSelectionEnabled: true,
  wiggleSelectionDuration: 900,
  wiggleSelectionTimes: 15,
  wiggleSelectionIntensity: 0.03,
  wiggleSelectionScale: 0.005,

  // Card Reveal Flip
  flipDelayMin: 150,
  flipDelayMax: 500,
  flipDuration: 300,
  flipEaseFunction: "easeInOutSine",

  // Bomb Explosion shake
  explosionShakeEnabled: true,
  explosionShakeDuration: 1000,
  explosionShakeAmplitude: 6,
  explosionShakerotationAmplitude: 0.012,
  explosionShakeBaseFrequency: 8,
  explosionShakeSecondaryFrequency: 13,

  // Bomb Explosion spritesheet
  explosionSheetEnabled: true,
  explosionSheetPath: explosionSheetUrl,
  explosionSheetCols: 7,
  explosionSheetRows: 3,
  explosionSheetFps: 24,
  explosionSheetScaleFit: 1.0,
  explosionSheetOpacity: 0.2,

  // Sounds
  tileTapDownSoundPath: tileTapDownSoundUrl,
  tileFlipSoundPath: tileFlipSoundUrl,
  tileHoverSoundPath: tileHoverSoundUrl,
  diamondRevealedSoundPath: diamondRevealedSoundUrl,
  bombRevealedSoundPath: bombRevealedSoundUrl,
  winSoundPath: winSoundUrl,
  gameStartSoundPath: gameStartSoundUrl,
  diamondRevealPitchMin: 1.0,
  diamondRevealPitchMax: 1.25,

  // Win pop-up
  winPopupShowDuration: 260,
  winPopupWidth: 260,
  winPopupHeight: 200,

  // Event callback for when a card is selected
  onCardSelected: ({ row, col, tile }) => {
    if (Math.random() < 0.15) {
      game?.SetSelectedCardIsBomb?.();
    } else {
      game?.setSelectedCardIsDiamond?.();
    }
  },
  onWin: () => {
    game?.showWinPopup?.(24.75, "0.00000003");
  },
};


(async () => {
  // Initialize Control Panel
  try {
    controlPanel = new ControlPanel("#control-panel", {
      gameName: "Mines",
    });
    controlPanel.addEventListener("modechange", (event) => {
      console.debug(`Control panel mode changed to ${event.detail.mode}`);
    });
    controlPanel.addEventListener("betvaluechange", (event) => {
      console.debug(`Bet value updated to ${event.detail.value}`);
    });
    controlPanel.addEventListener("bet", () => handleBet());
    controlPanel.setBetAmountDisplay("$0.00");
    controlPanel.setProfitOnWinDisplay("$0.00");
    controlPanel.setProfitValue("0.00000000");
  } catch (err) {
    console.error("Control panel initialization failed:", err);
  }

  // Initialize Game
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

