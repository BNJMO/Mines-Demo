import { Application, Container } from "pixi.js";
import { FlipGame, createFlipAppForMount } from "../games/flip/FlipGame.js";

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

async function initPixiApp(root, initialSize, backgroundColor) {
  const app = new Application();
  const { width: startWidth, height: startHeight } = measureRootSize(root, initialSize);

  await app.init({
    background: backgroundColor,
    width: startWidth,
    height: startHeight,
    antialias: true,
    autoDensity: true,
  });

  root.innerHTML = "";
  root.appendChild(app.canvas);
  return app;
}

export async function createGame(mount, opts = {}) {
  const root = resolveRoot(mount);
  const controlPanelRoot = resolveRoot(opts.controlPanelMount ?? "#control-panel");
  const initialSize = Math.max(1, opts.size ?? 400);
  const backgroundColor = opts.backgroundColor ?? DEFAULT_BACKGROUND;

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = "100%";
  }
  if (!root.style.maxWidth) {
    root.style.maxWidth = "100%";
  }

  const app = await initPixiApp(root, initialSize, backgroundColor);
  const controlPanelApp = await createFlipAppForMount(controlPanelRoot, {
    background: 0x0a1a26,
  });

  const flipGame = new FlipGame({
    app,
    controlPanelContainer: controlPanelApp.stage,
    networkRNG: opts.networkRNG,
  });
  await flipGame.init();

  const stage = app.stage ?? new Container();

  function setAnimationsEnabled(enabled) {
    app.ticker.stop();
    controlPanelApp.ticker.stop();
    if (enabled !== false) {
      app.ticker.start();
      controlPanelApp.ticker.start();
    }
  }

  function destroy() {
    flipGame.destroy();
    app.destroy(true);
    controlPanelApp.destroy(true);
    if (app.canvas?.parentNode === root) {
      root.removeChild(app.canvas);
    }
    if (controlPanelApp.canvas?.parentNode === controlPanelRoot) {
      controlPanelRoot.removeChild(controlPanelApp.canvas);
    }
  }

  window.app = app;

  return {
    app,
    controlPanelApp,
    flipGame,
    destroy,
    setAnimationsEnabled,
    getState: () => ({ ...flipGame.state }),
  };
}
