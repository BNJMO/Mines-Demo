import { Stepper } from "../stepper/stepper.js";
import bitcoinIconUrl from "../../assets/sprites/BitCoin.png";
import infinityIconUrl from "../../assets/sprites/Infinity.png";
import percentageIconUrl from "../../assets/sprites/Percentage.png";

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
    this.minesSelectState = "clickable";
    this.autoStartButtonState = "non-clickable";
    this.autoStartButtonMode = "start";

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
    this.buildModeSections();
    this.buildGameName();

    this.setBetAmountDisplay(this.options.initialBetAmountDisplay);
    this.setProfitOnWinDisplay(this.options.initialProfitOnWinDisplay);
    this.setProfitValue(this.options.initialProfitValue);
    this.setBetInputValue(this.options.initialBetValue, { emit: false });
    this.refreshMinesOptions({ emit: false });
    this.updateModeButtons();
    this.updateModeSections();
    this.updateAdvancedVisibility();
    this.updateNumberOfBetsIcon();
    this.updateOnWinMode();
    this.updateOnLossMode();

    this.setupResponsiveLayout();
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

    this.setMinesSelectState(this.minesSelectState);
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

  buildModeSections() {
    this.manualSection = document.createElement("div");
    this.manualSection.className =
      "control-mode-section control-mode-section--manual";
    this.container.appendChild(this.manualSection);

    this.buildBetButton();
    this.buildRandomPickButton();
    this.buildProfitOnWinDisplay();
    this.buildProfitDisplay();

    this.autoSection = document.createElement("div");
    this.autoSection.className =
      "control-mode-section control-mode-section--auto";
    this.container.appendChild(this.autoSection);

    this.buildAutoControls();
  }

  buildAutoControls() {
    this.autoNumberOfBetsLabel = this.createSectionLabel("Number of Bets");
    this.autoSection.appendChild(this.autoNumberOfBetsLabel);

    this.autoNumberOfBetsField = document.createElement("div");
    this.autoNumberOfBetsField.className =
      "control-bet-input-field auto-number-field has-stepper";
    this.autoSection.appendChild(this.autoNumberOfBetsField);

    this.autoNumberOfBetsInput = document.createElement("input");
    this.autoNumberOfBetsInput.type = "text";
    this.autoNumberOfBetsInput.inputMode = "numeric";
    this.autoNumberOfBetsInput.autocomplete = "off";
    this.autoNumberOfBetsInput.spellcheck = false;
    this.autoNumberOfBetsInput.className = "control-bet-input auto-number-input";
    this.autoNumberOfBetsInput.value = "0";
    this.autoNumberOfBetsInput.addEventListener("input", () => {
      this.sanitizeNumberOfBets();
      this.updateNumberOfBetsIcon();
    });
    this.autoNumberOfBetsInput.addEventListener("blur", () => {
      this.sanitizeNumberOfBets();
      this.updateNumberOfBetsIcon();
    });
    this.autoNumberOfBetsField.appendChild(this.autoNumberOfBetsInput);

    this.autoNumberOfBetsInfinityIcon = document.createElement("img");
    this.autoNumberOfBetsInfinityIcon.src = infinityIconUrl;
    this.autoNumberOfBetsInfinityIcon.alt = "";
    this.autoNumberOfBetsInfinityIcon.className = "auto-number-infinity";
    this.autoNumberOfBetsField.appendChild(
      this.autoNumberOfBetsInfinityIcon
    );

    this.autoNumberOfBetsStepper = new Stepper({
      onStepUp: () => this.incrementNumberOfBets(1),
      onStepDown: () => this.incrementNumberOfBets(-1),
      upAriaLabel: "Increase number of bets",
      downAriaLabel: "Decrease number of bets",
    });
    this.autoNumberOfBetsField.appendChild(this.autoNumberOfBetsStepper.element);

    this.autoAdvancedHeader = document.createElement("div");
    this.autoAdvancedHeader.className = "auto-advanced-header";
    this.autoSection.appendChild(this.autoAdvancedHeader);

    this.autoAdvancedLabel = this.createSectionLabel("Advanced");
    this.autoAdvancedLabel.classList.add("auto-advanced-label");
    this.autoAdvancedHeader.appendChild(this.autoAdvancedLabel);

    this.autoAdvancedToggle = this.createSwitchButton({
      onToggle: (isActive) => {
        this.isAdvancedEnabled = Boolean(isActive);
        this.updateAdvancedVisibility();
      },
    });
    this.autoAdvancedHeader.appendChild(this.autoAdvancedToggle);

    this.autoAdvancedContent = document.createElement("div");
    this.autoAdvancedContent.className = "auto-advanced-content";
    this.autoSection.appendChild(this.autoAdvancedContent);

    this.autoAdvancedContent.appendChild(this.createSectionLabel("On Win"));
    const onWinRow = this.createAdvancedStrategyRow("win");
    this.autoAdvancedContent.appendChild(onWinRow);

    this.autoAdvancedContent.appendChild(this.createSectionLabel("On Loss"));
    const onLossRow = this.createAdvancedStrategyRow("loss");
    this.autoAdvancedContent.appendChild(onLossRow);

    const profitRow = document.createElement("div");
    profitRow.className = "auto-advanced-summary-row";
    const profitLabel = document.createElement("span");
    profitLabel.className = "auto-advanced-summary-label";
    profitLabel.textContent = "Stop on Profit";
    const profitValue = document.createElement("span");
    profitValue.className = "auto-advanced-summary-value";
    profitValue.textContent = "$0.00";
    profitRow.append(profitLabel, profitValue);
    this.autoAdvancedContent.appendChild(profitRow);

    this.autoStopOnProfitField = this.createCurrencyField();
    this.autoAdvancedContent.appendChild(this.autoStopOnProfitField.wrapper);

    const lossRow = document.createElement("div");
    lossRow.className = "auto-advanced-summary-row";
    const lossLabel = document.createElement("span");
    lossLabel.className = "auto-advanced-summary-label";
    lossLabel.textContent = "Stop on Loss";
    const lossValue = document.createElement("span");
    lossValue.className = "auto-advanced-summary-value";
    lossValue.textContent = "$0.00";
    lossRow.append(lossLabel, lossValue);
    this.autoAdvancedContent.appendChild(lossRow);

    this.autoStopOnLossField = this.createCurrencyField();
    this.autoAdvancedContent.appendChild(this.autoStopOnLossField.wrapper);

    this.autoStartButton = document.createElement("button");
    this.autoStartButton.type = "button";
    this.autoStartButton.className =
      "control-bet-btn control-start-autobet-btn";
    this.autoStartButton.textContent = "Start Autobet";
    this.autoStartButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("startautobet"));
    });

    this.autoSection.appendChild(this.autoStartButton);

    this.setAutoStartButtonState(this.autoStartButtonState);

    this.isAdvancedEnabled = false;
    this.onWinMode = "reset";
    this.onLossMode = "reset";
    this.strategyControlsNonClickable = false;
  }

  createSectionLabel(text) {
    const label = document.createElement("div");
    label.className = "control-section-label";
    label.textContent = text;
    return label;
  }

  createSwitchButton({ onToggle }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-switch";
    button.setAttribute("aria-pressed", "false");

    const handle = document.createElement("span");
    handle.className = "control-switch-handle";
    button.appendChild(handle);

    button.addEventListener("click", () => {
      const isActive = button.classList.toggle("is-on");
      button.setAttribute("aria-pressed", String(isActive));
      onToggle?.(isActive);
    });

    return button;
  }

  createAdvancedStrategyRow(key) {
    const row = document.createElement("div");
    row.className = "auto-advanced-strategy-row";

    const toggle = document.createElement("div");
    toggle.className = "auto-mode-toggle";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "auto-mode-toggle-btn is-reset";
    resetButton.textContent = "Reset";

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.className = "auto-mode-toggle-btn";
    increaseButton.textContent = "Increase by:";

    toggle.append(resetButton, increaseButton);
    row.appendChild(toggle);

    const field = document.createElement("div");
    field.className = "control-bet-input-field auto-advanced-input";
    row.appendChild(field);

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className = "control-bet-input";
    input.value = "0";
    field.appendChild(input);

    const icon = document.createElement("img");
    icon.src = percentageIconUrl;
    icon.alt = "";
    icon.className = "control-bet-input-icon auto-percentage-icon";
    field.appendChild(icon);

    if (key === "win") {
      this.onWinResetButton = resetButton;
      this.onWinIncreaseButton = increaseButton;
      this.onWinInput = input;
      this.onWinField = field;
    } else {
      this.onLossResetButton = resetButton;
      this.onLossIncreaseButton = increaseButton;
      this.onLossInput = input;
      this.onLossField = field;
    }

    resetButton.addEventListener("click", () => {
      this.setStrategyMode(key, "reset");
    });
    increaseButton.addEventListener("click", () => {
      this.setStrategyMode(key, "increase");
    });

    return row;
  }

  createCurrencyField() {
    const wrapper = document.createElement("div");
    wrapper.className = "control-bet-input-field auto-currency-field";

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className = "control-bet-input";
    input.value = "0.00000000";
    wrapper.appendChild(input);

    const icon = document.createElement("img");
    icon.src = bitcoinIconUrl;
    icon.alt = "";
    icon.className = "control-bet-input-icon";
    wrapper.appendChild(icon);

    return { wrapper, input, icon };
  }

  buildBetButton() {
    this.betButton = document.createElement("button");
    this.betButton.type = "button";
    this.betButton.id = "betBtn";
    this.betButton.className = "control-bet-btn";
    this.betButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("bet"));
    });
    const parent = this.manualSection ?? this.container;
    parent.appendChild(this.betButton);

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
    const parent = this.manualSection ?? this.container;
    parent.appendChild(this.randomPickButton);

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

    const parent = this.manualSection ?? this.container;
    parent.appendChild(row);
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

    const parent = this.manualSection ?? this.container;
    parent.appendChild(this.profitBox);
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
    this.updateModeSections();
    this.dispatchEvent(new CustomEvent("modechange", { detail: { mode: this.mode } }));
  }

  updateModeButtons() {
    if (!this.manualButton || !this.autoButton) return;
    this.manualButton.classList.toggle("is-active", this.mode === "manual");
    this.autoButton.classList.toggle("is-active", this.mode === "auto");
  }

  updateModeSections() {
    if (this.manualSection) {
      this.manualSection.hidden = this.mode !== "manual";
    }
    if (this.autoSection) {
      this.autoSection.hidden = this.mode !== "auto";
    }
    if (this.autoStartButton) {
      this.autoStartButton.hidden = this.mode !== "auto";
    }
  }

  setupResponsiveLayout() {
    if (!this.container) return;

    const query = window.matchMedia(
      "(max-width: 1100px), (orientation: portrait)"
    );
    this._layoutMediaQuery = query;
    this._onMediaQueryChange = () => this.updateResponsiveLayout();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", this._onMediaQueryChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(this._onMediaQueryChange);
    }

    this.updateResponsiveLayout();
  }

  updateResponsiveLayout() {
    if (!this.container) return;
    const isPortrait = Boolean(this._layoutMediaQuery?.matches);
    this.container.classList.toggle("is-portrait", isPortrait);

    if (!this.autoStartButton || !this.toggleWrapper) {
      return;
    }

    if (isPortrait) {
      this.container.insertBefore(
        this.autoStartButton,
        this.container.firstChild
      );
      if (this.gameName) {
        this.container.insertBefore(this.toggleWrapper, this.gameName);
      } else {
        this.container.appendChild(this.toggleWrapper);
      }
    } else {
      this.container.insertBefore(this.toggleWrapper, this.container.firstChild);
      if (this.autoSection) {
        this.autoSection.appendChild(this.autoStartButton);
      } else {
        this.container.appendChild(this.autoStartButton);
      }
    }
  }

  sanitizeNumberOfBets() {
    if (!this.autoNumberOfBetsInput) return;
    const numeric = Math.max(
      0,
      Math.floor(Number(this.autoNumberOfBetsInput.value.replace(/[^0-9]/g, "")) || 0)
    );
    this.autoNumberOfBetsInput.value = String(numeric);
  }

  incrementNumberOfBets(delta) {
    if (!this.autoNumberOfBetsInput) return;
    const current = Number(this.autoNumberOfBetsInput.value) || 0;
    const next = Math.max(0, current + delta);
    this.autoNumberOfBetsInput.value = String(next);
    this.updateNumberOfBetsIcon();
  }

  updateNumberOfBetsIcon() {
    if (!this.autoNumberOfBetsInfinityIcon || !this.autoNumberOfBetsInput) return;
    const current = Number(this.autoNumberOfBetsInput.value) || 0;
    this.autoNumberOfBetsInfinityIcon.classList.toggle(
      "is-visible",
      current === 0
    );
  }

  updateAdvancedVisibility() {
    if (!this.autoAdvancedContent || !this.autoAdvancedToggle) return;
    const isActive = Boolean(this.isAdvancedEnabled);
    this.autoAdvancedContent.hidden = !isActive;
    this.autoAdvancedToggle.classList.toggle("is-on", isActive);
    this.autoAdvancedToggle.setAttribute("aria-pressed", String(isActive));
  }

  setStrategyMode(key, mode) {
    const normalized = mode === "increase" ? "increase" : "reset";
    if (key === "win") {
      this.onWinMode = normalized;
      this.updateOnWinMode();
    } else {
      this.onLossMode = normalized;
      this.updateOnLossMode();
    }
  }

  updateOnWinMode() {
    this.updateStrategyButtons(
      this.onWinMode,
      this.onWinResetButton,
      this.onWinIncreaseButton,
      this.onWinInput,
      this.onWinField
    );
  }

  updateOnLossMode() {
    this.updateStrategyButtons(
      this.onLossMode,
      this.onLossResetButton,
      this.onLossIncreaseButton,
      this.onLossInput,
      this.onLossField
    );
  }

  updateStrategyButtons(mode, resetButton, increaseButton, input, field) {
    if (!resetButton || !increaseButton || !input || !field) return;
    const isIncrease = mode === "increase";
    const controlsNonClickable = Boolean(this.strategyControlsNonClickable);
    resetButton.classList.toggle("is-active", !isIncrease);
    increaseButton.classList.toggle("is-active", isIncrease);
    resetButton.disabled = controlsNonClickable;
    increaseButton.disabled = controlsNonClickable;
    const allowInput = !controlsNonClickable && isIncrease;
    input.disabled = !allowInput;
    field.classList.toggle("is-non-clickable", !allowInput);
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

  setAutoStartButtonState(state) {
    if (!this.autoStartButton) return;
    const normalized =
      state === "clickable" || state === true || state === "enabled"
        ? "clickable"
        : "non-clickable";
    this.autoStartButtonState = normalized;
    const isClickable = normalized === "clickable";
    this.autoStartButton.disabled = !isClickable;
    this.autoStartButton.classList.toggle("is-non-clickable", !isClickable);
  }

  setMinesSelectState(state) {
    if (!this.minesSelect || !this.minesSelectWrapper) return;
    const normalized =
      state === "clickable" || state === true || state === "enabled"
        ? "clickable"
        : "non-clickable";
    this.minesSelectState = normalized;
    const isClickable = normalized === "clickable";
    this.minesSelect.disabled = !isClickable;
    this.minesSelect.setAttribute("aria-disabled", String(!isClickable));
    this.minesSelectWrapper.classList.toggle("is-non-clickable", !isClickable);
  }

  setAutoStartButtonMode(mode) {
    if (!this.autoStartButton) return;
    const normalized =
      mode === "stop" ? "stop" : mode === "finish" ? "finish" : "start";
    this.autoStartButtonMode = normalized;
    this.autoStartButton.textContent =
      normalized === "stop"
        ? "Stop Autobet"
        : normalized === "finish"
        ? "Finishin Bet"
        : "Start Autobet";
    this.autoStartButton.dataset.mode = normalized;
  }

  setModeToggleClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.manualButton) {
      this.manualButton.disabled = !clickable;
      this.manualButton.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.autoButton) {
      this.autoButton.disabled = !clickable;
      this.autoButton.classList.toggle("is-non-clickable", !clickable);
    }
  }

  setBetControlsClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.betInput) {
      this.betInput.disabled = !clickable;
    }
    if (this.betBox) {
      this.betBox.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.betInputWrapper) {
      this.betInputWrapper.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.betStepper?.setClickable) {
      this.betStepper.setClickable(clickable);
    }
    if (this.halfButton) {
      this.halfButton.disabled = !clickable;
      this.halfButton.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.doubleButton) {
      this.doubleButton.disabled = !clickable;
      this.doubleButton.classList.toggle("is-non-clickable", !clickable);
    }
  }

  getNumberOfBetsValue() {
    if (!this.autoNumberOfBetsInput) return 0;
    const numeric = Number(this.autoNumberOfBetsInput.value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
  }

  setNumberOfBetsValue(value) {
    if (!this.autoNumberOfBetsInput) return;
    const normalized = Math.max(0, Math.floor(Number(value) || 0));
    this.autoNumberOfBetsInput.value = String(normalized);
    this.updateNumberOfBetsIcon();
  }

  setNumberOfBetsClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.autoNumberOfBetsField) {
      this.autoNumberOfBetsField.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.autoNumberOfBetsInput) {
      this.autoNumberOfBetsInput.disabled = !clickable;
      this.autoNumberOfBetsInput.classList.toggle("is-non-clickable", !clickable);
    }
    if (this.autoNumberOfBetsStepper?.setClickable) {
      this.autoNumberOfBetsStepper.setClickable(clickable);
    }
  }

  setAdvancedToggleClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.autoAdvancedToggle) {
      this.autoAdvancedToggle.disabled = !clickable;
      this.autoAdvancedToggle.classList.toggle("is-non-clickable", !clickable);
    }
  }

  setAdvancedStrategyControlsClickable(isClickable) {
    this.strategyControlsNonClickable = !isClickable;
    this.updateOnWinMode();
    this.updateOnLossMode();
  }

  setStopOnProfitClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.autoStopOnProfitField?.input) {
      this.autoStopOnProfitField.input.disabled = !clickable;
      this.autoStopOnProfitField.wrapper.classList.toggle(
        "is-non-clickable",
        !clickable
      );
    }
  }

  setStopOnLossClickable(isClickable) {
    const clickable = Boolean(isClickable);
    if (this.autoStopOnLossField?.input) {
      this.autoStopOnLossField.input.disabled = !clickable;
      this.autoStopOnLossField.wrapper.classList.toggle(
        "is-non-clickable",
        !clickable
      );
    }
  }

  getMode() {
    return this.mode;
  }
}
