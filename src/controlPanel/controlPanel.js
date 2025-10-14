import { Stepper } from "../stepper/stepper.js";
import bitcoinIconUrl from "../../assets/sprites/BitCoin.png";

function resolveMount(mount) {
  if (!mount) {
    throw new Error("Control panel mount target is required");
  }
  if (typeof mount === "string") {
    const element = document.querySelector(mount);
    if (!element) {
      throw new Error(`Control panel mount '${mount}' not found`);
    }
    return element;
  }
  return mount;
}

function clampToZero(value) {
  return Math.max(0, value);
}

export class ControlPanel extends EventTarget {
  constructor(mount, options = {}) {
    super();
    this.options = {
      betAmountLabel: options.betAmountLabel ?? "Bet Amount",
      profitOnWinLabel: options.profitOnWinLabel ?? "Profit on Win",
      initialBetValue: options.initialBetValue ?? "0.00000000",
      initialBetAmountDisplay: options.initialBetAmountDisplay ?? "$0.00",
      initialProfitOnWinDisplay: options.initialProfitOnWinDisplay ?? "$0.00",
      initialProfitValue: options.initialProfitValue ?? "0.00000000",
      initialMode: options.initialMode ?? "manual",
      gameName: options.gameName ?? "Game Name",
      minesLabel: options.minesLabel ?? "Mines",
      gemsLabel: options.gemsLabel ?? "Gems",
      initialMines: options.initialMines ?? 1,
      maxMines: options.maxMines,
      totalTiles: options.totalTiles,
    };

    this.host = resolveMount(mount);
    this.host.innerHTML = "";

    this.mode = this.options.initialMode === "auto" ? "auto" : "manual";

    this.betButtonMode = "bet";
    this.betButtonState = "clickable";
    this.randomPickButtonState = "clickable";

    const totalTilesOption = Number(this.options.totalTiles);
    const normalizedTotalTiles =
      Number.isFinite(totalTilesOption) && totalTilesOption > 0
        ? Math.floor(totalTilesOption)
        : NaN;
    this.totalTiles = normalizedTotalTiles >= 2 ? normalizedTotalTiles : 2;

    const maxMinesOption = Number(this.options.maxMines);
    const fallbackMax = this.totalTiles - 1;
    const normalizedMaxMines =
      Number.isFinite(maxMinesOption) && maxMinesOption > 0
        ? Math.floor(maxMinesOption)
        : fallbackMax;
    this.maxMines = Math.max(
      1,
      Math.min(normalizedMaxMines, this.totalTiles - 1)
    );
    this.currentMines = Math.max(
      1,
      Math.min(Math.floor(Number(this.options.initialMines) || 1), this.maxMines)
    );

    this.container = document.createElement("div");
    this.container.className = "control-panel";
    this.host.appendChild(this.container);

    this.buildToggle();
    this.buildBetAmountDisplay();
    this.buildBetControls();
    this.buildMinesLabel();
    this.buildMinesSelect();
    this.buildGemsLabel();
    this.buildGemsDisplay();
    this.buildBetButton();
    this.buildRandomPickButton();
    this.buildProfitOnWinDisplay();
    this.buildProfitDisplay();
    this.buildGameName();

    this.setBetAmountDisplay(this.options.initialBetAmountDisplay);
    this.setProfitOnWinDisplay(this.options.initialProfitOnWinDisplay);
    this.setProfitValue(this.options.initialProfitValue);
    this.setBetInputValue(this.options.initialBetValue, { emit: false });
    this.refreshMinesOptions({ emit: false });
    this.updateModeButtons();
  }

  buildToggle() {
    this.toggleWrapper = document.createElement("div");
    this.toggleWrapper.className = "control-toggle";

    this.manualButton = document.createElement("button");
    this.manualButton.type = "button";
    this.manualButton.className = "control-toggle-btn";
    this.manualButton.textContent = "Manual";
    this.manualButton.addEventListener("click", () => this.setMode("manual"));

    this.autoButton = document.createElement("button");
    this.autoButton.type = "button";
    this.autoButton.className = "control-toggle-btn";
    this.autoButton.textContent = "Auto";
    this.autoButton.addEventListener("click", () => this.setMode("auto"));

    this.toggleWrapper.append(this.manualButton, this.autoButton);
    this.container.appendChild(this.toggleWrapper);
  }

