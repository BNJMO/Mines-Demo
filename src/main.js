import { createGame } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";

const BASE_MULTIPLIER = 1.3;
const MULTIPLIER_GROWTH = 1.18;
const MAX_MULTIPLIER_CAP = 1027604.48;
const MIN_BET = 0.01;
const MAX_BET = 100000;
const DEFAULT_SIDE = "heads";

const GAME_CONFIG = {
  coinSize: 0.85,
};

let game;
let controlPanel;

const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;

const seeds = {
  serverSeed: cryptoObj?.randomUUID?.() ?? `server-${Date.now()}`,
  clientSeed:
    cryptoObj?.randomUUID?.() ?? `client-${Math.random().toString(16).slice(2)}`,
  nonce: 0,
};

const state = {
  balance: 1000,
  currentBet: 0,
  currentStreak: 0,
  currentMultiplier: 1,
  chosenSide: DEFAULT_SIDE,
  roundActive: false,
  awaitingDecision: false,
  awaitingChoice: false,
  autoplayActive: false,
  autoplayBaseBalance: 0,
  showAnimations: true,
  history: [],
};

function formatCurrency(value) {
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) ? numeric : 0;
  return `$${normalized.toFixed(2)}`;
}

function clampBet(bet) {
  return Math.min(Math.max(bet, MIN_BET), MAX_BET);
}

function updateDisplays() {
  controlPanel?.setBetAmountDisplay?.(formatCurrency(state.currentBet || controlPanel?.getBetValue?.() || 0));
  const potential = state.currentBet * state.currentMultiplier || 0;
  controlPanel?.setProfitOnWinDisplay?.(formatCurrency(potential));
  controlPanel?.setTotalProfitMultiplier?.(state.currentMultiplier || 1);
  controlPanel?.setProfitValue?.(potential.toFixed(8));
  game?.updateStats?.({
    balance: state.balance,
    streak: state.currentStreak,
    multiplier: state.currentMultiplier,
  });
  game?.updateHistory?.(state.history);
}

function updateStatus(message) {
  game?.updateStatus?.(message);
  console.debug("[Flip]", message);
}

function resetRoundState({ resetHistory = false } = {}) {
  state.roundActive = false;
  state.awaitingDecision = false;
  state.awaitingChoice = false;
  state.currentStreak = 0;
  state.currentMultiplier = 1;
  controlPanel?.setBetButtonMode?.("bet");
  controlPanel?.setBetButtonState?.("clickable");
  controlPanel?.setRandomPickState?.("non-clickable");
  controlPanel?.setMinesSelectState?.("non-clickable");
  if (resetHistory) {
    state.history = [];
    game?.updateHistory?.(state.history);
  }
  updateDisplays();
}

function setChosenSide(side) {
  state.chosenSide = side === "tails" ? "tails" : DEFAULT_SIDE;
  updateStatus(`Selected side: ${state.chosenSide}`);
  controlPanel?.updateGemsValue?.();
  game?.setFace?.(state.chosenSide);
}

function calculateMultiplier(streak) {
  if (streak <= 0) return 1;
  const growth = BASE_MULTIPLIER * Math.pow(MULTIPLIER_GROWTH, Math.max(0, streak - 1));
  return Math.min(growth, MAX_MULTIPLIER_CAP);
}

function recordHistory(result) {
  state.history.push(result === "heads" ? "H" : "T");
  if (state.history.length > 10) {
    state.history.splice(0, state.history.length - 10);
  }
}

function deriveOutcome() {
  seeds.nonce += 1;
  const basis = `${seeds.serverSeed}:${seeds.clientSeed}:${seeds.nonce}`;
  let entropy = 0;
  for (let i = 0; i < basis.length; i += 1) {
    entropy = (entropy + basis.charCodeAt(i) * (i + 1)) % 9973;
  }
  const roll = (entropy / 9973 + Math.random() * 0.0001) % 1;
  const result = roll < 0.5 ? "heads" : "tails";
  return { result, proof: { ...seeds, roll } };
}

