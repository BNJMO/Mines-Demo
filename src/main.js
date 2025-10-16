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
let betButtonMode = "cashout";
let roundActive = false;
let cashoutAvailable = false;
let lastKnownGameState = null;
let selectionDelayHandle = null;
let selectionPending = false;
let minesSelectionLocked = false;

const SERVER_RESPONSE_DELAY_MS = 250;

function setControlPanelBetMode(mode) {
  betButtonMode = mode === "bet" ? "bet" : "cashout";
  controlPanel?.setBetButtonMode?.(betButtonMode);
}

function setControlPanelBetState(isClickable) {
  controlPanel?.setBetButtonState?.(isClickable ? "clickable" : "non-clickable");
}

function setControlPanelRandomState(isClickable) {
  controlPanel?.setRandomPickState?.(isClickable ? "clickable" : "non-clickable");
}

function setControlPanelMinesState(isClickable) {
  controlPanel?.setMinesSelectState?.(isClickable ? "clickable" : "non-clickable");
}

function setGameBoardInteractivity(enabled) {
  const gameNode = document.querySelector("#game");
  if (!gameNode) {
    return;
  }
  gameNode.classList.toggle("is-round-complete", !enabled);
}

function clearSelectionDelay() {
  if (selectionDelayHandle) {
    clearTimeout(selectionDelayHandle);
    selectionDelayHandle = null;
  }
  selectionPending = false;
}

function beginSelectionDelay() {
  clearSelectionDelay();
  selectionPending = true;
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
}

function applyRoundInteractiveState(state) {
  if (!roundActive) {
    return;
  }

  setControlPanelBetMode("cashout");

  if (selectionPending || state?.waitingForChoice) {
    setControlPanelBetState(false);
    setControlPanelRandomState(false);
    cashoutAvailable = (state?.revealedSafe ?? 0) > 0;
    return;
  }

  const hasRevealedSafe = (state?.revealedSafe ?? 0) > 0;
  cashoutAvailable = hasRevealedSafe;
  setControlPanelBetState(hasRevealedSafe);
  setControlPanelRandomState(true);
}

function prepareForNewRoundState() {
  roundActive = true;
  cashoutAvailable = false;
  clearSelectionDelay();
  setControlPanelBetMode("cashout");
  setControlPanelBetState(false);
  setControlPanelRandomState(true);
  setGameBoardInteractivity(true);
  minesSelectionLocked = false;
  setControlPanelMinesState(true);
}

function finalizeRound() {
  roundActive = false;
  cashoutAvailable = false;
  clearSelectionDelay();
  setControlPanelBetMode("bet");
  setControlPanelBetState(true);
  setControlPanelRandomState(false);
  setGameBoardInteractivity(false);
  minesSelectionLocked = false;
  setControlPanelMinesState(true);
}

function handleBetButtonClick() {
  if (betButtonMode === "cashout") {
    handleCashout();
  } else {
    handleBet();
  }
}

function handleCashout() {
  if (!roundActive || !cashoutAvailable) {
    return;
  }

  showCashoutPopup();
  finalizeRound();
}

function handleBet() {
  const selectedMines = controlPanel?.getMinesValue?.();
  const maxMines = controlPanel?.getMaxMines?.();
  const normalized = Math.floor(Number(selectedMines));
  let mines = Number.isFinite(normalized) ? normalized : 1;
  mines = Math.max(1, mines);
  if (Number.isFinite(maxMines)) {
    mines = Math.min(mines, maxMines);
  }

  opts.mines = mines;

  if (typeof game?.setMines === "function") {
    game.setMines(mines);
  } else {
    game?.reset?.();
  }
  prepareForNewRoundState();
}

function handleGameStateChange(state) {
  lastKnownGameState = state;
  if (!roundActive) {
    return;
  }

  if (state?.gameOver) {
    finalizeRound();
    return;
  }

  applyRoundInteractiveState(state);
}

function handleGameOver() {
  finalizeRound();
}

function handleGameWin() {
  game?.showWinPopup?.(24.75, "0.00000003");
  finalizeRound();
}

function handleRandomPickClick() {
  if (!roundActive || selectionPending) {
    return;
  }

  game?.selectRandomTile?.();
}

function handleCardSelected() {
  if (!roundActive) {
    return;
  }

  if (!minesSelectionLocked) {
    minesSelectionLocked = true;
    setControlPanelMinesState(false);
  }

  beginSelectionDelay();

  selectionDelayHandle = setTimeout(() => {
    selectionDelayHandle = null;

    if (!roundActive) {
      selectionPending = false;
      return;
    }

    const revealBomb = Math.random() < 0.15;

    if (revealBomb) {
      game?.SetSelectedCardIsBomb?.();
    } else {
      game?.setSelectedCardIsDiamond?.();
    }

    selectionPending = false;
  }, SERVER_RESPONSE_DELAY_MS);
}

function showCashoutPopup() {
  const betAmount = controlPanel?.getBetValue?.() ?? 0;
  const state = lastKnownGameState;

  let multiplier = 1;
  if (state && typeof state.totalSafe === "number" && state.totalSafe > 0) {
    const progress = Math.max(
      0,
      Math.min(state.revealedSafe / state.totalSafe, 1)
    );
    multiplier = 1 + progress;
  }

  game?.showWinPopup?.(multiplier, betAmount);
}
const opts = {
  // Window visuals
  size: 600,
  backgroundColor: "#091B26",
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
  explosionShakeAmplitude: 12,
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
  onCardSelected: () => handleCardSelected(),
  onWin: handleGameWin,
  onGameOver: handleGameOver,
  onChange: handleGameStateChange,
};


(async () => {
  const totalTiles = opts.grid * opts.grid;
  const maxMines = Math.max(1, totalTiles - 1);
  const initialMines = Math.max(1, Math.min(opts.mines ?? 1, maxMines));
  opts.mines = initialMines;

  // Initialize Control Panel
  try {
    controlPanel = new ControlPanel("#control-panel", {
      gameName: "Mines",
      totalTiles,
      maxMines,
      initialMines,
    });
    controlPanel.addEventListener("modechange", (event) => {
      console.debug(`Control panel mode changed to ${event.detail.mode}`);
    });
    controlPanel.addEventListener("betvaluechange", (event) => {
      console.debug(`Bet value updated to ${event.detail.value}`);
    });
    controlPanel.addEventListener("mineschanged", (event) => {
      const mines = event.detail.value;
      opts.mines = mines;
    });
    controlPanel.addEventListener("bet", handleBetButtonClick);
    controlPanel.addEventListener("randompick", handleRandomPickClick);
    prepareForNewRoundState();
    controlPanel.setBetAmountDisplay("$0.00");
    controlPanel.setTotalProfitMultiplier(0.0);
    controlPanel.setProfitOnWinDisplay("$0.00");
    controlPanel.setProfitValue("0.00000000");
  } catch (err) {
    console.error("Control panel initialization failed:", err);
  }

  // Initialize Game
  try {
    game = await createGame("#game", opts);
    window.game = game;
    const state = game?.getState?.();
    if (state) {
      controlPanel?.setTotalTiles?.(state.grid * state.grid, { emit: false });
      controlPanel?.setMinesValue?.(state.mines, { emit: false });
    }
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

