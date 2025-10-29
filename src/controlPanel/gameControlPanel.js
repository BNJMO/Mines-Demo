import { Stepper } from "../stepper/stepper.js";
import { ControlPanelLayout } from "./base/panelLayout.js";
import { clampToZero } from "./base/utils.js";
import {
  createButton,
  createCurrencyField,
  createIcon,
  createInputField,
  createSectionLabel,
  createSelectField,
  createStepperField,
  createSummaryRow,
  createSwitchButton,
  createToggleButtonGroup,
} from "./components/panelComponents.js";
import bitcoinIconUrl from "../../assets/sprites/controlPanel/BitCoin.png";
import infinityIconUrl from "../../assets/sprites/controlPanel/Infinity.png";
import percentageIconUrl from "../../assets/sprites/controlPanel/Percentage.png";

export class GameControlPanel extends ControlPanelLayout {
  constructor(mount, options = {}) {
    super(mount, {
      containerClass: "control-panel",
      scrollClass: "control-panel-scroll",
    });
    this.container = this.element;
    this.scrollContainer = this.scrollElement;

    this.options = {
      betAmountLabel: options.betAmountLabel ?? "Bet Amount",
      profitOnWinLabel: options.profitOnWinLabel ?? "Profit on Win",
      initialTotalProfitMultiplier:
        options.initialTotalProfitMultiplier ?? 1,
      initialBetValue: options.initialBetValue ?? "0.00000000",
      initialBetAmountDisplay: options.initialBetAmountDisplay ?? "$0.00",
      initialProfitOnWinDisplay: options.initialProfitOnWinDisplay ?? "$0.00",
      initialProfitValue: options.initialProfitValue ?? "0.00000000",
      initialMode: options.initialMode ?? "manual",
      gameName: options.gameName ?? "Game Name",
      minesLabel: options.minesLabel ?? "Mines",
      gemsLabel: options.gemsLabel ?? "Gems",
      animationsLabel: options.animationsLabel ?? "Animations",
      showDummyServerLabel:
        options.showDummyServerLabel ?? "Show Dummy Server",
      initialAnimationsEnabled:
        options.initialAnimationsEnabled ?? true,
      initialMines: options.initialMines ?? 1,
      maxMines: options.maxMines,
      totalTiles: options.totalTiles,
    };

    this.mode = this.options.initialMode === "auto" ? "auto" : "manual";

    this.animationsEnabled = Boolean(this.options.initialAnimationsEnabled);

    this.betButtonMode = "bet";
    this.betButtonState = "clickable";
    this.randomPickButtonState = "clickable";
    this.minesSelectState = "clickable";
    this.autoStartButtonState = "non-clickable";
    this.autoStartButtonMode = "start";

    this.totalProfitMultiplier = 1;

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

    this.buildToggle();
    this.buildBetAmountDisplay();
    this.buildBetControls();
    this.buildMinesLabel();
    this.buildMinesSelect();
    this.buildGemsLabel();
    this.buildGemsDisplay();
    this.buildModeSections();
    this.buildFooter();

    this.setBetAmountDisplay(this.options.initialBetAmountDisplay);
    this.setProfitOnWinDisplay(this.options.initialProfitOnWinDisplay);
    this.setTotalProfitMultiplier(this.options.initialTotalProfitMultiplier);
    this.setProfitValue(this.options.initialProfitValue);
    this.setBetInputValue(this.options.initialBetValue, { emit: false });
    this.refreshMinesOptions({ emit: false });
    this.updateModeButtons();
    this.updateModeSections();
    this.updateAdvancedVisibility();
    this.updateNumberOfBetsIcon();
    this.updateOnWinMode();
    this.updateOnLossMode();
    this.updateAnimationToggle();

    this.setupResponsiveLayout();
  }

  buildToggle() {
    const toggle = createToggleButtonGroup({
      items: [
        { id: "manual", label: "Manual" },
        { id: "auto", label: "Auto" },
      ],
      activeId: this.mode,
      onChange: (id) => this.setMode(id),
    });

    this.modeToggle = toggle;
    this.toggleWrapper = toggle.element;
    this.manualButton = toggle.buttons.get("manual");
    this.autoButton = toggle.buttons.get("auto");
    this.scrollContainer.appendChild(this.toggleWrapper);
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

    this.scrollContainer.appendChild(row);
  }

