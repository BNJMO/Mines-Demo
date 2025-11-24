import { Color, Container, EventEmitter, Graphics, Sprite, Text, TextStyle } from "pixi.js";

const BUTTON_HEIGHT = 54;

function makeButton({ label, texture, width = 200, onPress }) {
  const button = new Container();
  const sprite = new Sprite(texture);
  sprite.width = width;
  sprite.height = BUTTON_HEIGHT;
  sprite.anchor.set(0.5);
  button.addChild(sprite);

  const text = new Text({
    text: label,
    style: new TextStyle({
      fill: "#ffffff",
      fontSize: 18,
      fontWeight: "700",
    }),
  });
  text.anchor.set(0.5);
  button.addChild(text);

  button.eventMode = "static";
  button.cursor = "pointer";
  button.on("pointertap", () => onPress?.());
  button.on("pointerover", () => (sprite.tint = 0xaad6ff));
  button.on("pointerout", () => (sprite.tint = 0xffffff));

  return { button, sprite, text };
}

function makeToggleButton(label, texture, { onPress }) {
  const { button, sprite, text } = makeButton({ label, texture, onPress });
  sprite.width = 120;
  return { button, sprite, text };
}

function makeValueBadge(label, color = "#1d2b3c") {
  const chip = new Graphics();
  chip.roundRect(-70, -20, 140, 40, 12).fill(new Color(color));
  const text = new Text({
    text: label,
    style: new TextStyle({ fill: "#ffffff", fontSize: 14 }),
  });
  text.anchor.set(0.5);
  const container = new Container();
  container.addChild(chip, text);
  return { container, text, chip };
}

export class FlipUI extends EventEmitter {
  constructor({ assets, container, width, height }) {
    super();
    this.assets = assets;
    this.container = container;
    this.width = width;
    this.height = height;
    this.history = [];
    this.autoOptions = { rounds: 10, stopOnLoss: false, stopOnMultiplier: 0 };
    this.chosenSide = "heads";
    this.betValue = 1;

    this.buildLayout();
    this.registerKeyboard();
  }

  registerKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        this.emit("flip");
      }
      if (e.key === "ArrowLeft") {
        this.setSide("heads", { emit: true });
      }
      if (e.key === "ArrowRight") {
        this.setSide("tails", { emit: true });
      }
    });
  }

  buildLayout() {
    this.container.removeChildren();
    const pad = 12;
    let currentY = 20;

    const title = new Text({
      text: "Flip",
      style: new TextStyle({
        fill: "#ffffff",
        fontSize: 28,
        fontWeight: "800",
      }),
    });
    title.x = pad;
    title.y = currentY;
    this.container.addChild(title);
    currentY += 38;

    this.balanceBadge = makeValueBadge("Balance: 0", "#0e5c8a");
    this.balanceBadge.container.position.set(pad + 80, currentY + 20);
    this.container.addChild(this.balanceBadge.container);
    currentY += 60;

    const betLabel = new Text({
      text: "Bet Amount",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 14 }),
    });
    betLabel.position.set(pad, currentY);
    this.container.addChild(betLabel);
    currentY += 20;

    this.betBox = new Container();
    this.betBox.position.set(pad + 90, currentY);
    this.container.addChild(this.betBox);

    const betBg = new Graphics();
    betBg.roundRect(-90, -20, 180, 40, 12).fill(new Color("#0f2436"));
    betBg.stroke({ width: 2, color: 0x1e7fbe });
    this.betText = new Text({
      text: this.betValue.toFixed(2),
      style: new TextStyle({ fill: "#ffffff", fontSize: 18, fontWeight: "700" }),
    });
    this.betText.anchor.set(0.5);
    this.betBox.addChild(betBg, this.betText);
    this.betBox.eventMode = "static";
    this.betBox.cursor = "text";
    this.betBox.on("pointertap", () => {
      const value = prompt("Enter bet amount", this.betValue);
      if (value !== null) {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          this.setBet(num, { emit: true });
        }
      }
    });

    const betControls = new Container();
    betControls.position.set(pad + 240, currentY);
    this.container.addChild(betControls);

    const presets = [0.1, 1, 10];
    presets.forEach((value, idx) => {
      const btn = new Graphics();
      btn.roundRect(-30, -18, 60, 36, 10).fill(new Color("#143043"));
      const txt = new Text({ text: `+${value}`, style: new TextStyle({ fill: "#fff", fontSize: 12 }) });
      txt.anchor.set(0.5);
      const c = new Container();
      c.addChild(btn, txt);
      c.position.set(idx * 68, 0);
      c.eventMode = "static";
      c.cursor = "pointer";
      c.on("pointertap", () => this.adjustBet(value));
      betControls.addChild(c);
    });

    const minusBtn = new Graphics();
    minusBtn.roundRect(-30, -18, 60, 36, 10).fill(new Color("#401a1a"));
    const minusTxt = new Text({
      text: "-",
      style: new TextStyle({ fill: "#fff", fontSize: 16, fontWeight: "700" }),
    });
    minusTxt.anchor.set(0.5);
    const minusContainer = new Container();
    minusContainer.addChild(minusBtn, minusTxt);
    minusContainer.position.set(presets.length * 68 + 10, 0);
    minusContainer.eventMode = "static";
    minusContainer.cursor = "pointer";
    minusContainer.on("pointertap", () => this.adjustBet(-1));
    betControls.addChild(minusContainer);

    const maxBtn = new Graphics();
    maxBtn.roundRect(-36, -18, 72, 36, 10).fill(new Color("#2b4bff"));
    const maxTxt = new Text({
      text: "Max",
      style: new TextStyle({ fill: "#fff", fontSize: 12, fontWeight: "700" }),
    });
    maxTxt.anchor.set(0.5);
    const maxContainer = new Container();
    maxContainer.addChild(maxBtn, maxTxt);
    maxContainer.position.set(presets.length * 68 + 80, 0);
    maxContainer.eventMode = "static";
    maxContainer.cursor = "pointer";
    maxContainer.on("pointertap", () => this.emit("maxbet"));
    betControls.addChild(maxContainer);

    currentY += 70;

    const sideLabel = new Text({ text: "Pick a side", style: new TextStyle({ fill: "#9fb4c7", fontSize: 14 }) });
    sideLabel.position.set(pad, currentY);
    this.container.addChild(sideLabel);
    currentY += 24;

    const sideButtons = new Container();
    sideButtons.position.set(pad + 40, currentY + 26);
    this.container.addChild(sideButtons);

    const { button: headsBtn } = makeToggleButton("Heads", this.assets.button, {
      onPress: () => this.setSide("heads", { emit: true }),
    });
    const { button: tailsBtn } = makeToggleButton("Tails", this.assets.button, {
      onPress: () => this.setSide("tails", { emit: true }),
    });
    headsBtn.position.set(0, 0);
    tailsBtn.position.set(150, 0);
    sideButtons.addChild(headsBtn, tailsBtn);
    this.headsBtn = headsBtn;
    this.tailsBtn = tailsBtn;

    currentY += 70;

    this.multiplierBadge = makeValueBadge("x2.00", "#1f4c24");
    this.multiplierBadge.container.position.set(pad + 80, currentY);
    this.container.addChild(this.multiplierBadge.container);

    this.streakBadge = makeValueBadge("Streak: 0", "#3a2b4d");
    this.streakBadge.container.position.set(pad + 260, currentY);
    this.container.addChild(this.streakBadge.container);

    currentY += 60;

    const { button: flipBtn } = makeButton({
      label: "Flip",
      texture: this.assets.button,
      width: 220,
      onPress: () => this.emit("flip"),
    });
    flipBtn.position.set(pad + 120, currentY);
    this.container.addChild(flipBtn);
    this.flipBtn = flipBtn;

    const autoToggle = new Graphics();
    autoToggle.roundRect(-24, -12, 48, 24, 12).fill(new Color("#0e5c8a"));
    const autoKnob = new Graphics();
    autoKnob.circle(-8, 0, 10).fill(new Color("#ffffff"));
    const autoContainer = new Container();
    autoContainer.position.set(pad + 320, currentY);
    autoContainer.addChild(autoToggle, autoKnob);
    autoContainer.eventMode = "static";
    autoContainer.cursor = "pointer";
    autoContainer.on("pointertap", () => this.emit("autoplaytoggle"));
    this.container.addChild(autoContainer);
    this.autoToggle = { autoToggle, autoKnob, autoContainer };

    const autoOptionsLabel = new Text({
      text: "Autoplay Rounds",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 12 }),
    });
    autoOptionsLabel.position.set(pad, currentY + 36);
    this.container.addChild(autoOptionsLabel);

    this.roundsText = new Text({
      text: this.autoOptions.rounds.toString(),
      style: new TextStyle({ fill: "#ffffff", fontSize: 14, fontWeight: "700" }),
    });
    this.roundsText.position.set(pad + 140, currentY + 34);
    this.container.addChild(this.roundsText);

    const roundsMinus = new Graphics();
    roundsMinus.roundRect(-14, -12, 28, 24, 8).fill(new Color("#19324a"));
    const roundsMinusTxt = new Text({ text: "-", style: new TextStyle({ fill: "#fff" }) });
    roundsMinusTxt.anchor.set(0.5);
    const roundsMinusContainer = new Container();
    roundsMinusContainer.addChild(roundsMinus, roundsMinusTxt);
    roundsMinusContainer.position.set(pad + 100, currentY + 46);
    roundsMinusContainer.eventMode = "static";
    roundsMinusContainer.cursor = "pointer";
    roundsMinusContainer.on("pointertap", () => this.updateAutoRounds(-1));
    this.container.addChild(roundsMinusContainer);

    const roundsPlus = new Graphics();
    roundsPlus.roundRect(-14, -12, 28, 24, 8).fill(new Color("#19324a"));
    const roundsPlusTxt = new Text({ text: "+", style: new TextStyle({ fill: "#fff" }) });
    roundsPlusTxt.anchor.set(0.5);
    const roundsPlusContainer = new Container();
    roundsPlusContainer.addChild(roundsPlus, roundsPlusTxt);
    roundsPlusContainer.position.set(pad + 180, currentY + 46);
    roundsPlusContainer.eventMode = "static";
    roundsPlusContainer.cursor = "pointer";
    roundsPlusContainer.on("pointertap", () => this.updateAutoRounds(1));
    this.container.addChild(roundsPlusContainer);

    const stopLossLabel = new Text({
      text: "Stop on loss",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 12 }),
    });
    stopLossLabel.position.set(pad + 230, currentY + 36);
    this.container.addChild(stopLossLabel);

    const stopLossToggle = new Graphics();
    stopLossToggle.roundRect(-16, -10, 32, 20, 10).fill(new Color("#20364b"));
    const stopKnob = new Graphics();
    stopKnob.circle(-8, 0, 8).fill(new Color("#fff"));
    const stopContainer = new Container();
    stopContainer.addChild(stopLossToggle, stopKnob);
    stopContainer.position.set(pad + 320, currentY + 46);
    stopContainer.eventMode = "static";
    stopContainer.cursor = "pointer";
    stopContainer.on("pointertap", () => this.toggleStopOnLoss());
    this.stopLossToggle = { stopLossToggle, stopKnob, stopContainer };
    this.container.addChild(stopContainer);

    const stopMultLabel = new Text({
      text: "Stop @ x",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 12 }),
    });
    stopMultLabel.position.set(pad, currentY + 70);
    this.container.addChild(stopMultLabel);

    this.stopMultiplierText = new Text({
      text: this.autoOptions.stopOnMultiplier.toFixed(2),
      style: new TextStyle({ fill: "#ffffff", fontSize: 14 }),
    });
    this.stopMultiplierText.position.set(pad + 90, currentY + 68);
    this.container.addChild(this.stopMultiplierText);

    const stopPlus = new Graphics();
    stopPlus.roundRect(-14, -12, 28, 24, 8).fill(new Color("#19324a"));
    const stopPlusTxt = new Text({ text: "+", style: new TextStyle({ fill: "#fff" }) });
    stopPlusTxt.anchor.set(0.5);
    const stopPlusContainer = new Container();
    stopPlusContainer.addChild(stopPlus, stopPlusTxt);
    stopPlusContainer.position.set(pad + 140, currentY + 80);
    stopPlusContainer.eventMode = "static";
    stopPlusContainer.cursor = "pointer";
    stopPlusContainer.on("pointertap", () => this.bumpStopMultiplier(0.5));
    this.container.addChild(stopPlusContainer);

    const stopMinus = new Graphics();
    stopMinus.roundRect(-14, -12, 28, 24, 8).fill(new Color("#19324a"));
    const stopMinusTxt = new Text({ text: "-", style: new TextStyle({ fill: "#fff" }) });
    stopMinusTxt.anchor.set(0.5);
    const stopMinusContainer = new Container();
    stopMinusContainer.addChild(stopMinus, stopMinusTxt);
    stopMinusContainer.position.set(pad + 50, currentY + 80);
    stopMinusContainer.eventMode = "static";
    stopMinusContainer.cursor = "pointer";
    stopMinusContainer.on("pointertap", () => this.bumpStopMultiplier(-0.5));
    this.container.addChild(stopMinusContainer);

    currentY += 90;
    this.refreshAutoUI();

    this.lastPayoutText = new Text({
      text: "Last payout: 0",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 14 }),
    });
    this.lastPayoutText.position.set(pad, currentY);
    this.container.addChild(this.lastPayoutText);

    this.nextPayoutText = new Text({
      text: "Next: 0",
      style: new TextStyle({ fill: "#9fb4c7", fontSize: 14 }),
    });
    this.nextPayoutText.position.set(pad + 240, currentY);
    this.container.addChild(this.nextPayoutText);

    currentY += 32;

    this.historyRow = new Container();
    this.historyRow.position.set(pad, currentY);
    this.container.addChild(this.historyRow);
  }

  setBalance(value) {
    this.balanceBadge.text.text = `Balance: ${value.toFixed(2)}`;
  }

  setBet(value, { emit = false } = {}) {
    this.betValue = Math.max(0, Number(value) || 0);
    this.betText.text = this.betValue.toFixed(2);
    if (emit) this.emit("betchange", this.betValue);
  }

  adjustBet(delta) {
    this.setBet(this.betValue + delta, { emit: true });
  }

  setSide(side, { emit = false } = {}) {
    this.chosenSide = side === "tails" ? "tails" : "heads";
    this.headsBtn.alpha = this.chosenSide === "heads" ? 1 : 0.6;
    this.tailsBtn.alpha = this.chosenSide === "tails" ? 1 : 0.6;
    if (emit) this.emit("sidechange", this.chosenSide);
  }

  setMultiplier(multiplier) {
    this.multiplierBadge.text.text = `x${multiplier.toFixed(2)}`;
  }

  setStreak(streak) {
    this.streakBadge.text.text = `Streak: ${streak}`;
  }

  setLastPayout(value) {
    this.lastPayoutText.text = `Last payout: ${value.toFixed(2)}`;
  }

  setNextPayout(value) {
    this.nextPayoutText.text = `Next: ${value.toFixed(2)}`;
  }

  setHistory(history) {
    this.historyRow.removeChildren();
    history.slice(-30).forEach((result, idx) => {
      const chip = new Graphics();
      chip.circle(0, 0, 10).fill(new Color(result === "heads" ? "#1ec8b6" : "#fbbc05"));
      chip.position.set(idx * 16, 0);
      this.historyRow.addChild(chip);
    });
  }

  updateAutoRounds(delta) {
    const next = Math.max(1, this.autoOptions.rounds + delta);
    this.setAutoOptions({ rounds: next });
    this.refreshAutoUI();
    this.emit("autoconfig", this.getAutoOptions());
  }

  toggleStopOnLoss() {
    this.setAutoOptions({ stopOnLoss: !this.autoOptions.stopOnLoss });
    this.refreshAutoUI();
    this.emit("autoconfig", this.getAutoOptions());
  }

  bumpStopMultiplier(delta) {
    const next = Math.max(0, this.autoOptions.stopOnMultiplier + delta);
    this.setAutoOptions({ stopOnMultiplier: next });
    this.refreshAutoUI();
    this.emit("autoconfig", this.getAutoOptions());
  }

  refreshAutoUI() {
    if (this.roundsText) {
      this.roundsText.text = this.autoOptions.rounds.toString();
    }
    if (this.stopMultiplierText) {
      this.stopMultiplierText.text = this.autoOptions.stopOnMultiplier.toFixed(2);
    }
    if (this.stopLossToggle) {
      this.stopLossToggle.stopKnob.x = this.autoOptions.stopOnLoss ? 8 : -8;
      this.stopLossToggle.stopLossToggle.tint = this.autoOptions.stopOnLoss ? 0x2b4bff : 0x20364b;
    }
  }

  setAutoOptions(options) {
    this.autoOptions = { ...this.autoOptions, ...options };
    this.refreshAutoUI();
  }

  getAutoOptions() {
    return { ...this.autoOptions };
  }

  disableInputs() {
    this.flipBtn.eventMode = "none";
    this.headsBtn.eventMode = "none";
    this.tailsBtn.eventMode = "none";
  }

  enableInputs() {
    this.flipBtn.eventMode = "static";
    this.headsBtn.eventMode = "static";
    this.tailsBtn.eventMode = "static";
  }
}
