import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  Text,
  TextStyle,
} from "pixi.js";
import headsIconUrl from "../../assets/sprites/Heads.svg";
import tailsIconUrl from "../../assets/sprites/Tails.svg";
import spriteSheetHHUrl from "../../assets/sprites/SHH.png";
import spriteSheetHTUrl from "../../assets/sprites/SHT.png";
import spriteSheetTHUrl from "../../assets/sprites/STH.png";
import spriteSheetTTUrl from "../../assets/sprites/STT.png";

const DEFAULT_BACKGROUND = 0x091b26;
const HISTORY_SIZE = 10;
const COIN_ANIMATION_DURATION = 50; // ticks
const COIN_BASE_RADIUS = 130;
const COIN_SCALE_FACTOR = 0.85;
const COIN_SPRITE_SIZE = 425;
const COIN_SPRITE_GAP = 5;
const COIN_SPRITE_ROWS = 5;
const HISTORY_BAR_HEIGHT = 54;
const HISTORY_SLOT_WIDTH = 32;
const HISTORY_SLOT_HEIGHT = 28;
const FRAME_PREVIEW_SIZE = 72;
const FRAME_PREVIEW_PADDING = 8;

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
  constructor({ textures, animations, baseRadius }) {
    this.textures = textures;
    this.animations = animations;
    this.baseRadius = baseRadius;
    this.currentFace = "heads";

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

    this.currentFace = isHeads ? "heads" : "tails";
  }

  playFlipAnimation(targetFace, { ticker, duration, onFrame, onFinish }) {
    const from = this.currentFace === "tails" ? "T" : "H";
    const to = targetFace === "tails" ? "T" : "H";
    const animationKey = `${from}${to}`;
    const frames = this.animations?.[animationKey];

    if (!frames?.length) {
      this.setFace(targetFace);
      onFinish?.({ animationKey, targetFace });
      return Promise.resolve();
    }

    const totalFrames = frames.length;
    let finished = false;
    let progress = 0;

    return new Promise((resolve) => {
      this.container.rotation = 0;
      this.container.scale.y = this.container.scale.x;

      const finish = () => {
        if (finished) return;
        finished = true;
        ticker.remove(step);
        this.setFace(targetFace);
        onFinish?.({ animationKey, targetFace });
        resolve();
      };

      const step = (delta) => {
        progress = Math.min(duration, progress + delta);
        const frameIndex = Math.min(
          totalFrames - 1,
          Math.floor((progress / duration) * totalFrames)
        );
        this.sprite.texture = frames[frameIndex];
        this.sprite.width = this.baseRadius * 2;
        this.sprite.height = this.baseRadius * 2;

        onFrame?.({
          animationKey,
          frameIndex,
          totalFrames,
          targetFace,
        });

        if (progress >= duration) {
          finish();
        }
      };

      ticker.add(step);

      setTimeout(finish, (duration / 60) * 1000 + 200);

      onFrame?.({
        animationKey,
        frameIndex: 0,
        totalFrames,
        targetFace,
      });
    });
  }
}

function sliceSpriteSheet(
  spriteSheetTexture,
  {
    frameSize = COIN_SPRITE_SIZE,
    gap = 0,
    rows,
    columns,
  } = {}
) {
  const frames = [];

  const size = Number.isFinite(frameSize) && frameSize > 0
    ? Math.floor(frameSize)
    : COIN_SPRITE_SIZE;
  const frameStep = size + gap;
  const columnsCount = Number.isFinite(columns) && columns > 0
    ? Math.floor(columns)
    : Math.max(1, Math.floor((spriteSheetTexture.width + gap) / frameStep));
  const rowsCount = Number.isFinite(rows) && rows > 0
    ? Math.floor(rows)
    : Math.max(1, Math.floor((spriteSheetTexture.height + gap) / frameStep));

  for (let row = 0; row < rowsCount; row += 1) {
    for (let col = 0; col < columnsCount; col += 1) {
      const x = col * frameStep;
      const y = row * frameStep;

      if (x + size > spriteSheetTexture.width || y + size > spriteSheetTexture.height) {
        continue;
      }

      frames.push(
        new Texture({
          source: spriteSheetTexture.source,
          frame: new Rectangle(x, y, size, size),
        })
      );
    }
  }

  return frames;
}