  buildBetControls() {
    this.betBox = document.createElement("div");
    this.betBox.className = "control-bet-box";

    const betField = createStepperField({
      wrapperClassName: "control-bet-input-field",
      hasStepperClass: "has-stepper",
      inputOptions: {
        type: "text",
        inputMode: "decimal",
        className: "control-bet-input",
        ariaLabel: this.options.betAmountLabel,
        onInput: () => this.dispatchBetValueChange(),
        onBlur: () => this.setBetInputValue(this.betInput.value),
      },
      iconOptions: {
        src: bitcoinIconUrl,
        alt: "",
        className: "control-bet-input-icon",
      },
      stepperFactory: () =>
        new Stepper({
          onStepUp: () => this.adjustBetValue(1e-8),
          onStepDown: () => this.adjustBetValue(-1e-8),
          upAriaLabel: "Increase bet amount",
          downAriaLabel: "Decrease bet amount",
        }),
    });

    this.betInputWrapper = betField.wrapper;
    this.betInput = betField.input;
    this.betStepper = betField.stepper;

    this.halfButton = createButton({
      text: "½",
      className: "control-bet-action",
      ariaLabel: "Halve bet value",
      onClick: () => this.scaleBetValue(0.5),
    });

    this.doubleButton = createButton({
      text: "2×",
      className: "control-bet-action",
      ariaLabel: "Double bet value",
      onClick: () => this.scaleBetValue(2),
    });

    const separator = document.createElement("div");
    separator.className = "control-bet-separator";

    this.betBox.append(
      this.betInputWrapper,
      this.halfButton,
      separator,
      this.doubleButton
    );
    this.scrollContainer.appendChild(this.betBox);
  }

  buildMinesLabel() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.minesLabel;
    row.appendChild(label);

