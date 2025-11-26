import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
} from "pixi.js";
import headsIconUrl from "../../assets/sprites/Heads.svg";
import tailsIconUrl from "../../assets/sprites/Tails.svg";

const DEFAULT_BACKGROUND = 0x091b26;
const HISTORY_SIZE = 10;
const COIN_ANIMATION_DURATION = 50; // ticks
const COIN_BASE_RADIUS = 130;
const COIN_SCALE_FACTOR = 0.85;
const HISTORY_BAR_HEIGHT = 54;
const HISTORY_SLOT_WIDTH = 32;
const HISTORY_SLOT_HEIGHT = 28;

const COLORS = {
  headsRing: 0xf6a400,
  headsCenter: 0x0c1f2b,
  tailsFill: 0x536aff,
  tailsHole: 0x0c1f2b,
  tailsStroke: 0x2f46b5,
  historyFrame: 0x0f2734,
  historyEmpty: 0x153243,
  historyBorder: 0x224558,
  historyDisabled: 0x3a5161,
};

class Coin {
  constructor({ textures, baseRadius }) {
    this.textures = textures;
    this.baseRadius = baseRadius;

    this.container = new Container();
    this.sprite = new Sprite({
      texture: textures.heads,
      width: baseRadius * 2,
      height: baseRadius * 2,
    });
    this.sprite.anchor.set(0.5);
    this.container.addChild(this.sprite);
  }

  get view() {
    return this.container;
  }

  setPosition(x, y) {
    this.container.position.set(x, y);
  }

  setScale(scale) {
    this.container.scale.set(scale);
  }

  getScale() {
    return { x: this.container.scale.x, y: this.container.scale.y };
  }

  setFace(face) {
    const isHeads = face === "heads";
    this.sprite.texture = isHeads ? this.textures.heads : this.textures.tails;
    this.sprite.width = this.baseRadius * 2;
    this.sprite.height = this.baseRadius * 2;

    this.container.rotation = 0;
    this.container.scale.y = this.container.scale.x;
  }
}

function resolveRoot(mount) {
  const root = typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) {
    throw new Error("createGame: mount element not found");
  }
  return root;
}

function measureRootSize(root, fallbackSize) {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, rect.width || root.clientWidth || fallbackSize);
  const height = Math.max(1, rect.height || root.clientHeight || width);
  return { width, height };
}