function normalizeSpriteSheetOptions(raw = {}) {
  const normalize = (candidate = {}, fallback = {}) => {
    const frameSize = Number.isFinite(candidate.frameSize) && candidate.frameSize > 0
      ? Math.floor(candidate.frameSize)
      : fallback.frameSize ?? COIN_SPRITE_SIZE;
    const gap = Number.isFinite(candidate.gap) && candidate.gap >= 0
      ? Math.floor(candidate.gap)
      : fallback.gap ?? COIN_SPRITE_GAP;
    const rows = Number.isFinite(candidate.rows) && candidate.rows > 0
      ? Math.floor(candidate.rows)
      : fallback.rows;
    const columns = Number.isFinite(candidate.columns) && candidate.columns > 0
      ? Math.floor(candidate.columns)
      : fallback.columns;

    return { frameSize, gap, rows, columns };
  };

  const base = normalize(raw);
  const perAnimationRaw = raw.overrides || raw.perAnimation;
  const perAnimation = {};

  if (perAnimationRaw && typeof perAnimationRaw === "object") {
    for (const [key, value] of Object.entries(perAnimationRaw)) {
      perAnimation[key] = normalize(value, base);
    }
  }

  return { base, perAnimation };
}

function formatSpriteSheetOptions(options) {
  const rowLabel = Number.isFinite(options.rows)
    ? `${options.rows} row${options.rows === 1 ? "" : "s"}`
    : "auto rows";
  const columnLabel = Number.isFinite(options.columns)
    ? `${options.columns} column${options.columns === 1 ? "" : "s"}`
    : "auto columns";

  const parts = [`size ${options.frameSize}px`, `gap ${options.gap}px`, rowLabel, columnLabel];

  return parts.join(" · ");
}

