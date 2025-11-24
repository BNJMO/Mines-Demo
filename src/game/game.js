import { Application, Container, Text, TextStyle } from "pixi.js";

const DEFAULT_BACKGROUND = 0x091b26;

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

  const state = {
    roundActive: false,
    betAmount: 0,
    result: null,
  };

  function layout() {
    const { width, height } = measureRootSize(root, initialSize);
    app.renderer.resize(width, height);
    statusText.position.set(width / 2, height / 2);
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
    updateStatus("Waiting for bet");
  }

  function setAnimationsEnabled(enabled) {
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
    getState: () => ({ ...state }),
  };
}
