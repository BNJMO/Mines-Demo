import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

const DEFAULT_BACKGROUND = 0x091b26;
const HISTORY_SIZE = 10;
const COIN_ANIMATION_DURATION = 50; // ticks
const COIN_BASE_RADIUS = 130;
const HISTORY_BAR_HEIGHT = 64;

const COLORS = {
  headsPrimary: 0xfda83c,
  headsHighlight: 0xffc666,
  headsShadow: 0x8a5112,
  tailsPrimary: 0x3c5cff,
  tailsHighlight: 0x5d7aff,
  tailsShadow: 0x14264f,
  historyFrame: 0x0f2734,
  historyEmpty: 0x153243,
};

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
  const initialSize = Math.max(1, opts.size ?? 400);
  const backgroundColor = opts.backgroundColor ?? DEFAULT_BACKGROUND;
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";

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

  await app.init({
    background: backgroundColor,
    width: startWidth,
    height: startHeight,
    antialias: true,
    autoDensity: true,
  });

  root.innerHTML = "";
  root.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  const statsText = new Text({
    text: "",
    style: new TextStyle({
      fill: "#7bdcb5",
      fontSize: 13,
      fontFamily,
      letterSpacing: 0.5,
    }),
  });
  statsText.anchor.set(0, 0);
  stage.addChild(statsText);

  const statusText = new Text({
    text: "Waiting for bet",
    style: new TextStyle({
      fill: "#c5d5e2",
      fontSize: 14,
      fontFamily,
    }),
  });
  statusText.anchor.set(0, 1);
  stage.addChild(statusText);

  const coinContainer = new Container();
  stage.addChild(coinContainer);

  const coinBase = new Graphics();
  const coinDiamond = new Graphics();
  const coinHighlight = new Graphics();
  coinContainer.addChild(coinBase, coinDiamond, coinHighlight);

  const historyBar = new Graphics();
  stage.addChild(historyBar);

  const historyLabel = new Text({
    text: "History",
    style: new TextStyle({
      fill: "#93aabb",
      fontSize: 12,
      fontFamily,
      letterSpacing: 0.5,
    }),
  });
  historyLabel.anchor.set(0, 0.5);
  stage.addChild(historyLabel);

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
    showAnimations: true,
  };

  function layout() {
    const { width, height } = measureRootSize(root, initialSize);
    app.renderer.resize(width, height);

    const coinAreaHeight = Math.max(120, height - HISTORY_BAR_HEIGHT - 12);
    const coinScale = Math.min(width, coinAreaHeight) / (COIN_BASE_RADIUS * 2.2);

    coinContainer.position.set(width / 2, coinAreaHeight / 2 + 8);
    coinContainer.scale.set(coinScale);

    statsText.position.set(18, 14);
    statusText.position.set(18, coinAreaHeight - 10);

    const barWidth = width - 36;
    historyBar
      .clear()
      .roundRect(18, height - HISTORY_BAR_HEIGHT + 8, barWidth, HISTORY_BAR_HEIGHT - 20, 12)
      .fill({ color: COLORS.historyFrame });

    historyLabel.position.set(32, height - HISTORY_BAR_HEIGHT / 2 + 2);

    const slotWidth = 32;
    const slotGap = 8;
    const startX = historyLabel.x + historyLabel.width + 12;
    const centerY = historyLabel.y;
    historySlots.forEach((slot, index) => {
      const x = startX + index * (slotWidth + slotGap);
      slot.position.set(x, centerY - 14);
    });
  }

  function updateStatus(message) {
    statusText.text = message;
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
    updateStatus("Waiting for bet");
    drawCoinFace("tails");
  }

  function drawCoinFace(result) {
    const isHeads = result === "heads";
    const primary = isHeads ? COLORS.headsPrimary : COLORS.tailsPrimary;
    const highlight = isHeads ? COLORS.headsHighlight : COLORS.tailsHighlight;
    const shadow = isHeads ? COLORS.headsShadow : COLORS.tailsShadow;

    coinBase
      .clear()
      .circle(0, 0, COIN_BASE_RADIUS)
      .fill({ color: primary })
      .stroke({ color: highlight, width: 16, join: "round" })
      .circle(0, 0, COIN_BASE_RADIUS * 0.82)
      .stroke({ color: shadow, width: 12, join: "round" });

    coinDiamond
      .clear()
      .moveTo(0, -COIN_BASE_RADIUS * 0.55)
      .lineTo(COIN_BASE_RADIUS * 0.75, 0)
      .lineTo(0, COIN_BASE_RADIUS * 0.55)
      .lineTo(-COIN_BASE_RADIUS * 0.75, 0)
      .closePath()
      .fill({ color: shadow })
      .stroke({ color: highlight, width: 6, join: "round" });

    coinHighlight
      .clear()
      .circle(-COIN_BASE_RADIUS * 0.28, COIN_BASE_RADIUS * 0.22, COIN_BASE_RADIUS * 0.09)
      .fill({ color: highlight, alpha: 0.65 })
      .circle(COIN_BASE_RADIUS * 0.22, -COIN_BASE_RADIUS * 0.24, COIN_BASE_RADIUS * 0.11)
      .fill({ color: highlight, alpha: 0.85 });

    coinContainer.rotation = 0;
    coinContainer.scale.y = Math.abs(coinContainer.scale.y || 1);
  }

  function setFace(result) {
    drawCoinFace(result);
  }

  function playFlip(result, { instant = false } = {}) {
    if (!state.showAnimations || instant) {
      drawCoinFace(result);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let tick = 0;
      const spin = (delta) => {
        tick += delta;
        coinContainer.rotation += 0.25 * delta;
        coinContainer.scale.y = Math.cos(tick * 0.3);
        if (tick >= COIN_ANIMATION_DURATION) {
          app.ticker.remove(spin);
          drawCoinFace(result);
          resolve();
        }
      };

      app.ticker.add(spin);
    });
  }

  function updateStats({ balance = 0, streak = 0, multiplier = 1 } = {}) {
    statsText.text = `Balance ${balance.toFixed(2)}  •  Streak ${streak}  •  ${multiplier.toFixed(2)}×`;
  }

  function drawHistorySlot(slot, value) {
    const width = 32;
    const height = 28;
    slot
      .removeChildren()
      .clear()
      .roundRect(0, 0, width, height, 8)
      .fill({ color: COLORS.historyEmpty });

    if (!value) return;

    const isHeads = value.toUpperCase() === "H";
    const primary = isHeads ? COLORS.headsPrimary : COLORS.tailsPrimary;
    const accent = isHeads ? COLORS.headsShadow : COLORS.tailsShadow;

    const centerX = width / 2;
    const centerY = height / 2;

    if (isHeads) {
      slot.circle(centerX, centerY, height * 0.38).fill({ color: primary });
      slot.circle(centerX, centerY, height * 0.22).fill({ color: accent });
    } else {
      slot
        .moveTo(centerX, centerY - height * 0.44)
        .lineTo(centerX + height * 0.36, centerY)
        .lineTo(centerX, centerY + height * 0.44)
        .lineTo(centerX - height * 0.36, centerY)
        .closePath()
        .fill({ color: primary })
        .stroke({ color: accent, width: 2, join: "round" });
    }
  }

  function updateHistory(history = []) {
    state.history = history.slice(-HISTORY_SIZE);
    for (let i = 0; i < HISTORY_SIZE; i += 1) {
      drawHistorySlot(historySlots[i], state.history[i]);
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
