import { Application, Container } from "pixi.js";
import Ease from "./ease.js";

function getMountElement(mount) {
  if (typeof mount === "string") {
    const element = document.querySelector(mount);
    if (!element) {
      throw new Error(`Mount element not found for selector: ${mount}`);
    }
    return element;
  }

  if (mount instanceof HTMLElement) {
    return mount;
  }

  throw new Error("Mount element must be a selector or HTMLElement");
}

function toNumberOrHex(color) {
  if (typeof color === "number") return color;
  if (typeof color === "string") {
    if (color.startsWith("#")) {
      return Number.parseInt(color.slice(1), 16);
    }
    return color;
  }
  return 0x000000;
}

function resolveSize(opts) {
  if (opts.width || opts.height) {
    return {
      width: Math.max(1, opts.width ?? opts.height ?? 600),
      height: Math.max(1, opts.height ?? opts.width ?? 600),
    };
  }
  const size = Math.max(1, opts.size ?? 600);
  return { width: size, height: size };
}

function applyCanvasSizing(canvas, { width, height }) {
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.maxWidth = `${width}px`;
  canvas.style.maxHeight = `${height}px`;
}

function createPlaceholderStage(app) {
  const layer = new Container();
  layer.name = "GameLayer";
  app.stage.addChild(layer);
  return layer;
}

async function loadSoundLibrary() {
  try {
    const soundModule = await import("@pixi/sound");
    return soundModule.sound;
  } catch (error) {
    console.warn("Sounds disabled:", error.message);
    return {
      add: (alias, options) => {
        if (options && options.loaded) {
          setTimeout(() => options.loaded(), 0);
        }
      },
      play: () => {},
      stop: () => {},
      exists: () => false,
    };
  }
}

export function tween(app, { duration = 300, update, complete, ease = (t) => t }) {
  const start = performance.now();

  const step = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    update?.(ease(t));

    if (t >= 1) {
      app.ticker.remove(step);
      complete?.();
    }
  };

  app.ticker.add(step);
}

export async function createGame(mount, opts = {}) {
  const mountElement = getMountElement(mount);
  mountElement.innerHTML = "";

  const sound = await loadSoundLibrary();
  const { width, height } = resolveSize(opts);
  let currentBackground = toNumberOrHex(opts.backgroundColor ?? 0x121212);

  const app = new Application();
  await app.init({
    background: currentBackground,
    width,
    height,
    antialias: true,
  });

  applyCanvasSizing(app.canvas, { width, height });
  mountElement.appendChild(app.canvas);

  const gameLayer = createPlaceholderStage(app);

  const api = {
    app,
    stage: gameLayer,
    sound,
    ease: Ease,
    reset: () => {},
    destroy: () => {
      app.destroy(true);
      mountElement.innerHTML = "";
    },
    setBackgroundColor: (color) => {
      const resolved = toNumberOrHex(color);
      app.renderer.background.color = resolved;
      currentBackground = resolved;
    },
    getBackgroundColor: () => currentBackground,
    resize: (size) => {
      if (typeof size === "number") {
        app.renderer.resize(size, size);
        applyCanvasSizing(app.canvas, { width: size, height: size });
        return;
      }

      if (size && typeof size === "object") {
        const nextWidth = Math.max(1, size.width ?? width);
        const nextHeight = Math.max(1, size.height ?? height);
        app.renderer.resize(nextWidth, nextHeight);
        applyCanvasSizing(app.canvas, { width: nextWidth, height: nextHeight });
      }
    },
  };

  return api;
}

export { Ease };
