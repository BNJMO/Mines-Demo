import { createGame } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";
import { ServerRelay } from "./serverRelay.js";
import { createServerDummy } from "./serverDummy/serverDummy.js";

import cardType0Url from "../assets/sprites/cardType_0.png";
import cardType1Url from "../assets/sprites/cardType_1.png";
import cardType2Url from "../assets/sprites/cardType_2.png";
import cardType3Url from "../assets/sprites/cardType_3.png";
import cardType4Url from "../assets/sprites/cardType_4.png";
import cardType5Url from "../assets/sprites/cardType_5.png";
import explosionSheetUrl from "../assets/sprites/Explosion_Spritesheet.png";
import tileTapDownSoundUrl from "../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../assets/sounds/TileHover.wav";
import diamondRevealedSoundUrl from "../assets/sounds/DiamondRevealed.wav";
import lostSoundUrl from "../assets/sounds/Lost.wav";
import winSoundUrl from "../assets/sounds/Win.wav";
import gameStartSoundUrl from "../assets/sounds/GameStart.wav";

let game;
let controlPanel;
let demoMode = true;
const serverRelay = new ServerRelay();
let serverDummyUI = null;
let suppressRelay = false;
let betButtonMode = "bet";
let roundActive = false;
let cashoutAvailable = false;
let lastKnownGameState = null;
let selectionDelayHandle = null;
let selectionPending = false;
let cardTypeSelectionLocked = false;
let controlPanelMode = "manual";
let autoSelectionCount = 0;
let storedAutoSelections = [];
let autoRunActive = false;
let autoRunFlag = false;
let autoRoundInProgress = false;
let autoBetsRemaining = Infinity;
let autoResetTimer = null;
let autoStopShouldComplete = false;
let autoStopFinishing = false;
let manualRoundNeedsReset = false;

let totalProfitMultiplierValue = 1;
let totalProfitAmountDisplayValue = "0.00000000";

const AUTO_RESET_DELAY_MS = 1500;
let autoResetDelayMs = AUTO_RESET_DELAY_MS;

const SERVER_RESPONSE_DELAY_MS = 250;
const MIN_CARD_TYPES = 5;

function withRelaySuppressed(callback) {
  suppressRelay = true;
  try {
    return callback?.();
  } finally {
    suppressRelay = false;
  }
}

function coerceNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (value != null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function setTotalProfitMultiplierValue(value) {
  const numeric = coerceNumericValue(value);
  const normalized = numeric != null && numeric > 0 ? numeric : 1;
  totalProfitMultiplierValue = normalized;
  controlPanel?.setTotalProfitMultiplier?.(normalized);
}

function normalizeTotalProfitAmount(value) {
  const numeric = coerceNumericValue(value);
  if (numeric != null) {
    const clamped = Math.max(0, numeric);
    return clamped.toFixed(8);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "0.00000000";
}

function setTotalProfitAmountValue(value) {
  const normalized = normalizeTotalProfitAmount(value);
  totalProfitAmountDisplayValue = normalized;
  controlPanel?.setProfitValue?.(normalized);
}

function sendRelayMessage(type, payload = {}) {
  if (demoMode || suppressRelay) {
    return;
  }
  serverRelay.send(type, payload);
}

function setDemoMode(value) {
  const next = Boolean(value);
  if (demoMode === next) {
    serverRelay.setDemoMode(next);
    serverDummyUI?.setDemoMode?.(next);
    return;
  }

  demoMode = next;
  serverRelay.setDemoMode(next);
  serverDummyUI?.setDemoMode?.(next);

  if (demoMode) {
    clearSelectionDelay();
  }
}

function applyServerReveal(payload = {}) {
  const result = String(payload?.result ?? "").toLowerCase();
  clearSelectionDelay();
  selectionPending = false;
  if (result === "lost") {
    game?.SetSelectedCardIsBomb?.();
  } else {
    game?.setSelectedCardIsDiamond?.();
  }
}

function applyAutoResultsFromServer(results = []) {
  clearSelectionDelay();
  selectionPending = false;
  if (!Array.isArray(results) || results.length === 0) {
    return;
  }
  game?.revealAutoSelections?.(results);
}

const serverDummyMount =
  document.querySelector(".app-wrapper") ?? document.body;
serverDummyUI = createServerDummy(serverRelay, {
  mount: serverDummyMount,
  onDemoModeToggle: (value) => setDemoMode(value),
  initialDemoMode: demoMode,
  initialHidden: true,
  onVisibilityChange: (isVisible) => {
    controlPanel?.setDummyServerPanelVisibility?.(isVisible);
  },
});
controlPanel?.setDummyServerPanelVisibility?.(
  serverDummyUI?.isVisible?.() ?? false
);
serverRelay.setDemoMode(demoMode);

serverRelay.addEventListener("incoming", (event) => {
  const { type, payload } = event.detail ?? {};
  withRelaySuppressed(() => {
    switch (type) {
      case "start-bet":
        performBet();
        setControlPanelRandomState(true);
        break;
      case "bet-result":
        applyServerReveal(payload);
        break;
      case "auto-bet-result":
        applyAutoResultsFromServer(payload?.results);
        break;
      case "stop-autobet":
        stopAutoBetProcess({ completed: Boolean(payload?.completed) });
        break;
      case "finalize-bet":
        finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
        break;
      case "cashout":
        if (roundActive && cashoutAvailable) {
          handleCashout();
        }
        break;
      case "profit:update-multiplier": {
        const incomingValue =
          payload?.numericValue ?? payload?.value ?? null;
        setTotalProfitMultiplierValue(incomingValue);
        break;
      }
      case "profit:update-total": {
        const incomingValue =
          payload?.numericValue ?? payload?.value ?? null;
        setTotalProfitAmountValue(incomingValue);
        break;
      }
      default:
        break;
    }
  });
});

serverRelay.addEventListener("demomodechange", (event) => {
  const value = Boolean(event.detail?.value);
  if (demoMode === value) {
    return;
  }
  demoMode = value;
  serverDummyUI?.setDemoMode?.(value);
  if (demoMode) {
    clearSelectionDelay();
  }
});

function setControlPanelBetMode(mode) {
  betButtonMode = mode === "bet" ? "bet" : "cashout";
  controlPanel?.setBetButtonMode?.(betButtonMode);
}

function setControlPanelBetState(isClickable) {
  controlPanel?.setBetButtonState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelRandomState(isClickable) {
  controlPanel?.setRandomPickState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelRevealAllState(isClickable) {
  controlPanel?.setRevealAllButtonState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelAutoStartState(isClickable) {
  const shouldEnable = isClickable && !autoStopFinishing;
  controlPanel?.setAutoStartButtonState?.(
    shouldEnable ? "clickable" : "non-clickable"
  );
}

function setControlPanelCardTypeState(isClickable) {
  controlPanel?.setCardTypeSelectState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function disableServerRoundSetupControls() {
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
  setControlPanelRevealAllState(false);
  setControlPanelCardTypeState(false);
  controlPanel?.setModeToggleClickable?.(false);
  controlPanel?.setBetControlsClickable?.(false);
}

function normalizeCardTypeValue(value, minCardTypes, maxCardTypes) {
  const numeric = Math.floor(Number(value));
  const fallbackMin = Number.isFinite(minCardTypes)
    ? Math.max(1, minCardTypes)
    : 1;
  let cardTypes = Number.isFinite(numeric) ? numeric : fallbackMin;
  cardTypes = Math.max(fallbackMin, cardTypes);
  if (Number.isFinite(maxCardTypes)) {
    cardTypes = Math.min(cardTypes, maxCardTypes);
  }
  return cardTypes;
}

function applyCardTypeOption(value, { syncGame = false } = {}) {
  const minCardTypes = controlPanel?.getMinCardTypes?.();
  const maxCardTypes = controlPanel?.getMaxCardTypes?.();
  const cardTypes = normalizeCardTypeValue(value, minCardTypes, maxCardTypes);

  opts.cardTypes = cardTypes;
  opts.mines = cardTypes;

  if (syncGame) {
    if (typeof game?.setMines === "function") {
      game.setMines(cardTypes);
    } else {
      game?.reset?.();
    }
  }

  return cardTypes;
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
  setControlPanelRevealAllState(false);
}

function setAutoRunUIState(active) {
  if (!controlPanel) {
    return;
  }

  if (active) {
    if (autoStopFinishing) {
      controlPanel.setAutoStartButtonMode?.("finish");
      setControlPanelAutoStartState(false);
    } else {
      controlPanel.setAutoStartButtonMode?.("stop");
      setControlPanelAutoStartState(true);
    }
    controlPanel.setModeToggleClickable?.(false);
    controlPanel.setBetControlsClickable?.(false);
    setControlPanelCardTypeState(false);
    setControlPanelRevealAllState(false);
    controlPanel.setNumberOfBetsClickable?.(false);
    controlPanel.setAdvancedToggleClickable?.(false);
    controlPanel.setAdvancedStrategyControlsClickable?.(false);
    controlPanel.setStopOnProfitClickable?.(false);
    controlPanel.setStopOnLossClickable?.(false);
  } else {
    controlPanel.setAutoStartButtonMode?.("start");
    autoStopFinishing = false;
    setControlPanelAutoStartState(true);
    controlPanel.setModeToggleClickable?.(true);
    controlPanel.setBetControlsClickable?.(true);
    controlPanel.setNumberOfBetsClickable?.(true);
    controlPanel.setAdvancedToggleClickable?.(true);
    controlPanel.setAdvancedStrategyControlsClickable?.(true);
    controlPanel.setStopOnProfitClickable?.(true);
    controlPanel.setStopOnLossClickable?.(true);
    if (roundActive && !cardTypeSelectionLocked) {
      setControlPanelCardTypeState(true);
    }
    if (roundActive && !selectionPending) {
      setControlPanelRevealAllState(true);
    } else {
      setControlPanelRevealAllState(false);
    }
    handleAutoSelectionChange(autoSelectionCount);
  }
}

function startAutoRoundIfNeeded() {
  if (storedAutoSelections.length === 0) {
    return false;
  }

  if (!roundActive) {
    game?.reset?.({ preserveAutoSelections: true });
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

  const selections = storedAutoSelections.map((selection) => ({
    ...selection,
  }));
  if (selections.length === 0) {
    stopAutoBetProcess();
    return;
  }

  autoRoundInProgress = true;
  selectionPending = true;
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
  setControlPanelCardTypeState(false);
  setGameBoardInteractivity(false);
  setControlPanelAutoStartState(true);

  clearSelectionDelay();

  if (!demoMode && !suppressRelay) {
    const payload = {
      selections: selections.map((selection) => ({
        ...selection,
      })),
    };
    sendRelayMessage("game:auto-round-request", payload);
    return;
  }

  const results = [];
  let lossAssigned = false;

  for (const selection of selections) {
    const triggerLoss = !lossAssigned && Math.random() < 0.15;
    if (triggerLoss) {
      lossAssigned = true;
    }
    results.push({
      row: selection.row,
      col: selection.col,
      result: triggerLoss ? "lost" : "won",
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

    if (!autoRunFlag || autoStopShouldComplete) {
      if (
        !demoMode &&
        !suppressRelay &&
        controlPanelMode === "auto" &&
        autoStopFinishing
      ) {
        return;
      }

      const completed = autoStopShouldComplete;
      autoStopShouldComplete = false;
      stopAutoBetProcess({ completed });
      return;
    }

    autoStopFinishing = false;
    setAutoRunUIState(true);
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
    const shouldSignalCompletion = !autoStopShouldComplete;
    autoRunFlag = false;
    autoStopShouldComplete = true;
    autoStopFinishing = true;
    setAutoRunUIState(true);

    if (shouldSignalCompletion && !demoMode && !suppressRelay) {
      sendRelayMessage("action:stop-autobet", {
        reason: "completed",
        completed: true,
      });
    }
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

  autoRunFlag = true;
  autoRunActive = true;
  autoRoundInProgress = false;
  autoStopShouldComplete = false;
  autoStopFinishing = false;

  if (!demoMode && !suppressRelay) {
    const createAutobetPayload = () => ({
      selections: storedAutoSelections.map((selection) => ({
        ...selection,
      })),
      numberOfBets: Number.isFinite(autoBetsRemaining)
        ? autoBetsRemaining
        : 0,
    });
    sendRelayMessage("control:start-autobet", createAutobetPayload());
    sendRelayMessage("action:start-autobet", createAutobetPayload());
  }

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
  autoRunFlag = false;
  autoRoundInProgress = false;
  autoStopShouldComplete = false;
  if (!wasActive && !completed) {
    autoStopFinishing = false;
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

  finalizeRound({ preserveAutoSelections: shouldPreserveSelections });

  game?.reset?.({ preserveAutoSelections: shouldPreserveSelections });

  autoStopFinishing = false;
  setAutoRunUIState(false);

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
    setControlPanelRevealAllState(false);
    cashoutAvailable = (state?.revealedSafe ?? 0) > 0;
    return;
  }

  const hasRevealedSafe = (state?.revealedSafe ?? 0) > 0;
  cashoutAvailable = hasRevealedSafe;
  setControlPanelBetState(hasRevealedSafe);
  setControlPanelRandomState(true);
  setControlPanelRevealAllState(true);
}

function prepareForNewRoundState({ preserveAutoSelections = false } = {}) {
  roundActive = true;
  cashoutAvailable = false;
  clearSelectionDelay();
  setControlPanelBetMode("cashout");
  setControlPanelBetState(false);
  setControlPanelRandomState(true);
  setControlPanelRevealAllState(true);
  setGameBoardInteractivity(true);
  cardTypeSelectionLocked = false;

  if (controlPanelMode !== "auto") {
    manualRoundNeedsReset = false;
    setControlPanelCardTypeState(false);
    controlPanel?.setModeToggleClickable?.(false);
    controlPanel?.setBetControlsClickable?.(false);
  } else if (!autoRunActive) {
    setControlPanelCardTypeState(true);
    controlPanel?.setModeToggleClickable?.(true);
    controlPanel?.setBetControlsClickable?.(true);
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
  setControlPanelRevealAllState(false);
  setGameBoardInteractivity(false);
  cardTypeSelectionLocked = false;
  setControlPanelCardTypeState(true);

  if (autoRunActive) {
    setControlPanelBetState(false);
    setControlPanelCardTypeState(false);
    controlPanel?.setModeToggleClickable?.(false);
    controlPanel?.setBetControlsClickable?.(false);
  } else {
    setControlPanelBetState(true);
    setControlPanelCardTypeState(true);
    controlPanel?.setModeToggleClickable?.(true);
    controlPanel?.setBetControlsClickable?.(true);
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

function markManualRoundForReset() {
  if (controlPanelMode === "manual") {
    manualRoundNeedsReset = true;
  }
}

function handleCashout() {
  if (!roundActive || !cashoutAvailable) {
    return;
  }

  if (!demoMode && !suppressRelay) {
    sendRelayMessage("action:cashout", {});
    return;
  }

  markManualRoundForReset();
  game?.revealRemainingTiles?.();
  showCashoutPopup();
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
}

function performBet() {
  applyCardTypeOption(controlPanel?.getCardTypeValue?.(), {
    syncGame: true,
  });
  prepareForNewRoundState();
  manualRoundNeedsReset = false;
}

function handleBet() {
  if (!demoMode && !suppressRelay) {
    disableServerRoundSetupControls();
    const cardTypes = controlPanel?.getCardTypeValue?.();
    sendRelayMessage("action:bet", {
      bet: controlPanel?.getBetValue?.(),
      cardTypes,
      mines: cardTypes,
    });
    return;
  }

  performBet();
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
  markManualRoundForReset();
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
  handleAutoRoundFinished();
}

function handleGameWin() {
  markManualRoundForReset();
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
  handleAutoRoundFinished();
}

function handleRandomPickClick() {
  if (!roundActive || selectionPending) {
    return;
  }

  game?.selectRandomTile?.();
}

function handleRevealAllClick() {
  if (!roundActive) {
    return;
  }

  setControlPanelRevealAllState(false);

  if (!demoMode && !suppressRelay) {
    sendRelayMessage("action:reveal-all", {});
    return;
  }

  markManualRoundForReset();
  game?.revealRemainingTiles?.();
  finalizeRound({ preserveAutoSelections: controlPanelMode === "auto" });
}

function handleCardSelected(selection) {
  if (!roundActive) {
    return;
  }

  if (controlPanelMode === "auto") {
    return;
  }

  if (!cardTypeSelectionLocked) {
    cardTypeSelectionLocked = true;
    setControlPanelCardTypeState(false);
  }

  beginSelectionDelay();

  if (!demoMode && !suppressRelay) {
    const payload = {
      row: selection?.row,
      col: selection?.col,
    };
    sendRelayMessage("game:manual-selection", payload);
    return;
  }

  selectionDelayHandle = setTimeout(() => {
    selectionDelayHandle = null;

    if (!roundActive) {
      selectionPending = false;
      return;
    }

    const triggerLoss = Math.random() < 0.15;

    if (triggerLoss) {
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
        storedAutoSelections = selections.map((selection) => ({
          ...selection,
        }));
      } else if (!autoRunActive && !autoRoundInProgress) {
        storedAutoSelections = selections.map((selection) => ({
          ...selection,
        }));
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

  if (count > 0 && !cardTypeSelectionLocked) {
    cardTypeSelectionLocked = true;
    setControlPanelCardTypeState(false);
  } else if (count === 0 && !autoRunActive) {
    cardTypeSelectionLocked = false;
    setControlPanelCardTypeState(true);
  }

  if (autoRunActive) {
    setControlPanelAutoStartState(!autoStopFinishing);
    return;
  }

  const canClick = count > 0 && !selectionPending;
  setControlPanelAutoStartState(canClick);

  if (!demoMode && !suppressRelay && controlPanelMode === "auto") {
    const selectionsToSend = storedAutoSelections.map((selection) => ({
      ...selection,
    }));
    sendRelayMessage("game:auto-selections", {
      selections: selectionsToSend,
    });
  }
}

function handleStartAutobetClick() {
  if (autoRunActive) {
    if (!autoStopFinishing) {
      autoRunFlag = false;
      autoStopFinishing = true;
      setAutoRunUIState(true);
      sendRelayMessage("action:stop-autobet", { reason: "user" });
    }
    return;
  }

  if (controlPanelMode !== "auto") {
    return;
  }

  beginAutoBetProcess();
}

function showCashoutPopup() {
  game?.showWinPopup?.(
    totalProfitMultiplierValue,
    totalProfitAmountDisplayValue
  );
}
const opts = {
  // Window visuals
  size: 600,
  backgroundColor: "#091B26",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",

  // Game setup
  grid: 3,
  mines: MIN_CARD_TYPES,
  autoResetDelayMs: AUTO_RESET_DELAY_MS,

  // Visuals
  cardTexturePaths: [
    cardType0Url,
    cardType1Url,
    cardType2Url,
    cardType3Url,
    cardType4Url,
    cardType5Url,
  ],
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
  disableAnimations: false,

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
  lossSoundPath: lostSoundUrl,
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
  onCardSelected: (selection) => handleCardSelected(selection),
  onWin: handleGameWin,
  onGameOver: handleGameOver,
  onChange: handleGameStateChange,
};

(async () => {
  const totalTiles = opts.grid * opts.grid;
  const maxInitialCardTypes = Math.max(MIN_CARD_TYPES, totalTiles - 1);
  const initialCardTypes = Math.max(
    MIN_CARD_TYPES,
    Math.min(opts.mines ?? MIN_CARD_TYPES, maxInitialCardTypes)
  );
  opts.mines = initialCardTypes;
  opts.cardTypes = initialCardTypes;

  // Initialize Control Panel
  try {
    controlPanel = new ControlPanel("#control-panel", {
      gameName: "Scratch Card",
      initialCardTypes,
      minCardTypes: MIN_CARD_TYPES,
    });
    controlPanelMode = controlPanel?.getMode?.() ?? "manual";
    controlPanel.addEventListener("modechange", (event) => {
      const nextMode = event.detail?.mode === "auto" ? "auto" : "manual";
      const previousMode = controlPanelMode;
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
        if (previousMode === "manual" && manualRoundNeedsReset) {
          game?.reset?.({ preserveAutoSelections: true });
          manualRoundNeedsReset = false;
        }
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
      sendRelayMessage("control:bet-value", {
        value: event.detail?.value,
        numericValue: event.detail?.numericValue,
      });
    });
    controlPanel.addEventListener("cardtypeschanged", (event) => {
      const shouldSyncGame =
        controlPanelMode === "auto" && !autoRunActive && !autoRoundInProgress;

      const nextValue = applyCardTypeOption(event.detail?.value, {
        syncGame: shouldSyncGame,
      });
      sendRelayMessage("control:card-types", {
        value: event.detail?.value ?? nextValue,
        normalizedValue: nextValue,
        min: event.detail?.minCardTypes,
        max: event.detail?.maxCardTypes,
      });
      sendRelayMessage("control:mines", {
        value: nextValue,
      });
    });
    controlPanel.addEventListener("numberofbetschange", (event) => {
      sendRelayMessage("control:number-of-bets", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("strategychange", (event) => {
      sendRelayMessage("control:strategy-mode", {
        key: event.detail?.key,
        mode: event.detail?.mode,
      });
    });
    controlPanel.addEventListener("strategyvaluechange", (event) => {
      sendRelayMessage("control:strategy-value", {
        key: event.detail?.key,
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("stoponprofitchange", (event) => {
      sendRelayMessage("control:stop-on-profit", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("stoponlosschange", (event) => {
      sendRelayMessage("control:stop-on-loss", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("animationschange", (event) => {
      const enabled = Boolean(event.detail?.enabled);
      opts.disableAnimations = !enabled;
      game?.setAnimationsEnabled?.(enabled);
    });
    controlPanel.addEventListener("showdummyserver", () => {
      serverDummyUI?.show?.();
    });
    controlPanel.addEventListener("bet", handleBetButtonClick);
    controlPanel.addEventListener("randompick", handleRandomPickClick);
    controlPanel.addEventListener("revealall", handleRevealAllClick);
    controlPanel.addEventListener("startautobet", handleStartAutobetClick);
    finalizeRound();
    controlPanel.setBetAmountDisplay("$0.00");
    setTotalProfitMultiplierValue(0.0);
    controlPanel.setProfitOnWinDisplay("$0.00");
    setTotalProfitAmountValue("0.00000000");
    handleAutoSelectionChange(autoSelectionCount);
    opts.disableAnimations = !(controlPanel.getAnimationsEnabled?.() ?? true);
    controlPanel.setDummyServerPanelVisibility(
      serverDummyUI?.isVisible?.() ?? false
    );
  } catch (err) {
    console.error("Control panel initialization failed:", err);
  }

  // Initialize Game
  try {
    game = await createGame("#game", opts);
    window.game = game;
    autoResetDelayMs = Number(
      game?.getAutoResetDelay?.() ?? AUTO_RESET_DELAY_MS
    );
    const state = game?.getState?.();
    if (state) {
      controlPanel?.setCardTypeValue?.(state.mines, { emit: false });
    }
    const animationsEnabled = controlPanel?.getAnimationsEnabled?.();
    if (animationsEnabled != null) {
      game?.setAnimationsEnabled?.(Boolean(animationsEnabled));
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