async function resolveFlip({ instant = false } = {}) {
  const { result, proof } = deriveOutcome();
  updateStatus(
    `Flipping for ${state.chosenSide.toUpperCase()} (nonce ${proof.nonce})...`
  );
  await game?.playFlip?.(result, { instant });
  recordHistory(result);
  const won = result === state.chosenSide;
  if (won) {
    state.currentStreak += 1;
    state.currentMultiplier = calculateMultiplier(state.currentStreak);
    state.awaitingDecision = true;
    state.awaitingChoice = true;
    controlPanel?.setBetButtonMode?.("cashout");
    controlPanel?.setBetButtonState?.("clickable");
    controlPanel?.setRandomPickState?.("clickable");
    controlPanel?.setMinesSelectState?.("clickable");
    updateStatus(
      `Win! Landed on ${result.toUpperCase()} — streak ${state.currentStreak} at ${state.currentMultiplier.toFixed(2)}×`
    );
  } else {
    state.currentStreak = 0;
    state.currentMultiplier = 1;
    state.roundActive = false;
    state.awaitingDecision = false;
    state.awaitingChoice = false;
    controlPanel?.setBetButtonMode?.("bet");
    controlPanel?.setBetButtonState?.("clickable");
    controlPanel?.setRandomPickState?.("non-clickable");
    controlPanel?.setMinesSelectState?.("non-clickable");
    updateStatus(`Missed: landed on ${result.toUpperCase()}`);
    game?.completeBet?.({ resultText: "Round lost" });
  }

  updateDisplays();
  console.debug("Flip result", { result, proof, state: { ...state } });
  return won;
}

function canAfford(bet) {
  return state.balance >= bet;
}

function applyBetFromInput() {
  const betValue = clampBet(controlPanel?.getBetValue?.() ?? 0);
  if (betValue !== controlPanel?.getBetValue?.()) {
    controlPanel?.setBetInputValue?.(betValue);
  }
  if (betValue < MIN_BET) {
    controlPanel?.showBetAmountTooltip?.(
      `Bet must be at least ${formatCurrency(MIN_BET)}`
    );
    return null;
  }
  if (betValue > MAX_BET) {
    controlPanel?.showBetAmountTooltip?.(
      `Bet must be less than ${formatCurrency(MAX_BET)}`
    );
    return null;
  }
  if (!canAfford(betValue)) {
    controlPanel?.showBetAmountTooltip?.("Insufficient balance for this bet");
    return null;
  }
  state.currentBet = betValue;
  return betValue;
}

async function startRound({ autoPickSide } = {}) {
  if (state.roundActive) return;
  const bet = applyBetFromInput();
  if (!bet) return;

  state.roundActive = true;
  state.awaitingDecision = false;
  state.awaitingChoice = true;
  state.currentStreak = 0;
  state.currentMultiplier = 1;
  state.balance -= bet;
  controlPanel?.setBetButtonMode?.("cashout");
  controlPanel?.setBetButtonState?.("non-clickable");
  controlPanel?.setRandomPickState?.("clickable");
  controlPanel?.setMinesSelectState?.("clickable");
  game?.startBet?.({ amount: bet });
  updateStatus(
    `Betting ${formatCurrency(bet)} placed. Choose Heads or Tails to start!`
  );
  updateDisplays();
  if (autoPickSide) {
    await handleSideSelection(autoPickSide);
  }
}

function cashOut() {
  if (!state.roundActive || !state.awaitingDecision) return;
  const payout = state.currentBet * state.currentMultiplier;
  state.balance += payout;
  updateStatus(`Cashed out ${formatCurrency(payout)}`);
  game?.completeBet?.({ resultText: "Cashout complete" });
  resetRoundState();
}

async function continueStreak() {
  if (!state.roundActive || !state.awaitingDecision) return;
  state.awaitingDecision = false;
  state.awaitingChoice = false;
  controlPanel?.setBetButtonState?.("non-clickable");
  controlPanel?.setRandomPickState?.("non-clickable");
  controlPanel?.setMinesSelectState?.("non-clickable");
  await resolveFlip({ instant: !state.showAnimations });
}

function applyProgression(win) {
  const baseBet = clampBet(controlPanel?.getBetValue?.() ?? state.currentBet);
  let nextBet = baseBet;

  const onWinMode = controlPanel?.onWinMode === "increase" ? "increase" : "reset";
  const onLossMode = controlPanel?.onLossMode === "increase" ? "increase" : "reset";
  const winIncrement = Number(controlPanel?.parseBetValue?.(controlPanel?.onWinInput?.value)) || 0;
  const lossIncrement = Number(controlPanel?.parseBetValue?.(controlPanel?.onLossInput?.value)) || 0;

  if (win && onWinMode === "increase") {
    nextBet = clampBet(state.currentBet * (1 + winIncrement / 100));
  }
  if (!win && onLossMode === "increase") {
    nextBet = clampBet(state.currentBet * (1 + lossIncrement / 100));
  }

  controlPanel?.setBetInputValue?.(nextBet);
  state.currentBet = nextBet;
}

function readAutoStopValues() {
  const stopOnProfit = Number(
    controlPanel?.parseBetValue?.(controlPanel?.autoStopOnProfitField?.input?.value)
  );
  const stopOnLoss = Number(
    controlPanel?.parseBetValue?.(controlPanel?.autoStopOnLossField?.input?.value)
  );
  return {
    stopOnProfit: Number.isFinite(stopOnProfit) ? stopOnProfit : 0,
    stopOnLoss: Number.isFinite(stopOnLoss) ? stopOnLoss : 0,
  };
}

