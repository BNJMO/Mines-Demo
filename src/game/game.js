import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

const DEFAULT_BACKGROUND = 0x091b26;
const HISTORY_SIZE = 10;
const COIN_ANIMATION_DURATION = 50; // ticks

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

  const statusText = new Text({
    text: "Waiting for bet",
    style: new TextStyle({
      fill: "#ffffff",
      fontSize: 20,
      fontFamily,
    }),
  });
  statusText.anchor.set(0.5);
  stage.addChild(statusText);

  const statsText = new Text({
    text: "",
    style: new TextStyle({
      fill: "#7bdcb5",
      fontSize: 14,
      fontFamily,
    }),
  });
  statsText.anchor.set(0.5, 0);
  stage.addChild(statsText);

  const historyLabel = new Text({
    text: "History:",
    style: new TextStyle({
      fill: "#9eb3c2",
      fontSize: 12,
      fontFamily,
    }),
  });
  historyLabel.anchor.set(0, 0.5);
  stage.addChild(historyLabel);

  const historyText = new Text({
    text: "",
    style: new TextStyle({
      fill: "#ffffff",
      fontSize: 12,
      fontFamily,
    }),
  });
  historyText.anchor.set(0, 0.5);
  stage.addChild(historyText);

  const coinContainer = new Container();
  stage.addChild(coinContainer);

  const coinFaceHeads = new Graphics()
    .circle(0, 0, 70)
    .fill({ color: 0xffa726 })
    .stroke({ color: 0xffe0b2, width: 6 });
  const headsLabel = new Text({
    text: "HEADS",
    style: new TextStyle({
      fill: "#2b1d0e",
      fontSize: 18,
      fontWeight: "700",
      fontFamily,
    }),
  });
  headsLabel.anchor.set(0.5);
  coinFaceHeads.addChild(headsLabel);

  const coinFaceTails = new Graphics()
    .moveTo(0, -70)
    .lineTo(60, 0)
    .lineTo(0, 70)
    .lineTo(-60, 0)
    .closePath()
    .fill({ color: 0x42a5f5 })
    .stroke({ color: 0xbbdefb, width: 6 });
  const tailsLabel = new Text({
    text: "TAILS",
    style: new TextStyle({
      fill: "#0b1f35",
      fontSize: 18,
      fontWeight: "700",
      fontFamily,
    }),
  });
  tailsLabel.anchor.set(0.5);
  coinFaceTails.addChild(tailsLabel);

  coinContainer.addChild(coinFaceHeads, coinFaceTails);
  coinFaceTails.visible = false;

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
    statusText.position.set(width / 2, height / 2 + 100);
    statsText.position.set(width / 2, 16);
    coinContainer.position.set(width / 2, height / 2 + 10);
    historyLabel.position.set(12, height - 24);
    historyText.position.set(historyLabel.x + historyLabel.width + 8, height - 24);
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
  }

  function setFace(result) {
    const isHeads = result === "heads";
    coinFaceHeads.visible = isHeads;
    coinFaceTails.visible = !isHeads;
    coinContainer.rotation = 0;
    coinContainer.scale.set(1);
  }

  function playFlip(result, { instant = false } = {}) {
    if (!state.showAnimations || instant) {
      setFace(result);
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
          setFace(result);
          resolve();
        }
      };

      app.ticker.add(spin);
    });
  }

  function updateStats({ balance = 0, streak = 0, multiplier = 1 } = {}) {
    statsText.text = `Balance: $${balance.toFixed(2)}  •  Streak: ${streak}  •  Multiplier: ${multiplier.toFixed(2)}×`;
  }

  function updateHistory(history = []) {
    state.history = history.slice(-HISTORY_SIZE);
    historyText.text = state.history.map((entry) => entry.toUpperCase()).join("  ");
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
