import { createGame } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";

const BASE_MULTIPLIER = 1.3;
const MULTIPLIER_GROWTH = 1.18;
const MAX_MULTIPLIER_CAP = 1027604.48;
const MIN_BET = 0.01;
const MAX_BET = 100000;

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
  roundActive: false,
  awaitingDecision: false,
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

function resetRoundState() {
  state.roundActive = false;
  state.awaitingDecision = false;
  state.currentStreak = 0;
  state.currentMultiplier = 1;
  controlPanel?.setBetButtonMode?.("bet");
  controlPanel?.setRandomPickState?.("clickable");
  updateDisplays();
  game?.reset?.();
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
  updateStatus(`Flipping coin (nonce ${proof.nonce})...`);
  await game?.playFlip?.(result, { instant });
  recordHistory(result);
  const won = result === "heads";
  if (won) {
    state.currentStreak += 1;
    state.currentMultiplier = calculateMultiplier(state.currentStreak);
    state.awaitingDecision = true;
    controlPanel?.setBetButtonMode?.("cashout");
    controlPanel?.setRandomPickState?.("clickable");
    updateStatus(`Win! Streak ${state.currentStreak} @ ${state.currentMultiplier.toFixed(2)}×`);
  } else {
    state.currentStreak = 0;
    state.currentMultiplier = 1;
    state.roundActive = false;
    state.awaitingDecision = false;
    controlPanel?.setBetButtonMode?.("bet");
    controlPanel?.setRandomPickState?.("clickable");
    updateStatus("Loss - round over");
    game?.completeBet?.({ resultText: "You lost" });
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

async function startRound() {
  if (state.roundActive) return;
  const bet = applyBetFromInput();
  if (!bet) return;

  state.roundActive = true;
  state.awaitingDecision = false;
  state.currentStreak = 0;
  state.currentMultiplier = 1;
  state.balance -= bet;
  controlPanel?.setBetButtonMode?.("cashout");
  controlPanel?.setRandomPickState?.("non-clickable");
  game?.startBet?.({ amount: bet });
  updateDisplays();
  await resolveFlip({ instant: !state.showAnimations });
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
  controlPanel?.setRandomPickState?.("non-clickable");
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
    await startRound();
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
  if (state.awaitingDecision) {
    continueStreak();
    return;
  }
  startRound();
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
    minesLabel: "Flip Choice",
    gemsLabel: "Recent Results",
    totalTiles: 3,
    maxMines: 2,
  });
  if (controlPanel?.randomPickButton) {
    controlPanel.randomPickButton.textContent = "Flip Again";
  }

  bindControlPanelEvents();
  state.currentBet = controlPanel.getBetValue?.() ?? MIN_BET;
  updateDisplays();

  game = await createGame("#game", {});
  game?.setAnimationsEnabled?.(controlPanel.getAnimationsEnabled?.());
  state.showAnimations = Boolean(controlPanel.getAnimationsEnabled?.());

  resetRoundState();
})();
