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
import spriteSheetHHUrl from "../../assets/sprites/SHH.png";
import spriteSheetHTUrl from "../../assets/sprites/SHT.png";
import spriteSheetTHUrl from "../../assets/sprites/STH.png";
import spriteSheetTTUrl from "../../assets/sprites/STT.png";
import headsIconUrl from "../../assets/sprites/Heads.svg";
import tailsIconUrl from "../../assets/sprites/Tails.svg";

const DEFAULT_BACKGROUND = 0x091b26;
const HISTORY_SIZE = 20;
const COIN_ANIMATION_DURATION = 200; // ticks
const COIN_BASE_RADIUS = 130;
const COIN_SCALE_FACTOR = 0.85;
const COIN_SPRITE_SIZE = 425;
const COIN_SPRITE_GAP = 10;
const COIN_SPRITE_ROWS = 5;
const HISTORY_BAR_HEIGHT = 70;
const HISTORY_SLOT_WIDTH = 30;
const HISTORY_SLOT_HEIGHT = 24;
const HISTORY_SLOT_MIN_WIDTH = 18;
const HISTORY_SLOT_MIN_HEIGHT = 16;
const FRAME_PREVIEW_SIZE = 72;
const FRAME_PREVIEW_PADDING = 8;

const COLORS = {
  headsRing: 0xf6a400,
  headsCenter: 0x0c1f2b,
  tailsFill: 0x536aff,
  tailsHole: 0x0c1f2b,
  tailsStroke: 0x2f46b5,
  historyPanel: 0x0d2432,
  historyFrame: 0x0b1f2a,
  historyEmpty: 0x122d3b,
  historyBorder: 0x1c4559,
  historyDisabled: 0x3a5161,
  historyLabel: 0x0b202e,
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
    this.sprite.position.set(0, 0);
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
    const resolvedDuration =
      Number.isFinite(duration) && duration > 0 ? duration : COIN_ANIMATION_DURATION;
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
        const safeDelta = Number.isFinite(delta) ? delta : 1;
        progress = Math.min(resolvedDuration, progress + safeDelta);
        const normalizedProgress = resolvedDuration
          ? Math.min(1, Math.max(0, progress / resolvedDuration))
          : 1;
        const frameIndex = Math.min(
          totalFrames - 1,
          Math.max(0, Math.floor(normalizedProgress * totalFrames))
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

        if (progress >= resolvedDuration) {
          finish();
        }
      };

      ticker.add(step);

      setTimeout(finish, (resolvedDuration / 60) * 1000 + 200);

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
  const coinAnimationDuration = Number.isFinite(opts.coinAnimationDuration)
    ? Math.max(1, Math.floor(opts.coinAnimationDuration))
    : Number.isFinite(opts.animationDuration)
      ? Math.max(1, Math.floor(opts.animationDuration))
      : COIN_ANIMATION_DURATION;
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

  const [sheetHH, sheetHT, sheetTH, sheetTT, headsIconTexture, tailsIconTexture] =
    await Promise.all([
      Assets.load(spriteSheetHHUrl),
      Assets.load(spriteSheetHTUrl),
      Assets.load(spriteSheetTHUrl),
      Assets.load(spriteSheetTTUrl),
      Assets.load(headsIconUrl),
      Assets.load(tailsIconUrl),
    ]);

  const coinAnimations = {
    HH: sliceSpriteSheet(sheetHH, resolveSliceOptions(sliceOptions, "HH")),
    HT: sliceSpriteSheet(sheetHT, resolveSliceOptions(sliceOptions, "HT")),
    TH: sliceSpriteSheet(sheetTH, resolveSliceOptions(sliceOptions, "TH")),
    TT: sliceSpriteSheet(sheetTT, resolveSliceOptions(sliceOptions, "TT")),
  };

  const coinTextures = {
    heads: coinAnimations.HH?.[0] ?? Texture.WHITE,
    tails: coinAnimations.TT?.[0] ?? Texture.WHITE,
  };

  const historyIconTextures = {
    heads: headsIconTexture ?? Texture.WHITE,
    tails: tailsIconTexture ?? Texture.WHITE,
  };

  let historySlotWidth = HISTORY_SLOT_WIDTH;
  let historySlotHeight = HISTORY_SLOT_HEIGHT;

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

  const historyContainer = new Container();
  stage.addChild(historyContainer);

  const historyPanel = new Graphics();
  historyContainer.addChild(historyPanel);

  const historyLabelContainer = new Container();
  const historyLabelBg = new Graphics();
  historyLabelContainer.addChild(historyLabelBg);

  const historyBar = new Graphics();
  const historyTrackContainer = new Container();
  historyTrackContainer.addChild(historyBar);
  historyContainer.addChild(historyTrackContainer);

  const historyLabel = new Text({
    text: "History",
    style: new TextStyle({
      fill: "#c0d7e7",
      fontSize: 12,
      fontWeight: "600",
      fontFamily,
    }),
  });
  historyLabel.anchor.set(0, 0.5);
  historyLabelContainer.addChild(historyLabel);
  historyContainer.addChild(historyLabelContainer);

  const historySlots = Array.from({ length: HISTORY_SIZE }, () => {
    const container = new Container();
    const background = new Graphics();
    const icon = new Sprite({ texture: Texture.WHITE });
    icon.anchor.set(0.5);
    icon.visible = false;
    container.addChild(background);
    container.addChild(icon);
    historyTrackContainer.addChild(container);
    return { container, background, icon };
  });

  const state = {
    roundActive: false,
    betAmount: 0,
    result: null,
    history: [],
    historyDisabled: false,
    showAnimations: true,
    currentFace: "heads",
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
    const barWidth = Math.max(260, width - barX * 2);
    const barY = height - HISTORY_BAR_HEIGHT + 6;
    const barHeight = HISTORY_BAR_HEIGHT - 8;

    const panelPaddingX = 14;
    const panelPaddingY = 10;
    const trackGapY = 8;
    const labelPaddingX = 12;
    const labelPaddingY = 6;

    historyContainer.position.set(barX, barY);
    historyPanel
      .clear()
      .roundRect(0, 0, barWidth, barHeight, 12)
      .fill({ color: COLORS.historyPanel, alpha: 0.96 })
      .stroke({ color: COLORS.historyBorder, width: 1.5 });

    const trackWidth = barWidth - panelPaddingX * 2;
    const labelWidth = Math.min(
      trackWidth,
      Math.max(historyLabel.width + labelPaddingX * 2, 96)
    );
    const labelHeight = historyLabel.height + labelPaddingY * 2;

    historyLabelContainer.position.set(panelPaddingX, panelPaddingY);
    historyLabelBg
      .clear()
      .roundRect(0, 0, labelWidth, labelHeight, 8)
      .fill({ color: COLORS.historyLabel, alpha: 0.95 })
      .stroke({ color: COLORS.historyBorder, width: 1.25, alpha: 0.8 });

    historyLabel.position.set(labelPaddingX, labelPaddingY + historyLabel.height / 2);

    const trackY = panelPaddingY + labelHeight + trackGapY;
    const trackHeight = Math.max(34, barHeight - trackY - panelPaddingY);
    historyTrackContainer.position.set(panelPaddingX, trackY);
    historyBar
      .clear()
      .roundRect(0, 0, trackWidth, trackHeight, 8)
      .fill({ color: COLORS.historyFrame, alpha: 0.95 })
      .stroke({ color: COLORS.historyBorder, width: 1.5, alpha: 0.6 });

    const horizontalPadding = 12;
    const availableWidth = trackWidth - horizontalPadding * 2;
    const minGap = 4;
    const maxGap = 10;
    historySlotWidth = Math.min(
      HISTORY_SLOT_WIDTH,
      Math.max(
        HISTORY_SLOT_MIN_WIDTH,
        Math.floor(
          (availableWidth - minGap * (HISTORY_SIZE - 1)) / Math.max(1, HISTORY_SIZE)
        )
      )
    );
    const remainingWidth = Math.max(
      0,
      availableWidth - historySlotWidth * HISTORY_SIZE
    );
    const computedGap = remainingWidth / Math.max(1, HISTORY_SIZE - 1);
    const slotGap = Math.max(minGap, Math.min(maxGap, computedGap));
    const totalSlotsWidth =
      historySlotWidth * HISTORY_SIZE + slotGap * (HISTORY_SIZE - 1);
    historySlotHeight = Math.min(
      HISTORY_SLOT_HEIGHT,
      Math.max(
        HISTORY_SLOT_MIN_HEIGHT,
        Math.round(historySlotWidth * (HISTORY_SLOT_HEIGHT / HISTORY_SLOT_WIDTH))
      )
    );
    const startX = Math.max(horizontalPadding, (trackWidth - totalSlotsWidth) / 2);
    const centerY = trackHeight / 2;

    historySlots.forEach((slot, index) => {
      const x = startX + index * (historySlotWidth + slotGap);
      slot.container.position.set(x, centerY - historySlotHeight / 2);
    });

    updateHistory(state.history, { disabled: state.historyDisabled });
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
    const normalized = result === "tails" ? "tails" : "heads";
    state.currentFace = normalized;
    coin.setFace(normalized);
  }

  function setFace(result) {
    drawCoinFace(result);
    setFrameDebug(`Face: ${result}`);
  }

  function playFlip(result, { instant = false } = {}) {
    const targetFace = result === "tails" ? "tails" : "heads";
    coin.currentFace = state.currentFace === "tails" ? "tails" : "heads";

    if (!state.showAnimations || instant) {
      setFace(targetFace);
      return Promise.resolve();
    }

    // Ensure the ticker is running so the animation can complete even if it was
    // previously stopped by an animations toggle or render pause.
    if (!app.ticker.started) {
      app.ticker.start();
    }

    const handleFinish = (meta) => {
      state.currentFace = targetFace;
      setFrameDebug(`Face: ${targetFace}`);
      if (frameDebugEnabled) {
        showFrameComplete(meta);
      }
    };

    return coin.playFlipAnimation(targetFace, {
      ticker: app.ticker,
      duration: coinAnimationDuration,
      onFrame: frameDebugEnabled ? showFrameStep : undefined,
      onFinish: handleFinish,
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
    const width = historySlotWidth;
    const height = historySlotHeight;
    // removeChildren() returns an array and is not chainable with Graphics clear()
    slot.background.removeChildren();
    slot.background
      .clear()
      .roundRect(0, 0, width, height, 6)
      .fill({ color: COLORS.historyEmpty, alpha: 0.42 })
      .stroke({ color: COLORS.historyBorder, width: 1, alpha: 0.5 });

    slot.icon.visible = false;
    slot.icon.alpha = disabled ? 0.6 : 1;
    slot.icon.tint = disabled ? COLORS.historyDisabled : 0xffffff;

    if (!value) return;

    const isHeads = value.toUpperCase() === "H";
    slot.icon.texture = isHeads
      ? historyIconTextures.heads ?? Texture.WHITE
      : historyIconTextures.tails ?? Texture.WHITE;
    const iconSize = height * 0.82;
    slot.icon.width = iconSize;
    slot.icon.height = iconSize;
    slot.icon.position.set(width / 2, height / 2);
    slot.icon.visible = true;
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
