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
let betButtonMode = "bet";
let roundActive = false;
let cashoutAvailable = false;
let lastKnownGameState = null;
let selectionDelayHandle = null;
let selectionPending = false;
let minesSelectionLocked = false;
let controlPanelMode = "manual";
let autoSelectionCount = 0;
let storedAutoSelections = [];
let autoRunActive = false;
let autoRunStopRequested = false;
let autoRoundInProgress = false;
let autoBetsRemaining = Infinity;
let autoResetTimer = null;
let autoStopShouldComplete = false;

const AUTO_RESET_DELAY_MS = 1500;
let autoResetDelayMs = AUTO_RESET_DELAY_MS;

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

function setControlPanelAutoStartState(isClickable) {
  controlPanel?.setAutoStartButtonState?.(
    isClickable ? "clickable" : "non-clickable"
  );
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

function setAutoRunUIState(active) {
  if (!controlPanel) {
    return;
  }

  if (active) {
    controlPanel.setAutoStartButtonMode?.("stop");
    controlPanel.setAutoStartButtonState?.("clickable");
    controlPanel.setModeToggleEnabled?.(false);
    controlPanel.setBetControlsEnabled?.(false);
    setControlPanelMinesState(false);
    controlPanel.setNumberOfBetsEnabled?.(false);
    controlPanel.setAdvancedToggleEnabled?.(false);
    controlPanel.setAdvancedStrategyControlsEnabled?.(false);
    controlPanel.setStopOnProfitEnabled?.(false);
    controlPanel.setStopOnLossEnabled?.(false);
  } else {
    controlPanel.setAutoStartButtonMode?.("start");
    controlPanel.setModeToggleEnabled?.(true);
    controlPanel.setBetControlsEnabled?.(true);
    controlPanel.setNumberOfBetsEnabled?.(true);
    controlPanel.setAdvancedToggleEnabled?.(true);
    controlPanel.setAdvancedStrategyControlsEnabled?.(true);
    controlPanel.setStopOnProfitEnabled?.(true);
    controlPanel.setStopOnLossEnabled?.(true);
    if (roundActive && !minesSelectionLocked) {
      setControlPanelMinesState(true);
    }
    handleAutoSelectionChange(autoSelectionCount);
  }
}

function startAutoRoundIfNeeded() {
  if (storedAutoSelections.length === 0) {
    return false;
  }

  if (!roundActive) {
    game?.reset?.();
    prepareForNewRoundState({ preserveAutoSelections: true });
  }

  if (typeof game?.applyAutoSelections === "function") {
    game.applyAutoSelections(storedAutoSelections, { emit: true });
  }

  return true;
}

function executeAutoBetRound({ ensurePrepared = true } = {}) {
  if (!autoRunActive) {
    return;
  }

  if (storedAutoSelections.length === 0) {
    stopAutoBetProcess();
    return;
  }

  if (ensurePrepared && !startAutoRoundIfNeeded()) {
    stopAutoBetProcess({ completed: autoStopShouldComplete });
    autoStopShouldComplete = false;
    return;
  }

  if (autoRunStopRequested) {
    const completed = autoStopShouldComplete;
    autoStopShouldComplete = false;
    stopAutoBetProcess({ completed });
    return;
  }

  const selections = storedAutoSelections.map((selection) => ({ ...selection }));
  if (selections.length === 0) {
    stopAutoBetProcess();
    return;
  }

  autoRoundInProgress = true;
  selectionPending = true;
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
  setControlPanelMinesState(false);
  setGameBoardInteractivity(false);
  setControlPanelAutoStartState(true);

  clearSelectionDelay();

  const results = [];
  let bombAssigned = false;

  for (const selection of selections) {
    const revealBomb = !bombAssigned && Math.random() < 0.15;
    if (revealBomb) {
      bombAssigned = true;
    }
    results.push({
      row: selection.row,
      col: selection.col,
      result: revealBomb ? "bomb" : "diamond",
    });
  }

  selectionDelayHandle = setTimeout(() => {
    selectionDelayHandle = null;
    selectionPending = false;

    if (!autoRunActive || !roundActive) {
      autoRoundInProgress = false;
      return;
    }

    game?.revealAutoSelections?.(results);
  }, SERVER_RESPONSE_DELAY_MS);
}

function scheduleNextAutoBetRound() {
  if (!autoRunActive) {
    return;
  }

  clearTimeout(autoResetTimer);
  autoResetTimer = setTimeout(() => {
    autoResetTimer = null;

    if (!autoRunActive) {
      return;
    }

    executeAutoBetRound({ ensurePrepared: true });
  }, autoResetDelayMs);
}

function handleAutoRoundFinished() {
  autoRoundInProgress = false;

  if (!autoRunActive) {
    return;
  }

  if (Number.isFinite(autoBetsRemaining)) {
    autoBetsRemaining = Math.max(0, autoBetsRemaining - 1);
    controlPanel?.setNumberOfBetsValue?.(autoBetsRemaining);
  }

  if (Number.isFinite(autoBetsRemaining) && autoBetsRemaining <= 0) {
    autoRunStopRequested = true;
    autoStopShouldComplete = true;
  }

  scheduleNextAutoBetRound();
}

function beginAutoBetProcess() {
  if (selectionPending || autoSelectionCount <= 0) {
    return;
  }

  const selections = game?.getAutoSelections?.() ?? storedAutoSelections;
  if (!Array.isArray(selections) || selections.length === 0) {
    return;
  }

  storedAutoSelections = selections.map((selection) => ({ ...selection }));

  const configuredBets = controlPanel?.getNumberOfBetsValue?.();
  if (Number.isFinite(configuredBets) && configuredBets > 0) {
    autoBetsRemaining = Math.floor(configuredBets);
    controlPanel?.setNumberOfBetsValue?.(autoBetsRemaining);
  } else {
    autoBetsRemaining = Infinity;
  }

  autoRunActive = true;
  autoRunStopRequested = false;
  autoRoundInProgress = false;
  autoStopShouldComplete = false;

  setAutoRunUIState(true);
  executeAutoBetRound();
}

function stopAutoBetProcess({ completed = false } = {}) {
  if (selectionDelayHandle) {
    clearTimeout(selectionDelayHandle);
    selectionDelayHandle = null;
    selectionPending = false;
  }

  clearTimeout(autoResetTimer);
  autoResetTimer = null;

  const wasActive = autoRunActive;
  autoRunActive = false;
  autoRunStopRequested = false;
  autoRoundInProgress = false;
  autoStopShouldComplete = false;

  if (!wasActive && !completed) {
    handleAutoSelectionChange(autoSelectionCount);
    return;
  }

  const shouldPreserveSelections = controlPanelMode === "auto";
  if (shouldPreserveSelections) {
    const selections = game?.getAutoSelections?.();
    if (Array.isArray(selections) && selections.length > 0) {
      storedAutoSelections = selections.map((selection) => ({ ...selection }));
    }
  }

  setAutoRunUIState(false);

  finalizeRound({ preserveAutoSelections: shouldPreserveSelections });

  if (!completed) {
    game?.reset?.();
  }

  if (shouldPreserveSelections) {
    prepareForNewRoundState({ preserveAutoSelections: true });
    if (
      Array.isArray(storedAutoSelections) &&
      storedAutoSelections.length > 0 &&
      typeof game?.applyAutoSelections === "function"
    ) {
      game.applyAutoSelections(storedAutoSelections, { emit: true });
    }
  }
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

function prepareForNewRoundState({ preserveAutoSelections = false } = {}) {
  roundActive = true;
  cashoutAvailable = false;
  clearSelectionDelay();
  setControlPanelBetMode("cashout");
  setControlPanelBetState(false);
  setControlPanelRandomState(true);
  setGameBoardInteractivity(true);
  minesSelectionLocked = false;

  if (controlPanelMode !== "auto") {
    setControlPanelMinesState(false);
    controlPanel?.setModeToggleEnabled?.(false);
    controlPanel?.setBetControlsEnabled?.(false);
  } else if (!autoRunActive) {
    setControlPanelMinesState(true);
    controlPanel?.setModeToggleEnabled?.(true);
    controlPanel?.setBetControlsEnabled?.(true);
  }

  if (preserveAutoSelections) {
    autoSelectionCount = storedAutoSelections.length;
    if (!autoRunActive && controlPanelMode === "auto") {
      const canClick = autoSelectionCount > 0 && !selectionPending;
      setControlPanelAutoStartState(canClick);
    }
  } else {
    autoSelectionCount = 0;
    if (!autoRunActive) {
      setControlPanelAutoStartState(false);
    }
    game?.clearAutoSelections?.();
  }
}

function finalizeRound({ preserveAutoSelections = false } = {}) {
  roundActive = false;
  cashoutAvailable = false;
  clearSelectionDelay();
  setControlPanelBetMode("bet");
  setControlPanelRandomState(false);
  setGameBoardInteractivity(false);
  minesSelectionLocked = false;

  if (autoRunActive) {
    setControlPanelBetState(false);
    setControlPanelMinesState(false);
    controlPanel?.setModeToggleEnabled?.(false);
    controlPanel?.setBetControlsEnabled?.(false);
  } else {
    setControlPanelBetState(true);
    setControlPanelMinesState(true);
    controlPanel?.setModeToggleEnabled?.(true);
    controlPanel?.setBetControlsEnabled?.(true);
  }

  if (preserveAutoSelections) {
    autoSelectionCount = storedAutoSelections.length;
    if (!autoRunActive && controlPanelMode === "auto") {
      const canClick = autoSelectionCount > 0 && !selectionPending;
      setControlPanelAutoStartState(canClick);
    }
  } else {
    autoSelectionCount = 0;
    if (!autoRunActive) {
      setControlPanelAutoStartState(false);
    }
  }
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

  game?.revealRemainingTiles?.();
  showCashoutPopup();
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
}

function handleBet() {
  game?.reset?.();
  prepareForNewRoundState();
}

function handleGameStateChange(state) {
  lastKnownGameState = state;
  if (!roundActive) {
    return;
  }

  if (state?.gameOver) {
    finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
    return;
  }

  applyRoundInteractiveState(state);
}

function handleGameOver() {
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
  handleAutoRoundFinished();
}

function handleGameWin() {
  game?.revealRemainingTiles?.();
  game?.showWinPopup?.(24.75, "0.00000003");
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
  handleAutoRoundFinished();
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

  if (controlPanelMode === "auto") {
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

function handleAutoSelectionChange(count) {
  autoSelectionCount = count;

  if (controlPanelMode === "auto") {
    const selections = game?.getAutoSelections?.() ?? [];
    if (Array.isArray(selections)) {
      if (count > 0) {
        storedAutoSelections = selections.map((selection) => ({ ...selection }));
      } else if (!autoRunActive && !autoRoundInProgress) {
        storedAutoSelections = selections.map((selection) => ({ ...selection }));
      }
    }
  }

  if (controlPanelMode !== "auto") {
    setControlPanelAutoStartState(false);
    return;
  }

  if (!roundActive) {
    if (!autoRunActive) {
      setControlPanelAutoStartState(false);
    }
    return;
  }

  if (count > 0 && !minesSelectionLocked) {
    minesSelectionLocked = true;
    setControlPanelMinesState(false);
  } else if (count === 0 && !autoRunActive) {
    minesSelectionLocked = false;
    setControlPanelMinesState(true);
  }

  if (autoRunActive) {
    setControlPanelAutoStartState(true);
    return;
  }

  const canClick = count > 0 && !selectionPending;
  setControlPanelAutoStartState(canClick);
}

function handleStartAutobetClick() {
  if (autoRunActive) {
    stopAutoBetProcess();
    return;
  }

  if (controlPanelMode !== "auto") {
    return;
  }

  beginAutoBetProcess();
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
  autoResetDelayMs: AUTO_RESET_DELAY_MS,

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
  getMode: () => controlPanelMode,
  onAutoSelectionChange: (count) => handleAutoSelectionChange(count),
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
    controlPanelMode = controlPanel?.getMode?.() ?? "manual";
    controlPanel.addEventListener("modechange", (event) => {
      const nextMode = event.detail?.mode === "auto" ? "auto" : "manual";
      const currentSelections = game?.getAutoSelections?.() ?? [];
      if (controlPanelMode === "auto" && Array.isArray(currentSelections)) {
        storedAutoSelections = currentSelections.map((selection) => ({
          ...selection,
        }));
      }

      controlPanelMode = nextMode;

      if (nextMode !== "auto") {
        if (autoRunActive) {
          stopAutoBetProcess();
        }
        autoSelectionCount = 0;
        setControlPanelAutoStartState(false);
        game?.clearAutoSelections?.();
        finalizeRound();
      } else {
        if (!roundActive && !autoRunActive) {
          prepareForNewRoundState({ preserveAutoSelections: true });
        }
        if (storedAutoSelections.length > 0) {
          game?.applyAutoSelections?.(storedAutoSelections, { emit: true });
        }
        handleAutoSelectionChange(storedAutoSelections.length);
      }
    });
    controlPanel.addEventListener("betvaluechange", (event) => {
      console.debug(`Bet value updated to ${event.detail.value}`);
    });
    controlPanel.addEventListener("mineschanged", (event) => {
      const mines = event.detail.value;
      opts.mines = mines;
      finalizeRound();
      storedAutoSelections = [];
      game?.clearAutoSelections?.();
      game?.setMines?.(mines);
      if (controlPanelMode === "auto" && !autoRunActive) {
        prepareForNewRoundState({ preserveAutoSelections: true });
      }
    });
    controlPanel.addEventListener("bet", handleBetButtonClick);
    controlPanel.addEventListener("randompick", handleRandomPickClick);
    controlPanel.addEventListener("startautobet", handleStartAutobetClick);
    finalizeRound();
    controlPanel.setBetAmountDisplay("$0.00");
    controlPanel.setProfitOnWinDisplay("$0.00");
    controlPanel.setProfitValue("0.00000000");
    handleAutoSelectionChange(autoSelectionCount);
  } catch (err) {
    console.error("Control panel initialization failed:", err);
  }

  // Initialize Game
  try {
    game = await createGame("#game", opts);
    window.game = game;
    autoResetDelayMs = Number(game?.getAutoResetDelay?.() ?? AUTO_RESET_DELAY_MS);
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