async function autoplay() {
  if (state.autoplayActive) return;
  const flipsTarget = controlPanel?.getNumberOfBetsValue?.() || 0;
  if (flipsTarget <= 0) return;

  const initialBalance = state.balance;
  const { stopOnProfit, stopOnLoss } = readAutoStopValues();
  state.autoplayActive = true;
  state.autoplayBaseBalance = initialBalance;
  controlPanel?.setAutoStartButtonMode?.("stop");
  controlPanel?.setInteractable?.(false);
  controlPanel?.setAutoStartButtonState?.("clickable");

  for (let i = 0; i < flipsTarget && state.autoplayActive; i += 1) {
    await startRound({ autoPickSide: state.chosenSide });
    if (!state.roundActive) {
      applyProgression(false);
      continue;
    }

    if (state.awaitingDecision) {
      // Autoplay always cashes out after each win
      cashOut();
      applyProgression(true);
    } else {
      applyProgression(false);
    }

    const profit = state.balance - initialBalance;
    if (stopOnProfit > 0 && profit >= stopOnProfit) {
      updateStatus("Autoplay stopped: profit target reached");
      break;
    }
    if (stopOnLoss > 0 && -profit >= stopOnLoss) {
      updateStatus("Autoplay stopped: loss limit reached");
      break;
    }
  }

  state.autoplayActive = false;
  controlPanel?.setAutoStartButtonMode?.("start");
  controlPanel?.setInteractable?.(true);
  updateDisplays();
}

function stopAutoplay() {
  state.autoplayActive = false;
  controlPanel?.setAutoStartButtonMode?.("start");
  controlPanel?.setInteractable?.(true);
}

function handleBetButtonClick() {
  if (state.autoplayActive) return;
  if (!state.roundActive) {
    startRound();
    return;
  }

  cashOut();
}

function handleRandomPickClick() {
  if (state.autoplayActive) return;
  const side = Math.random() < 0.5 ? "heads" : "tails";
  controlPanel?.setMinesValue?.(side);
}

async function handleSideSelection(side) {
  setChosenSide(side);
  if (!state.roundActive || !state.awaitingChoice) return;
  state.awaitingChoice = false;
  state.awaitingDecision = false;
  controlPanel?.setBetButtonState?.("non-clickable");
  controlPanel?.setRandomPickState?.("non-clickable");
  controlPanel?.setMinesSelectState?.("non-clickable");
  await resolveFlip({ instant: !state.showAnimations });
}

function handleStartAutobetClick() {
  if (state.autoplayActive) {
    stopAutoplay();
    return;
  }
  autoplay();
}

function bindControlPanelEvents() {
  controlPanel.addEventListener("bet", handleBetButtonClick);
  controlPanel.addEventListener("randompick", handleRandomPickClick);
  controlPanel.addEventListener("startautobet", handleStartAutobetClick);
  controlPanel.addEventListener("animationschange", (event) => {
    const enabled = Boolean(event.detail?.enabled);
    state.showAnimations = enabled;
    game?.setAnimationsEnabled?.(enabled);
  });
  controlPanel.addEventListener("mineschanged", (event) => {
    const side = event.detail?.value;
    handleSideSelection(side);
  });
  controlPanel.addEventListener("betvaluechange", (event) => {
    const betAmount = event.detail?.numericValue ?? event.detail?.value ?? 0;
    if (!state.roundActive) {
      state.currentBet = betAmount;
      updateDisplays();
    }
  });
}

(async () => {
  controlPanel = new ControlPanel("#control-panel", {
    gameName: "Flip",
    minesLabel: "Choose Side",
    gemsLabel: "Your Pick",
    minesChoices: [
      { value: "heads", label: "Heads" },
      { value: "tails", label: "Tails" },
    ],
    initialMines: DEFAULT_SIDE,
    totalTiles: 2,
    maxMines: 2,
  });

  bindControlPanelEvents();
  state.currentBet = controlPanel.getBetValue?.() ?? MIN_BET;
  updateDisplays();

  game = await createGame("#game", { coinSize: GAME_CONFIG.coinSize });
  game?.setAnimationsEnabled?.(controlPanel.getAnimationsEnabled?.());
  state.showAnimations = Boolean(controlPanel.getAnimationsEnabled?.());

  setChosenSide(controlPanel?.getMinesValue?.() ?? DEFAULT_SIDE);
  resetRoundState({ resetHistory: true });
  game?.updateStatus?.("Choose heads or tails and place your bet.");
  game?.setFace?.(state.chosenSide);
})();