    this.scrollContainer.appendChild(row);
  }

  buildMinesSelect() {
    const selectField = createSelectField({
      wrapperClassName: "control-select-field",
      ariaLabel: this.options.minesLabel,
      onChange: () => {
        const value = Math.floor(Number(this.minesSelect.value) || 1);
        this.currentMines = Math.max(1, Math.min(value, this.maxMines));
        this.updateGemsValue();
        this.dispatchMinesChange();
      },
    });

    this.minesSelectWrapper = selectField.wrapper;
    this.minesSelect = selectField.select;
    this.scrollContainer.appendChild(this.minesSelectWrapper);

    this.setMinesSelectState(this.minesSelectState);
  }

  buildGemsLabel() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.gemsLabel;
    row.appendChild(label);

    this.scrollContainer.appendChild(row);
  }

  buildGemsDisplay() {
    this.gemsBox = document.createElement("div");
    this.gemsBox.className = "control-gems-box";

    this.gemsValue = document.createElement("span");
    this.gemsValue.className = "control-gems-value";
    this.gemsBox.appendChild(this.gemsValue);

    this.scrollContainer.appendChild(this.gemsBox);
  }

  buildModeSections() {
    this.manualSection = document.createElement("div");
    this.manualSection.className =
      "control-mode-section control-mode-section--manual";
    this.scrollContainer.appendChild(this.manualSection);

    this.buildBetButton();
    this.buildRandomPickButton();
    this.buildProfitOnWinDisplay();
    this.buildProfitDisplay();

    this.autoSection = document.createElement("div");
    this.autoSection.className =
      "control-mode-section control-mode-section--auto";
    this.scrollContainer.appendChild(this.autoSection);

    this.buildAutoControls();
  }

  buildAutoControls() {
    this.autoNumberOfBetsLabel = createSectionLabel("Number of Bets");
    this.autoSection.appendChild(this.autoNumberOfBetsLabel);

    const numberField = createStepperField({
      wrapperClassName: "control-bet-input-field auto-number-field",
      hasStepperClass: "has-stepper",
      inputOptions: {
        type: "text",
        inputMode: "numeric",
        className: "control-bet-input auto-number-input",
        value: "0",
        onInput: () => {
          this.sanitizeNumberOfBets();
          this.updateNumberOfBetsIcon();
          this.dispatchNumberOfBetsChange();
        },
        onBlur: () => {
          this.sanitizeNumberOfBets();
          this.updateNumberOfBetsIcon();
          this.dispatchNumberOfBetsChange();
        },
      },
      stepperFactory: () =>
        new Stepper({
          onStepUp: () => this.incrementNumberOfBets(1),
          onStepDown: () => this.incrementNumberOfBets(-1),
          upAriaLabel: "Increase number of bets",
          downAriaLabel: "Decrease number of bets",
        }),
    });

    this.autoNumberOfBetsField = numberField.wrapper;
    this.autoNumberOfBetsInput = numberField.input;
    this.autoNumberOfBetsStepper = numberField.stepper;
    this.autoSection.appendChild(this.autoNumberOfBetsField);

    this.autoNumberOfBetsInfinityIcon = document.createElement("img");
    this.autoNumberOfBetsInfinityIcon.src = infinityIconUrl;
    this.autoNumberOfBetsInfinityIcon.alt = "";
    this.autoNumberOfBetsInfinityIcon.className = "auto-number-infinity";
    this.autoNumberOfBetsField.insertBefore(
      this.autoNumberOfBetsInfinityIcon,
      this.autoNumberOfBetsStepper?.element ?? null
    );

    this.autoAdvancedHeader = document.createElement("div");
    this.autoAdvancedHeader.className = "auto-advanced-header";
    this.autoSection.appendChild(this.autoAdvancedHeader);

    this.autoAdvancedLabel = createSectionLabel("Advanced");
    this.autoAdvancedLabel.classList.add("auto-advanced-label");
    this.autoAdvancedHeader.appendChild(this.autoAdvancedLabel);

    this.autoAdvancedToggleControl = createSwitchButton({
      initialActive: false,
      onToggle: (isActive) => {
        this.isAdvancedEnabled = Boolean(isActive);
        this.updateAdvancedVisibility();
      },
    });
    this.autoAdvancedToggle = this.autoAdvancedToggleControl.element;
    this.autoAdvancedHeader.appendChild(this.autoAdvancedToggle);

    this.autoAdvancedContent = document.createElement("div");
    this.autoAdvancedContent.className = "auto-advanced-content";
    this.autoSection.appendChild(this.autoAdvancedContent);

    this.autoAdvancedContent.appendChild(createSectionLabel("On Win"));
    const onWinRow = this.createAdvancedStrategyRow("win");
    this.autoAdvancedContent.appendChild(onWinRow);

    this.autoAdvancedContent.appendChild(createSectionLabel("On Loss"));
    const onLossRow = this.createAdvancedStrategyRow("loss");
    this.autoAdvancedContent.appendChild(onLossRow);

    const profitRow = createSummaryRow({
      label: "Stop on Profit",
      value: "$0.00",
    });
    this.autoAdvancedContent.appendChild(profitRow.row);

    this.autoStopOnProfitField = createCurrencyField({
      wrapperClassName: "control-bet-input-field auto-currency-field",
      inputClassName: "control-bet-input",
      icon: {
        src: bitcoinIconUrl,
        alt: "",
        className: "control-bet-input-icon",
      },
      value: "0.00000000",
    });
    this.autoAdvancedContent.appendChild(this.autoStopOnProfitField.wrapper);
    this.autoStopOnProfitField.input.addEventListener("input", () => {
      this.dispatchStopOnProfitChange(this.autoStopOnProfitField.input.value);
    });
    this.autoStopOnProfitField.input.addEventListener("blur", () => {
      this.dispatchStopOnProfitChange(this.autoStopOnProfitField.input.value);
    });

    const lossRow = createSummaryRow({
      label: "Stop on Loss",
      value: "$0.00",
    });
    this.autoAdvancedContent.appendChild(lossRow.row);

    this.autoStopOnLossField = createCurrencyField({
      wrapperClassName: "control-bet-input-field auto-currency-field",
      inputClassName: "control-bet-input",
      icon: {
        src: bitcoinIconUrl,
        alt: "",
        className: "control-bet-input-icon",
      },
      value: "0.00000000",
    });
    this.autoAdvancedContent.appendChild(this.autoStopOnLossField.wrapper);
    this.autoStopOnLossField.input.addEventListener("input", () => {
      this.dispatchStopOnLossChange(this.autoStopOnLossField.input.value);
    });
    this.autoStopOnLossField.input.addEventListener("blur", () => {
      this.dispatchStopOnLossChange(this.autoStopOnLossField.input.value);
    });

    this.autoStartButton = document.createElement("button");
    this.autoStartButton.type = "button";
    this.autoStartButton.className =
      "control-bet-btn control-start-autobet-btn";
    this.autoStartButton.textContent = "Start Autobet";
    this.autoStartButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("startautobet"));
    });

    this.container.appendChild(this.autoStartButton);

    this.setAutoStartButtonState(this.autoStartButtonState);

    this.isAdvancedEnabled = false;
    this.onWinMode = "reset";
    this.onLossMode = "reset";
    this.strategyControlsNonClickable = false;
  }

  createAdvancedStrategyRow(key) {
    const row = document.createElement("div");
    row.className = "auto-advanced-strategy-row";

    const toggle = document.createElement("div");
    toggle.className = "auto-mode-toggle";

    const resetButton = createButton({
      text: "Reset",
      className: "auto-mode-toggle-btn is-reset",
      onClick: () => {
        this.setStrategyMode(key, "reset");
      },
    });

    const increaseButton = createButton({
      text: "Increase by:",
      className: "auto-mode-toggle-btn",
      onClick: () => {
        this.setStrategyMode(key, "increase");
      },
    });

    toggle.append(resetButton, increaseButton);
    row.appendChild(toggle);

    const field = createInputField({
      type: "text",
      inputMode: "decimal",
      autocomplete: "off",
      spellcheck: false,
      className: "control-bet-input",
      wrapperClassName: "control-bet-input-field auto-advanced-input",
      value: "0",
      onInput: (event) => {
        this.dispatchStrategyValueChange(key, event.target.value);
      },
      onBlur: (event) => {
        this.dispatchStrategyValueChange(key, event.target.value);
      },
    });

    const icon = createIcon({
      src: percentageIconUrl,
      alt: "",
      className: "control-bet-input-icon auto-percentage-icon",
    });
    field.wrapper.appendChild(icon);
    row.appendChild(field.wrapper);

    const input = field.input;

    if (key === "win") {
      this.onWinResetButton = resetButton;
      this.onWinIncreaseButton = increaseButton;
      this.onWinInput = input;
      this.onWinField = field.wrapper;
    } else {
      this.onLossResetButton = resetButton;
      this.onLossIncreaseButton = increaseButton;
      this.onLossInput = input;
      this.onLossField = field.wrapper;
    }

    return row;
  }

  buildBetButton() {
    this.betButton = createButton({
      className: "control-bet-btn",
      onClick: () => {
        this.dispatchEvent(new CustomEvent("bet"));
      },
    });
    this.betButton.id = "betBtn";
    const parent = this.manualSection ?? this.scrollContainer;
    parent.appendChild(this.betButton);

    this.setBetButtonMode(this.betButtonMode);
    this.setBetButtonState(this.betButtonState);
  }

  buildRandomPickButton() {
    this.randomPickButton = createButton({
      text: "Random Pick",
      className: "control-bet-btn control-random-btn",
      onClick: () => {
        this.dispatchEvent(new CustomEvent("randompick"));
      },
    });
    const parent = this.manualSection ?? this.scrollContainer;
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

    this.profitOnWinLabel = document.createElement("span");
    this.profitOnWinLabel.className = "control-row-label";
    row.appendChild(this.profitOnWinLabel);
    this.updateTotalProfitLabel();

    this.profitOnWinValue = document.createElement("span");
    this.profitOnWinValue.className = "control-row-value";
    row.appendChild(this.profitOnWinValue);

    const parent = this.manualSection ?? this.scrollContainer;
    parent.appendChild(row);
  }

  updateTotalProfitLabel() {
    if (!this.profitOnWinLabel) return;
    const formattedMultiplier = this.totalProfitMultiplier.toFixed(2);
    this.profitOnWinLabel.textContent = `Total Profit(${formattedMultiplier}x)`;
  }

  setTotalProfitMultiplier(value) {
    const numeric = Number(value);
    const normalized = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    this.totalProfitMultiplier = normalized;
    this.updateTotalProfitLabel();
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

    const parent = this.manualSection ?? this.scrollContainer;
    parent.appendChild(this.profitBox);
  }

  buildFooter() {
    this.footer = document.createElement("div");
    this.footer.className = "control-panel-footer";
    this.container.appendChild(this.footer);

    this.gameName = document.createElement("div");
    this.gameName.className = "control-game-name";
    this.gameName.textContent = this.options.gameName;
    this.footer.appendChild(this.gameName);

    this.footerActions = document.createElement("div");
    this.footerActions.className = "control-footer-actions";
    this.footer.appendChild(this.footerActions);

    this.animationToggleWrapper = document.createElement("div");
    this.animationToggleWrapper.className = "control-animations-toggle";
    this.footerActions.appendChild(this.animationToggleWrapper);

    const label = document.createElement("span");
    label.className = "control-animations-label";
    label.textContent = this.options.animationsLabel;
    this.animationToggleWrapper.appendChild(label);

    this.animationToggleControl = createSwitchButton({
      initialActive: Boolean(this.animationsEnabled),
      onToggle: (isActive) => {
        this.setAnimationsEnabled(isActive);
      },
    });
    this.animationToggleButton = this.animationToggleControl.element;
    this.animationToggleButton.classList.add("control-animations-switch");
    this.animationToggleButton.setAttribute(
      "aria-label",
      "Toggle game animations"
    );
    this.animationToggleWrapper.appendChild(this.animationToggleButton);

    this.showDummyServerButton = createButton({
      text: this.options.showDummyServerLabel,
      className: "control-show-dummy-server",
      onClick: () => {
        if (this.showDummyServerButton.disabled) {
          return;
        }
        this.dispatchEvent(new CustomEvent("showdummyserver"));
      },
    });
    this.footerActions.appendChild(this.showDummyServerButton);
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
    this.modeToggle?.setActive(this.mode);
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
    if (!this.container || !this.scrollContainer) return;
    const isPortrait = Boolean(this._layoutMediaQuery?.matches);
    this.container.classList.toggle("is-portrait", isPortrait);

    if (this.autoStartButton) {
      if (isPortrait) {
        this.container.insertBefore(
          this.autoStartButton,
          this.container.firstChild
        );
      } else {
        const referenceNode = this.footer ?? null;
        this.container.insertBefore(this.autoStartButton, referenceNode);
      }
    }

    if (this.toggleWrapper) {
      this.scrollContainer.insertBefore(
        this.toggleWrapper,
        this.scrollContainer.firstChild
      );
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
    this.dispatchNumberOfBetsChange();
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
    if (!this.autoAdvancedContent || !this.autoAdvancedToggleControl) return;
    const isActive = Boolean(this.isAdvancedEnabled);
    this.autoAdvancedContent.hidden = !isActive;
    this.autoAdvancedToggleControl.setActive(isActive);
  }

  setStrategyMode(key, mode) {
    const normalized = mode === "increase" ? "increase" : "reset";
    if (key === "win") {
      if (this.onWinMode === normalized) {
        return;
      }
      this.onWinMode = normalized;
      this.updateOnWinMode();
      this.dispatchStrategyModeChange("win");
    } else {
      if (this.onLossMode === normalized) {
        return;
      }
      this.onLossMode = normalized;
      this.updateOnLossMode();
      this.dispatchStrategyModeChange("loss");
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

  dispatchNumberOfBetsChange() {
    this.dispatchEvent(
      new CustomEvent("numberofbetschange", {
        detail: { value: this.getNumberOfBetsValue() },
      })
    );
  }

  dispatchStrategyModeChange(key) {
    const mode = key === "win" ? this.onWinMode : this.onLossMode;
    this.dispatchEvent(
      new CustomEvent("strategychange", {
        detail: { key: key === "win" ? "win" : "loss", mode },
      })
    );
  }

  dispatchStrategyValueChange(key, value) {
    this.dispatchEvent(
      new CustomEvent("strategyvaluechange", {
        detail: { key: key === "win" ? "win" : "loss", value },
      })
    );
  }

  dispatchStopOnProfitChange(value) {
    this.dispatchEvent(
      new CustomEvent("stoponprofitchange", {
        detail: { value },
      })
    );
  }

  dispatchStopOnLossChange(value) {
    this.dispatchEvent(
      new CustomEvent("stoponlosschange", {
        detail: { value },
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

  setAnimationsEnabled(value, { emit = true } = {}) {
    const normalized = Boolean(value);
    if (this.animationsEnabled === normalized) {
      this.updateAnimationToggle();
      return;
    }
    this.animationsEnabled = normalized;
    this.updateAnimationToggle();
    if (emit) {
      this.dispatchAnimationsChange();
    }
  }

  getAnimationsEnabled() {
    return Boolean(this.animationsEnabled);
  }

  updateAnimationToggle() {
    if (!this.animationToggleControl) return;
    this.animationToggleControl.setActive(Boolean(this.animationsEnabled));
  }

  dispatchAnimationsChange() {
    this.dispatchEvent(
      new CustomEvent("animationschange", {
        detail: { enabled: Boolean(this.animationsEnabled) },
      })
    );
  }

  setDummyServerPanelVisibility(isVisible) {
    if (!this.showDummyServerButton) return;
    const disabled = Boolean(isVisible);
    this.showDummyServerButton.disabled = disabled;
    this.showDummyServerButton.classList.toggle("is-disabled", disabled);
    this.showDummyServerButton.setAttribute("aria-disabled", String(disabled));
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
    if (this.autoAdvancedToggleControl) {
      this.autoAdvancedToggleControl.setDisabled(!clickable);
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