export async function createGame(mount, opts = {}) {
  const root = resolveRoot(mount);
  const loader = root.querySelector?.(".coin-loader");
  const initialSize = Math.max(1, opts.size ?? 400);
  const backgroundColor = opts.backgroundColor ?? DEFAULT_BACKGROUND;
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const coinScaleFactor =
    Number.isFinite(opts.coinSize) && opts.coinSize > 0
      ? opts.coinSize
      : COIN_SCALE_FACTOR;

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = "100%";
  }
  if (!root.style.maxWidth) {
    root.style.maxWidth = "100%";
  }

  const app = new Application();
  const { width: startWidth, height: startHeight } = measureRootSize(
    root,
    initialSize
  );

  if (loader) {
    loader.remove();
  }

  await app.init({
    background: backgroundColor,
    width: startWidth,
    height: startHeight,
    antialias: true,
    autoDensity: true,
  });

  root.innerHTML = "";
  root.appendChild(app.canvas);

  if (loader) {
    loader.classList.add("coin-loader--active");
    root.appendChild(loader);
  }

  const stage = new Container();
  app.stage.addChild(stage);

  const statusText = new Text({
    text: "Pick a side and place your bet",
    style: new TextStyle({
      fill: "#c5d5e2",
      fontSize: 12,
      fontFamily,
    }),
    visible: false,
  });
  statusText.anchor.set(0, 1);
  stage.addChild(statusText);

  const [headsTexture, tailsTexture] = await Promise.all([
    Assets.load(headsIconUrl),
    Assets.load(tailsIconUrl),
  ]);

  if (loader) {
    requestAnimationFrame(() => {
      loader.classList.add("coin-loader--hidden");
      loader.addEventListener(
        "transitionend",
        () => loader.remove(),
        { once: true }
      );
    });
  }

  const coinTextures = {
    heads: headsTexture,
    tails: tailsTexture,
  };

  const coin = new Coin({ textures: coinTextures, baseRadius: COIN_BASE_RADIUS });
  stage.addChild(coin.view);

  const historyBar = new Graphics();
  stage.addChild(historyBar);

  const historySlots = Array.from({ length: HISTORY_SIZE }, () => {
    const graphic = new Graphics();
    stage.addChild(graphic);
    return graphic;
  });

  const state = {
    roundActive: false,
    betAmount: 0,
    result: null,
    history: [],
    historyDisabled: false,
    showAnimations: true,
  };

  function layout() {
    const { width, height } = measureRootSize(root, initialSize);
    app.renderer.resize(width, height);

    const coinAreaHeight = Math.max(120, height - HISTORY_BAR_HEIGHT - 8);
    const coinScale =
      (Math.min(width, coinAreaHeight) / (COIN_BASE_RADIUS * 2.2)) *
      coinScaleFactor;

    coin.setPosition(width / 2, coinAreaHeight / 2 + 8);
    coin.setScale(coinScale);

    statusText.position.set(18, coinAreaHeight - 12);

    const barX = 18;
    const barWidth = width - barX * 2;
    const barY = height - HISTORY_BAR_HEIGHT + 10;
    const barHeight = HISTORY_BAR_HEIGHT - 20;
    historyBar
      .clear()
      .roundRect(barX, barY, barWidth, barHeight, 12)
      .fill({ color: COLORS.historyFrame });

    const availableWidth = barWidth - 24;
    const slotGap = Math.max(
      6,
      Math.min(12, (availableWidth - HISTORY_SLOT_WIDTH * HISTORY_SIZE) / (HISTORY_SIZE - 1))
    );
    const totalSlotsWidth =
      HISTORY_SLOT_WIDTH * HISTORY_SIZE + slotGap * (HISTORY_SIZE - 1);
    const startX = barX + (barWidth - totalSlotsWidth) / 2;
    const centerY = barY + barHeight / 2;
    historySlots.forEach((slot, index) => {
      const x = startX + index * (HISTORY_SLOT_WIDTH + slotGap);
      slot.position.set(x, centerY - HISTORY_SLOT_HEIGHT / 2);
    });
  }

  function updateStatus(message) {
    statusText.text = message;
    statusText.visible = false;
  }

  function startBet({ amount = 0 } = {}) {
    state.roundActive = true;
    state.betAmount = Number(amount) || 0;
    state.result = null;
    updateStatus(`Bet placed: ${state.betAmount}`);
  }

  function completeBet({ resultText = "Round complete" } = {}) {
    state.roundActive = false;
    state.result = resultText;
    updateStatus(resultText);
  }

  function reset() {
    state.roundActive = false;
    state.betAmount = 0;
    state.result = null;
    state.history = [];
    updateHistory([]);
    updateStatus("Choose a side to start flipping");
    drawCoinFace("tails");
  }

  function drawCoinFace(result) {
    coin.setFace(result);
  }

  function setFace(result) {
    drawCoinFace(result);
  }

  function playFlip(result, { instant = false } = {}) {
    if (!state.showAnimations || instant) {
      drawCoinFace(result);
      return Promise.resolve();
    }

    // Ensure the ticker is running so the animation can complete even if it was
    // previously stopped by an animations toggle or render pause.
    if (!app.ticker.started) {
      app.ticker.start();
    }

    const { y: baseScaleY } = coin.getScale();

    return new Promise((resolve) => {
      let tick = 0;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        app.ticker.remove(spin);
        drawCoinFace(result);
        resolve();
      };

      const spin = (delta) => {
        tick += delta;
        coin.view.rotation += 0.25 * delta;
        const squash = Math.max(0.35, Math.abs(Math.cos(tick * 0.3)));
        coin.view.scale.y = squash * baseScaleY;
        if (tick >= COIN_ANIMATION_DURATION) finish();
      };

      app.ticker.add(spin);

      // Fail-safe in case the ticker stalls; ensures the round completes.
      setTimeout(finish, (COIN_ANIMATION_DURATION / 60) * 1000 + 200);
    });
  }

  function updateStats({ balance = 0, streak = 0, multiplier = 1 } = {}) {
    // The redesigned board hides the running balance and streak indicators to
    // match the reference layout. The method remains for compatibility with
    // existing calls but intentionally avoids rendering any text.
    void balance;
    void streak;
    void multiplier;
  }

  function drawHistorySlot(slot, value, { disabled = false } = {}) {
    const width = HISTORY_SLOT_WIDTH;
    const height = HISTORY_SLOT_HEIGHT;
    // removeChildren() returns an array and is not chainable with Graphics clear()
    slot.removeChildren();
    slot
      .clear()
      .roundRect(0, 0, width, height, 8)
      .fill({ color: COLORS.historyEmpty })
      .stroke({ color: COLORS.historyBorder, width: 2 });

    if (!value) return;

    const isHeads = value.toUpperCase() === "H";
    const primary = disabled ? COLORS.historyDisabled : isHeads ? COLORS.headsRing : COLORS.tailsFill;
    const cutout = disabled ? COLORS.historyDisabled : isHeads ? COLORS.headsCenter : COLORS.tailsHole;

    const centerX = width / 2;
    const centerY = height / 2;

    if (isHeads) {
      slot.circle(centerX, centerY, height * 0.42).fill({ color: primary });
      slot.circle(centerX, centerY, height * 0.24).fill({ color: cutout });
    } else {
      slot
        .circle(centerX, centerY, height * 0.42)
        .fill({ color: primary })
        .moveTo(centerX, centerY - height * 0.5)
        .lineTo(centerX + height * 0.4, centerY)
        .lineTo(centerX, centerY + height * 0.5)
        .lineTo(centerX - height * 0.4, centerY)
        .closePath()
        .fill({ color: cutout })
        .stroke({ color: COLORS.tailsStroke, width: 2, join: "round" });
    }
  }

  function updateHistory(history = [], { disabled = false } = {}) {
    state.history = history.slice(-HISTORY_SIZE);
    state.historyDisabled = disabled;
    for (let i = 0; i < HISTORY_SIZE; i += 1) {
      drawHistorySlot(historySlots[i], state.history[i], { disabled });
    }
  }

  function setAnimationsEnabled(enabled) {
    state.showAnimations = enabled !== false;
    app.ticker.stop();
    if (enabled !== false) {
      app.ticker.start();
    }
  }

  function destroy() {
    window.removeEventListener("resize", layout);
    app.destroy(true);
    if (app.canvas?.parentNode === root) {
      root.removeChild(app.canvas);
    }
  }

  window.addEventListener("resize", layout);
  layout();

  return {
    app,
    reset,
    destroy,
    startBet,
    completeBet,
    setAnimationsEnabled,
    playFlip,
    updateStats,
    updateHistory,
    updateStatus,
    setFace,
    getState: () => ({ ...state }),
  };
}