  buildBetAmountDisplay() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.betAmountLabel;
    row.appendChild(label);

    this.betAmountValue = document.createElement("span");
    this.betAmountValue.className = "control-row-value";
    row.appendChild(this.betAmountValue);

    this.container.appendChild(row);
  }

  buildBetControls() {
    this.betBox = document.createElement("div");
    this.betBox.className = "control-bet-box";

    this.betInputWrapper = document.createElement("div");
    this.betInputWrapper.className = "control-bet-input-field has-stepper";
    this.betBox.appendChild(this.betInputWrapper);

    this.betInput = document.createElement("input");
    this.betInput.type = "text";
    this.betInput.inputMode = "decimal";
    this.betInput.spellcheck = false;
    this.betInput.autocomplete = "off";
    this.betInput.setAttribute("aria-label", this.options.betAmountLabel);
    this.betInput.className = "control-bet-input";
    this.betInput.addEventListener("input", () => this.dispatchBetValueChange());
    this.betInput.addEventListener("blur", () => {
      this.setBetInputValue(this.betInput.value);
    });
    this.betInputWrapper.appendChild(this.betInput);

    const icon = document.createElement("img");
    icon.src = bitcoinIconUrl;
    icon.alt = "";
    icon.className = "control-bet-input-icon";
    this.betInputWrapper.appendChild(icon);

    this.betStepper = new Stepper({
      onStepUp: () => this.adjustBetValue(1e-8),
      onStepDown: () => this.adjustBetValue(-1e-8),
      upAriaLabel: "Increase bet amount",
      downAriaLabel: "Decrease bet amount",
    });
    this.betInputWrapper.appendChild(this.betStepper.element);

    this.halfButton = document.createElement("button");
    this.halfButton.type = "button";
    this.halfButton.className = "control-bet-action";
    this.halfButton.textContent = "½";
    this.halfButton.setAttribute("aria-label", "Halve bet value");
    this.halfButton.addEventListener("click", () => this.scaleBetValue(0.5));

    this.doubleButton = document.createElement("button");
    this.doubleButton.type = "button";
    this.doubleButton.className = "control-bet-action";
    this.doubleButton.textContent = "2×";
    this.doubleButton.setAttribute("aria-label", "Double bet value");
    this.doubleButton.addEventListener("click", () => this.scaleBetValue(2));

    const separator = document.createElement("div");
    separator.className = "control-bet-separator";

    this.betBox.append(
      this.betInputWrapper,
      this.halfButton,
      separator,
      this.doubleButton
    );
    this.container.appendChild(this.betBox);
  }

  buildMinesLabel() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.minesLabel;
    row.appendChild(label);

    this.container.appendChild(row);
  }

  buildMinesSelect() {
    this.minesSelectWrapper = document.createElement("div");
    this.minesSelectWrapper.className = "control-select-field";

    this.minesSelect = document.createElement("select");
    this.minesSelect.className = "control-select";
    this.minesSelect.setAttribute("aria-label", this.options.minesLabel);
    this.minesSelect.addEventListener("change", () => {
      const value = Math.floor(Number(this.minesSelect.value) || 1);
      this.currentMines = Math.max(1, Math.min(value, this.maxMines));
      this.updateGemsValue();
      this.dispatchMinesChange();
    });

    this.minesSelectWrapper.appendChild(this.minesSelect);

    const arrow = document.createElement("span");
    arrow.className = "control-select-arrow";
    arrow.setAttribute("aria-hidden", "true");
    this.minesSelectWrapper.appendChild(arrow);

    this.container.appendChild(this.minesSelectWrapper);
  }

  buildGemsLabel() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.gemsLabel;
    row.appendChild(label);

    this.container.appendChild(row);
  }

  buildGemsDisplay() {
    this.gemsBox = document.createElement("div");
    this.gemsBox.className = "control-gems-box";

    this.gemsValue = document.createElement("span");
    this.gemsValue.className = "control-gems-value";
    this.gemsBox.appendChild(this.gemsValue);

    this.container.appendChild(this.gemsBox);
  }

  buildBetButton() {
    this.betButton = document.createElement("button");
    this.betButton.type = "button";
    this.betButton.id = "betBtn";
    this.betButton.className = "control-bet-btn";
    this.betButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("bet"));
    });
    this.container.appendChild(this.betButton);

    this.setBetButtonMode(this.betButtonMode);
    this.setBetButtonState(this.betButtonState);
  }

  buildRandomPickButton() {
    this.randomPickButton = document.createElement("button");
    this.randomPickButton.type = "button";
    this.randomPickButton.className = "control-bet-btn control-random-btn";
    this.randomPickButton.textContent = "Random Pick";
    this.randomPickButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("randompick"));
    });
    this.container.appendChild(this.randomPickButton);

    this.setRandomPickState(this.randomPickButtonState);
  }

  refreshMinesOptions({ emit = true } = {}) {
    if (!this.minesSelect) return;
    const selected = Math.max(1, Math.min(this.currentMines, this.maxMines));

    this.minesSelect.innerHTML = "";
    for (let i = 1; i <= this.maxMines; i += 1) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = String(i);
      if (i === selected) {
        option.selected = true;
      }
      this.minesSelect.appendChild(option);
    }

    this.currentMines = selected;
    this.updateGemsValue();
    if (emit) {
      this.dispatchMinesChange();
    }
  }

  setMinesValue(value, { emit = true } = {}) {
    const numeric = Math.floor(Number(value));
    const clamped = Math.max(1, Math.min(Number.isFinite(numeric) ? numeric : 1, this.maxMines));
    this.currentMines = clamped;
    if (this.minesSelect) {
      this.minesSelect.value = String(clamped);
    }
    this.updateGemsValue();
    if (emit) {
      this.dispatchMinesChange();
    }
  }

  setMaxMines(value, { emit = true } = {}) {
    const numeric = Math.floor(Number(value));
    const normalized = Number.isFinite(numeric) ? numeric : this.totalTiles - 1;
    this.maxMines = Math.max(1, Math.min(normalized, this.totalTiles - 1));
    this.refreshMinesOptions({ emit });
  }

  setTotalTiles(value, { emit = true } = {}) {
    const numeric = Math.floor(Number(value));
    const normalized = Math.max(2, Number.isFinite(numeric) ? numeric : this.totalTiles);
    this.totalTiles = normalized;
    this.maxMines = Math.max(1, Math.min(this.maxMines, this.totalTiles - 1));
    this.refreshMinesOptions({ emit });
  }

  getMinesValue() {
    return this.currentMines;
  }

  getMaxMines() {
    return this.maxMines;
  }

  getTotalTiles() {
    return this.totalTiles;
  }

  getGemsValue() {
    return Math.max(0, this.totalTiles - this.currentMines);
  }

  updateGemsValue() {
    if (!this.gemsValue) return;
    this.gemsValue.textContent = String(this.getGemsValue());
  }

  dispatchMinesChange() {
    this.dispatchEvent(
      new CustomEvent("mineschanged", {
        detail: {
          value: this.getMinesValue(),
          totalTiles: this.getTotalTiles(),
          gems: this.getGemsValue(),
        },
      })
    );
  }

  buildProfitOnWinDisplay() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.profitOnWinLabel;
    row.appendChild(label);

    this.profitOnWinValue = document.createElement("span");
    this.profitOnWinValue.className = "control-row-value";
    row.appendChild(this.profitOnWinValue);

    this.container.appendChild(row);
  }

  buildProfitDisplay() {
    this.profitBox = document.createElement("div");
    this.profitBox.className = "control-profit-box";

    this.profitValue = document.createElement("span");
    this.profitValue.className = "control-profit-value";
    this.profitBox.appendChild(this.profitValue);

    const icon = document.createElement("img");
    icon.src = bitcoinIconUrl;
    icon.alt = "";
    icon.className = "control-profit-icon";
    this.profitBox.appendChild(icon);

    this.container.appendChild(this.profitBox);
  }

  buildGameName() {
    this.gameName = document.createElement("div");
    this.gameName.className = "control-game-name";
    this.gameName.textContent = this.options.gameName;
    this.container.appendChild(this.gameName);
  }

  setMode(mode) {
    const normalized = mode === "auto" ? "auto" : "manual";
    if (this.mode === normalized) {
      return;
    }
    this.mode = normalized;
    this.updateModeButtons();
    this.dispatchEvent(new CustomEvent("modechange", { detail: { mode: this.mode } }));
  }

  updateModeButtons() {
    if (!this.manualButton || !this.autoButton) return;
    this.manualButton.classList.toggle("is-active", this.mode === "manual");
    this.autoButton.classList.toggle("is-active", this.mode === "auto");
  }

  adjustBetValue(delta) {
    const current = this.getBetValue();
    const next = clampToZero(current + delta);
    this.setBetInputValue(next);
  }

  scaleBetValue(factor) {
    const current = this.getBetValue();
    const next = clampToZero(current * factor);
    this.setBetInputValue(next);
  }

  setBetInputValue(value, { emit = true } = {}) {
    const formatted = this.formatBetValue(value);
    this.betInput.value = formatted;
    if (emit) {
      this.dispatchBetValueChange(formatted);
    }
    return formatted;
  }

  formatBetValue(value) {
    const numeric = Number(this.parseBetValue(value));
    if (!Number.isFinite(numeric)) {
      return "0.00000000";
    }
    return clampToZero(numeric).toFixed(8);
  }

  parseBetValue(value) {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value !== "string") {
      return 0;
    }
    const sanitized = value.replace(/[^0-9.\-]+/g, "");
    const numeric = Number(sanitized);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  dispatchBetValueChange(value = this.betInput.value) {
    this.dispatchEvent(
      new CustomEvent("betvaluechange", {
        detail: { value: value, numericValue: this.getBetValue() },
      })
    );
  }

  getBetValue() {
    const numeric = Number(this.formatBetValue(this.betInput.value));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  setBetAmountDisplay(value) {
    if (this.betAmountValue) {
      this.betAmountValue.textContent = value;
    }
  }

  setProfitOnWinDisplay(value) {
    if (this.profitOnWinValue) {
      this.profitOnWinValue.textContent = value;
    }
  }

  setProfitValue(value) {
    if (!this.profitValue) return;
    if (Number.isFinite(Number(value))) {
      const numeric = Number(value);
      this.profitValue.textContent = clampToZero(numeric).toFixed(8);
    } else if (typeof value === "string") {
      this.profitValue.textContent = value;
    } else {
      this.profitValue.textContent = "0.00000000";
    }
  }

  setGameName(name) {
    if (this.gameName) {
      this.gameName.textContent = name;
    }
  }

  setBetButtonMode(mode) {
    if (!this.betButton) return;
    const normalized = mode === "cashout" ? "cashout" : "bet";
    this.betButtonMode = normalized;
    this.betButton.textContent =
      normalized === "cashout" ? "Cashout" : "Bet";
    this.betButton.dataset.mode = normalized;
  }

  setBetButtonState(state) {
    if (!this.betButton) return;
    const normalized =
      state === "clickable" || state === true || state === "enabled"
        ? "clickable"
        : "non-clickable";
    this.betButtonState = normalized;
    const isClickable = normalized === "clickable";
    this.betButton.disabled = !isClickable;
    this.betButton.classList.toggle("is-non-clickable", !isClickable);
  }

  setRandomPickState(state) {
    if (!this.randomPickButton) return;
    const normalized =
      state === "clickable" || state === true || state === "enabled"
        ? "clickable"
        : "non-clickable";
    this.randomPickButtonState = normalized;
    const isClickable = normalized === "clickable";
    this.randomPickButton.disabled = !isClickable;
    this.randomPickButton.classList.toggle("is-non-clickable", !isClickable);
  }

  getMode() {
    return this.mode;
  }
}