function resolveSliceOptions(options, animationKey) {
  if (!options) return undefined;
  if (!animationKey) return options.base;
  return options.perAnimation?.[animationKey] || options.base;
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
  const initialSize = Math.max(1, opts.size ?? 400);
  const backgroundColor = opts.backgroundColor ?? DEFAULT_BACKGROUND;
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const coinScaleFactor =
    Number.isFinite(opts.coinSize) && opts.coinSize > 0
      ? opts.coinSize
      : COIN_SCALE_FACTOR;
  const sliceOptions = normalizeSpriteSheetOptions(opts.spriteSheet);

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

  const frameDebugEnabled = Boolean(opts.debugFrames);
  const frameDebugText = new Text({
    text: "",
    style: new TextStyle({
      fill: "#83e4ff",
      fontSize: 11,
      fontFamily,
      fontWeight: "600",
    }),
    visible: frameDebugEnabled,
  });
  frameDebugText.anchor.set(1, 0);
  stage.addChild(frameDebugText);

  const framePreview = new Container();
  framePreview.visible = frameDebugEnabled;
  stage.addChild(framePreview);

  const framePreviewBg = new Graphics();
  framePreview.addChild(framePreviewBg);

  const framePreviewSprite = new Sprite({
    texture: Texture.WHITE,
    width: FRAME_PREVIEW_SIZE,
    height: FRAME_PREVIEW_SIZE,
  });
  framePreview.addChild(framePreviewSprite);

  const framePreviewText = new Text({
    text: "",
    style: new TextStyle({
      fill: "#c5d5e2",
      fontSize: 11,
      fontFamily,
      fontWeight: "600",
    }),
    visible: frameDebugEnabled,
  });
  framePreview.addChild(framePreviewText);

  const framePreviewMeta = new Text({
    text: "",
    style: new TextStyle({
      fill: "#8fb3c9",
      fontSize: 11,
      fontFamily,
      fontWeight: "500",
    }),
    visible: frameDebugEnabled,
  });
  framePreview.addChild(framePreviewMeta);

  const [headsTexture, tailsTexture, sheetHH, sheetHT, sheetTH, sheetTT] =
    await Promise.all([
      Assets.load(headsIconUrl),
      Assets.load(tailsIconUrl),
      Assets.load(spriteSheetHHUrl),
      Assets.load(spriteSheetHTUrl),
      Assets.load(spriteSheetTHUrl),
      Assets.load(spriteSheetTTUrl),
    ]);

  const coinTextures = {
    heads: headsTexture,
    tails: tailsTexture,
  };

  const coinAnimations = {
    HH: sliceSpriteSheet(sheetHH, resolveSliceOptions(sliceOptions, "HH")),
    HT: sliceSpriteSheet(sheetHT, resolveSliceOptions(sliceOptions, "HT")),
    TH: sliceSpriteSheet(sheetTH, resolveSliceOptions(sliceOptions, "TH")),
    TT: sliceSpriteSheet(sheetTT, resolveSliceOptions(sliceOptions, "TT")),
  };

  const coin = new Coin({
    textures: coinTextures,
    animations: coinAnimations,
    baseRadius: COIN_BASE_RADIUS,
  });
  stage.addChild(coin.view);
  setFramePreview(
    coinAnimations.HH?.[0],
    "Sliced HH frame 1",
    resolveSliceOptions(sliceOptions, "HH")
  );
  setFrameDebug("Face: heads");

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

    frameDebugText.position.set(width - 12, 8);

    layoutFramePreview();

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

  function setFrameDebug(message) {
    if (!frameDebugEnabled) return;
    frameDebugText.text = message;
    frameDebugText.visible = true;
  }

  function clearFrameDebug() {
    if (!frameDebugEnabled) return;
    frameDebugText.visible = false;
  }

  function layoutFramePreview() {
    if (!frameDebugEnabled) return;

    framePreview.position.set(FRAME_PREVIEW_PADDING, FRAME_PREVIEW_PADDING);
    framePreviewSprite.position.set(FRAME_PREVIEW_PADDING, FRAME_PREVIEW_PADDING);
    framePreviewSprite.width = FRAME_PREVIEW_SIZE;
    framePreviewSprite.height = FRAME_PREVIEW_SIZE;

    const labels = [framePreviewText, framePreviewMeta].filter(
      (text) => text.visible && text.text
    );

    let nextY =
      FRAME_PREVIEW_SIZE + FRAME_PREVIEW_PADDING + (labels.length ? 6 : 0);
    for (const text of labels) {
      text.position.set(FRAME_PREVIEW_PADDING, nextY);
      nextY += text.height + 4;
    }

    const contentWidth = Math.max(
      FRAME_PREVIEW_SIZE,
      framePreviewText.visible ? framePreviewText.width : 0,
      framePreviewMeta.visible ? framePreviewMeta.width : 0
    );
    const boxWidth = contentWidth + FRAME_PREVIEW_PADDING * 2;
    const boxHeight = nextY + FRAME_PREVIEW_PADDING - (labels.length ? 4 : 0);

    framePreviewBg
      .clear()
      .roundRect(0, 0, boxWidth, boxHeight, 10)
      .fill({ color: COLORS.historyFrame })
      .stroke({ color: COLORS.historyBorder, width: 2 });
  }

  function setFramePreview(texture, label, optionsForLabel) {
    if (!frameDebugEnabled || !texture) return;

    framePreviewSprite.texture = texture;
    framePreviewText.text = label;
    framePreviewText.visible = true;
    const metaOptions = optionsForLabel || sliceOptions?.base;
    if (metaOptions) {
      framePreviewMeta.text = formatSpriteSheetOptions(metaOptions);
      framePreviewMeta.visible = true;
    } else {
      framePreviewMeta.visible = false;
    }

    layoutFramePreview();
  }

  function showFrameStep({ animationKey, frameIndex, totalFrames, targetFace }) {
    const faceLabel = targetFace === "tails" ? "tails" : "heads";
    setFrameDebug(
      `Anim ${animationKey}: frame ${frameIndex + 1}/${totalFrames} → ${faceLabel}`
    );

    const previewFrame = coinAnimations?.[animationKey]?.[frameIndex];
    const previewOptions = resolveSliceOptions(sliceOptions, animationKey);
    setFramePreview(
      previewFrame,
      `Sliced ${animationKey} frame ${frameIndex + 1}/${totalFrames}`,
      previewOptions
    );
  }

  function showFrameComplete({ animationKey, targetFace }) {
    const faceLabel = targetFace === "tails" ? "tails" : "heads";
    setFrameDebug(`Done ${animationKey} → ${faceLabel}`);

    const finalFrame = coinAnimations?.[animationKey]?.[0];
    if (finalFrame) {
      setFramePreview(
        finalFrame,
        `Sliced ${animationKey} sample`,
        resolveSliceOptions(sliceOptions, animationKey)
      );
    }
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
    setFace("tails");
  }

  function drawCoinFace(result) {
    coin.setFace(result);
  }

  function setFace(result) {
    drawCoinFace(result);
    setFrameDebug(`Face: ${result}`);
  }

  function playFlip(result, { instant = false } = {}) {
    if (!state.showAnimations || instant) {
      setFace(result);
      return Promise.resolve();
    }

    // Ensure the ticker is running so the animation can complete even if it was
    // previously stopped by an animations toggle or render pause.
    if (!app.ticker.started) {
      app.ticker.start();
    }

    return coin.playFlipAnimation(result, {
      ticker: app.ticker,
      duration: COIN_ANIMATION_DURATION,
      onFrame: frameDebugEnabled ? showFrameStep : undefined,
      onFinish: frameDebugEnabled ? showFrameComplete : undefined,
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
