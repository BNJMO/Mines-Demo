import {
  Application,
  Container,
  Graphics,
  Text,
  Texture,
  Rectangle,
  AnimatedSprite,
  Assets,
  Sprite,
  BlurFilter,
} from "pixi.js";

// Sound will be loaded inside createGame function
import Ease from "../ease.js";
import explosionSheetUrl from "../../assets/sprites/Explosion_Spritesheet.png";
import cardType0Url from "../../assets/sprites/cardType_0.png";
import cardType1Url from "../../assets/sprites/cardType_1.png";
import cardType2Url from "../../assets/sprites/cardType_2.png";
import cardType3Url from "../../assets/sprites/cardType_3.png";
import cardType4Url from "../../assets/sprites/cardType_4.png";
import cardType5Url from "../../assets/sprites/cardType_5.png";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import winningCardRevealedSoundUrl from "../../assets/sounds/WinningCardRevealed.wav";
import lostSoundUrl from "../../assets/sounds/Lost.wav";
import winSoundUrl from "../../assets/sounds/Win.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";

const PALETTE = {
  appBg: 0x091b26, // page/canvas background
  tileBase: 0x2b4756, // main tile face
  tileInset: 0x2b4756, // inner inset
  tileStroke: 0x080e11, // subtle outline
  tileStrokeFlipped: 0x0f0f0f, // subtle outline
  tileElevationBase: 0x1b2931, // visible lip beneath tile face
  tileElevationShadow: 0x091b26, // soft drop shadow
  hover: 0x528aa5, // hover
  pressedTint: 0x7a7a7a,
  defaultTint: 0xffffff,
  safeA: 0x0f181e, // outer
  safeAUnrevealed: 0x0f181e,
  safeB: 0x0f181e, // inner
  safeBUnrevealed: 0x0f181e,
  lossA: 0x0f181e,
  lossAUnrevealed: 0x0f181e,
  lossB: 0x0f181e,
  lossBUnrevealed: 0x0f181e,
  winPopupBorder: 0xeaff00,
  winPopupBackground: 0x091b26,
  winPopupMultiplierText: 0xeaff00,
  winPopupSeparationLine: 0x1b2931,
};

const AUTO_SELECTION_COLOR = 0x5800a5;

function tween(
  app,
  { duration = 300, update, complete, ease = (t) => t, skipUpdate = false }
) {
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    if (!skipUpdate || t >= 1) {
      const progress = skipUpdate && t >= 1 ? 1 : t;
      update?.(ease(progress));
    }
    if (t >= 1) {
      app.ticker.remove(step);
      complete?.();
    }
  };
  app.ticker.add(step);
}

export async function createGame(mount, opts = {}) {
  // Load sound library
  let sound;
  try {
    const soundModule = await import("@pixi/sound");
    sound = soundModule.sound;
  } catch (e) {
    console.warn("Sounds disabled:", e.message);
    // Dummy sound object - must call callbacks to prevent hanging!
    sound = {
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

  // Options
  const GRID = 3;
  const MATCHING_CARDS_REQUIRED = 3;
  const DEFAULT_CARD_TEXTURE_PATHS = [
    cardType0Url,
    cardType1Url,
    cardType2Url,
    cardType3Url,
    cardType4Url,
    cardType5Url,
  ];
  const incomingCardTexturePaths = Array.isArray(opts.cardTexturePaths)
    ? opts.cardTexturePaths.filter(Boolean)
    : DEFAULT_CARD_TEXTURE_PATHS;
  const maxTextureCount = Math.max(1, incomingCardTexturePaths.length);
  const clampCardTypeCount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return Math.min(maxTextureCount, Math.max(MATCHING_CARDS_REQUIRED, 3));
    }
    const base = Math.max(MATCHING_CARDS_REQUIRED, Math.floor(numeric));
    return Math.min(maxTextureCount, Math.max(1, base));
  };
  let cardTypeCount = clampCardTypeCount(
    opts.cardTypes ?? opts.cardTypeCount ?? 5
  );
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const initialSize = Math.max(1, opts.size ?? 400);
  const onCardSelected = opts.onCardSelected ?? null;
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const onAutoSelectionChange =
    typeof opts.onAutoSelectionChange === "function"
      ? (count) => opts.onAutoSelectionChange(count)
      : () => {};
  const backgroundColor = opts.backgroundColor ?? PALETTE.appBg;

  // Visuals
  const iconSizePercentage = opts.iconSizePercentage ?? 0.7;
  const iconRevealedSizeOpacity = opts.iconRevealedSizeOpacity ?? 0.4;
  const iconRevealedSizeFactor = opts.iconRevealedSizeFactor ?? 0.85;
  const cardsSpawnDuration = opts.cardsSpawnDuration ?? 350;
  const revealAllIntervalDelay = opts.revealAllIntervalDelay ?? 40;
  const autoResetDelayMs = Number(opts.autoResetDelayMs ?? 1500);
  const strokeWidth = opts.strokeWidth ?? 1;
  const gapBetweenTiles = opts.gapBetweenTiles ?? 0.012;

  // Animation Options
  let disableAnimations = opts.disableAnimations ?? false;
  /* Card Hover */
  const hoverEnabled = opts.hoverEnabled ?? true;
  const hoverEnterDuration = opts.hoverEnterDuration ?? 120;
  const hoverExitDuration = opts.hoverExitDuration ?? 200;
  const hoverTiltAxis = opts.hoverTiltAxis ?? "x"; // 'y' | 'x'
  const hoverSkewAmount = opts.hoverSkewAmount ?? 0.02;

  /* Card Selected Wiggle */
  const wiggleSelectionEnabled = opts.wiggleSelectionEnabled ?? true;
  const wiggleSelectionDuration = opts.wiggleSelectionDuration ?? 900;
  const wiggleSelectionTimes = opts.wiggleSelectionTimes ?? 15;
  const wiggleSelectionIntensity = opts.wiggleSelectionIntensity ?? 0.03;
  const wiggleSelectionScale = opts.wiggleSelectionScale ?? 0.005;

  /* Card Reveal Flip */
  const flipDelayMin = opts.flipDelayMin ?? 150;
  const flipDelayMax = opts.flipDelayMax ?? 500;
  const flipDuration = opts.flipDuration ?? 300;
  const flipEaseFunction = opts.flipEaseFunction ?? "easeInOutSine";

  /* Loss Explosion shake */
  const explosionShakeEnabled = opts.explosionShakeEnabled ?? true;
  const explosionShakeDuration = opts.explosionShakeDuration ?? 1000;
  const explosionShakeAmplitude = opts.explosionShakeAmplitude ?? 6;
  const explosionShakerotationAmplitude =
    opts.explosionShakerotationAmplitude ?? 0.012;
  const explosionShakeBaseFrequency = opts.explosionShakeBaseFrequency ?? 8;
  const explosionShakeSecondaryFrequency =
    opts.explosionShakeSecondaryFrequency ?? 13;

  /* Loss Explosion spritesheet */
  const explosionSheetEnabled = opts.explosionSheetEnabled ?? true;
  const explosionSheetPath = opts.explosionSheetPath ?? explosionSheetUrl;
  const explosionSheetCols = opts.explosionSheetCols ?? 7;
  const explosionSheetRows = opts.explosionSheetRows ?? 3;
  const explosionSheetFps = opts.explosionSheetFps ?? 24;
  const explosionSheetScaleFit = opts.explosionSheetScaleFit ?? 0.8;
  const explosionSheetOpacity = opts.explosionSheetOpacity ?? 0.75;

  /* Sound effects */
  const tileTapDownSoundPath = opts.tileTapDownSoundPath ?? tileTapDownSoundUrl;
  const tileFlipSoundPath = opts.tileFlipSoundPath ?? tileFlipSoundUrl;
  const tileHoverSoundPath = opts.tileHoverSoundPath ?? tileHoverSoundUrl;
  const winningCardRevealedSoundPath =
    opts.winningCardRevealedSoundPath ?? winningCardRevealedSoundUrl;
  const lossSoundPath = opts.lossSoundPath ?? lostSoundUrl;
  const winSoundPath = opts.winSoundPath ?? winSoundUrl;
  const gameStartSoundPath = opts.gameStartSoundPath ?? gameStartSoundUrl;
  const winningCardRevealPitchMin = Number(
    opts.winningCardRevealPitchMin ?? 1.0
  );
  const winningCardRevealPitchMax = Number(
    opts.winningCardRevealPitchMax ?? 1.5
  );

  const soundEffectPaths = {
    tileTapDown: tileTapDownSoundPath,
    tileFlip: tileFlipSoundPath,
    tileHover: tileHoverSoundPath,
    winningCardRevealed: winningCardRevealedSoundPath,
    loss: lossSoundPath,
    win: winSoundPath,
    gameStart: gameStartSoundPath,
  };

  const enabledSoundKeys = new Set(
    Object.entries(soundEffectPaths)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
  );

  const SOUND_ALIASES = {
    tileHover: "scratch.tileHover",
    tileTapDown: "scratch.tileTapDown",
    tileFlip: "scratch.tileFlip",
    winningCardRevealed: "scratch.winningCardRevealed",
    loss: "scratch.loss",
    win: "scratch.win",
    gameStart: "scratch.gameStart",
  };

  /* Win pop-up */
  const winPopupShowDuration = opts.winPopupShowDuration ?? 260;
  const winPopupWidth = opts.winPopupWidth ?? 240;
  const winPopupHeight = opts.winPopupHeight ?? 170;

  // Resolve mount element
  const root =
    typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("createGame: mount element not found");

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = `${initialSize}px`;
    root.style.maxWidth = "100%";
  }

  let explosionFrames = null;
  let explosionFrameW = 0;
  let explosionFrameH = 0;
  const activeExplosionSprites = new Set();
  let loadedCardTextures = [];
  let activeCardPool = [];
  try {
    await loadExplosionFrames();
  } catch (e) {
    console.error("loadExplosionFrames failed", e);
  }

  try {
    await loadCardTextures();
  } catch (e) {
    console.error("loadCardTextures failed", e);
  }

  try {
    await loadSoundEffects();
  } catch (e) {
    console.warn("loadSoundEffects failed (non-fatal)", e);
  }

  // PIXI app
  const app = new Application();
  try {
    await app.init({
      background: backgroundColor,
      width: initialSize,
      height: initialSize,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    // Clear the loading message
    root.innerHTML = "";

    // Append canvas
    root.appendChild(app.canvas);
  } catch (e) {
    console.error("PIXI init failed", e);
    throw e;
  }

  // Game state
  const board = new Container();
  const ui = new Container();
  app.stage.addChild(board, ui);

  const winPopup = createWinPopup();
  ui.addChild(winPopup.container);

  let tiles = [];
  let roundOutcome = "pending";
  let roundWinningTexture = null;
  let roundLayoutPrepared = false;
  let gameOver = false;
  let shouldPlayStartSound = true;
  let revealedSafe = 0;
  let totalSafe = 0;
  let waitingForChoice = false;
  let selectedTile = null;
  const autoSelectedTiles = new Set();
  const autoSelectionOrder = [];

  // API callbacks
  const onWin = opts.onWin ?? (() => {});
  const onGameOver = opts.onGameOver ?? (() => {});
  const onChange = opts.onChange ?? (() => {});

  // Game setup and state. TODO: remove later

  // Public API for host integration
  function reset({ preserveAutoSelections = false } = {}) {
    gameOver = false;
    hideWinPopup();
    roundOutcome = "pending";
    roundWinningTexture = null;
    roundLayoutPrepared = false;
    activeCardPool = [];
    shouldPlayStartSound = true;
    const preservedAutoSelections = preserveAutoSelections
      ? getAutoSelectionCoordinates()
      : null;
    const emitAutoSelectionChange = !preserveAutoSelections;
    buildBoard({ emitAutoSelectionChange });
    centerBoard();
    if (preserveAutoSelections && preservedAutoSelections?.length) {
      applyAutoSelectionsFromCoordinates(preservedAutoSelections);
    }
    onChange(getState());
  }

  function setCardTypeCount(n) {
    cardTypeCount = clampCardTypeCount(n);
    reset();
  }

  function getState() {
    return {
      grid: GRID,
      cardTypes: cardTypeCount,
      revealedSafe,
      totalSafe,
      gameOver,
      waitingForChoice,
      selectedTile: selectedTile
        ? { row: selectedTile.row, col: selectedTile.col }
        : null,
    };
  }

  function destroy() {
    try {
      ro.disconnect();
    } catch {}
    cleanupExplosionSprites();
    app.destroy(true);
    if (app.canvas?.parentNode === root) root.removeChild(app.canvas);
  }

  function revealCurrentlySelectedTile(expectedWinning = null) {
    if (selectedTile?._animating) {
      stopHover(selectedTile);
      stopWiggle(selectedTile);
    }

    if (
      !waitingForChoice ||
      !selectedTile ||
      selectedTile.revealed ||
      selectedTile._animating
    ) {
      return;
    }

    waitingForChoice = false;
    const tile = selectedTile;
    selectedTile = null;

    if (!roundLayoutPrepared) {
      const fallbackOutcome = expectedWinning === false ? "loss" : "win";
      if (!ensureRoundLayout(fallbackOutcome, tile)) {
        console.warn("Unable to prepare layout for selection");
        return;
      }
    }

    const isWinning = Boolean(tile.isWinningCard);
    if (expectedWinning != null && expectedWinning !== isWinning) {
      console.warn("Selection outcome mismatch with expected result");
    }

    revealTileWithFlip(tile, {
      outcome: isWinning ? "win" : "loss",
      isWinning,
    });
  }

  function setSelectedCardIsWin() {
    revealCurrentlySelectedTile(true);
  }

  function setSelectedCardIsLoss() {
    revealCurrentlySelectedTile(false);
  }

  function revealSelectedTile() {
    revealCurrentlySelectedTile(null);
  }

  // Game functions
  function createWinPopup() {
    const popupWidth = winPopupWidth;
    const popupHeight = winPopupHeight;

    const container = new Container();
    container.visible = false;
    container.scale.set(0);
    container.eventMode = "none";
    container.zIndex = 1000;

    const border = new Graphics();
    border
      .roundRect(
        -popupWidth / 2 - 10,
        -popupHeight / 2 - 10,
        popupWidth + 20,
        popupHeight + 20,
        32
      )
      .fill(PALETTE.winPopupBorder);

    const inner = new Graphics();
    inner
      .roundRect(-popupWidth / 2, -popupHeight / 2, popupWidth, popupHeight, 28)
      .fill(PALETTE.winPopupBackground);

    const multiplierVerticalOffset = -popupHeight / 2 + popupHeight * 0.28;
    const amountRowVerticalOffset = popupHeight / 2 - popupHeight * 0.25;

    const centerLine = new Graphics();
    const centerLinePadding = 70;
    const centerLineWidth = popupWidth - centerLinePadding * 2;
    const centerLineThickness = 5;
    centerLine
      .rect(
        -centerLineWidth / 2,
        -centerLineThickness / 2,
        centerLineWidth,
        centerLineThickness
      )
      .fill(PALETTE.winPopupSeparationLine);

    const multiplierText = new Text({
      text: "1.00×",
      style: {
        fill: PALETTE.winPopupMultiplierText,
        fontFamily,
        fontSize: 36,
        fontWeight: "700",
        align: "center",
      },
    });
    multiplierText.anchor.set(0.5);
    multiplierText.position.set(0, multiplierVerticalOffset);

    const amountRow = new Container();

    const amountText = new Text({
      text: "0.0",
      style: {
        fill: 0xffffff,
        fontFamily,
        fontSize: 24,
        fontWeight: "600",
        align: "center",
      },
    });
    amountText.anchor.set(0.5);
    amountRow.addChild(amountText);

    const coinContainer = new Container();
    const coinRadius = 16;
    const coinBg = new Graphics();
    coinBg.circle(0, 0, coinRadius).fill(0xf6a821);
    const coinText = new Text({
      text: "₿",
      style: {
        fill: 0xffffff,
        fontFamily,
        fontSize: 18,
        fontWeight: "700",
        align: "center",
      },
    });
    coinText.anchor.set(0.5);
    coinContainer.addChild(coinBg, coinText);
    amountRow.addChild(coinContainer);

    const layoutAmountRow = () => {
      const spacing = 20;
      const coinDiameter = coinRadius * 2;
      const totalWidth = amountText.width + spacing + coinDiameter;

      amountText.position.set(-(spacing / 2 + coinRadius), 0);
      coinContainer.position.set(totalWidth / 2 - coinRadius, 0);

      amountRow.position.set(0, amountRowVerticalOffset);
    };

    layoutAmountRow();

    container.addChild(border, inner, centerLine, multiplierText, amountRow);

    return {
      container,
      multiplierText,
      amountText,
      layoutAmountRow,
    };
  }

  function positionWinPopup() {
    winPopup.container.position.set(
      app.renderer.width / 2,
      app.renderer.height / 2
    );
  }

  function hideWinPopup() {
    winPopup.container.visible = false;
    winPopup.container.scale.set(0);
  }

  function formatMultiplier(multiplierValue) {
    if (
      typeof multiplierValue === "number" &&
      Number.isFinite(multiplierValue)
    ) {
      return `${multiplierValue.toFixed(2)}×`;
    }

    const raw = `${multiplierValue ?? ""}`;
    if (!raw) return "";
    return raw.endsWith("×") ? raw : `${raw}×`;
  }

  function formatAmount(amountValue) {
    if (typeof amountValue === "number" && Number.isFinite(amountValue)) {
      return amountValue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      });
    }

    return `${amountValue ?? ""}`;
  }

  function spawnWinPopup(multiplierValue, amountValue) {
    winPopup.multiplierText.text = formatMultiplier(multiplierValue);
    winPopup.amountText.text = formatAmount(amountValue);
    winPopup.layoutAmountRow();
    positionWinPopup();

    winPopup.container.visible = true;
    winPopup.container.alpha = 1;
    winPopup.container.scale.set(0);

    playSoundEffect("win");

    if (disableAnimations) {
      winPopup.container.scale.set(1);
      return;
    }

    tween(app, {
      duration: winPopupShowDuration,
      skipUpdate: disableAnimations,
      ease: (t) => Ease.easeOutQuad(t),
      update: (p) => {
        winPopup.container.scale.set(p);
      },
    });
  }

  async function loadCardTextures() {
    if (loadedCardTextures.length) return;

    const textures = [];
    for (let index = 0; index < incomingCardTexturePaths.length; index++) {
      const path = incomingCardTexturePaths[index];
      try {
        const texture = await Assets.load(path);
        textures.push({ id: `card-${index}`, texture, path });
      } catch (error) {
        console.warn(`Failed to load card texture at ${path}`, error);
      }
    }

    loadedCardTextures = textures;
  }

  async function loadExplosionFrames() {
    if (explosionFrames) return;

    const baseTex = await Assets.load(explosionSheetPath);

    const sheetW = baseTex.width;
    const sheetH = baseTex.height;

    explosionFrameW = Math.floor(sheetW / explosionSheetCols);
    explosionFrameH = Math.floor(sheetH / explosionSheetRows);

    explosionFrames = [];
    for (let r = 0; r < explosionSheetRows; r++) {
      for (let c = 0; c < explosionSheetCols; c++) {
        const rect = new Rectangle(
          c * explosionFrameW,
          r * explosionFrameH,
          explosionFrameW,
          explosionFrameH
        );

        explosionFrames.push(
          new Texture({ source: baseTex.source, frame: rect })
        );
      }
    }
  }

  function cleanupExplosionSprites() {
    for (const sprite of activeExplosionSprites) {
      if (!sprite.destroyed) {
        sprite.stop();
        sprite.destroy();
      }
    }
    activeExplosionSprites.clear();
  }

  function loadSoundEffect(key, path) {
    if (!enabledSoundKeys.has(key) || !path) {
      return Promise.resolve();
    }

    const alias = SOUND_ALIASES[key];
    if (!alias) {
      return Promise.resolve();
    }

    if (sound.exists?.(alias)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      sound.add(alias, {
        url: path,
        preload: true,
        loaded: resolve,
        error: resolve,
      });
    });
  }

  function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function refreshActiveCardPool() {
    if (!loadedCardTextures.length) {
      activeCardPool = [];
      return activeCardPool;
    }

    const pool = [...loadedCardTextures];
    shuffleInPlace(pool);
    const count = Math.min(cardTypeCount, pool.length);
    activeCardPool = pool.slice(0, Math.max(1, count));
    return activeCardPool;
  }

  function pickRandomTexture(pool, exclude) {
    const filtered = exclude
      ? pool.filter((entry) => entry !== exclude)
      : pool.slice();
    if (!filtered.length) {
      return pool[0] ?? null;
    }
    const index = Math.floor(Math.random() * filtered.length);
    return filtered[index];
  }

  function assignRoundLayout(outcome, selectedTile) {
    if (!selectedTile) return false;
    const pool = refreshActiveCardPool();
    if (!pool.length) {
      console.warn("No card textures available for round layout");
      return false;
    }

    const tilesToAssign = tiles.filter((t) => t && !t.destroyed);
    if (!tilesToAssign.length) {
      return false;
    }

    const availableTiles = tilesToAssign.filter((t) => t !== selectedTile);
    shuffleInPlace(availableTiles);

    if (outcome === "win") {
      const winningTexture = pickRandomTexture(pool);
      if (!winningTexture) {
        return false;
      }

      roundWinningTexture = winningTexture;

      const winningTiles = [selectedTile];
      const needed = Math.max(0, MATCHING_CARDS_REQUIRED - winningTiles.length);
      winningTiles.push(...availableTiles.slice(0, needed));

      if (winningTiles.length < MATCHING_CARDS_REQUIRED) {
        console.warn("Unable to allocate enough winning tiles for round");
        return false;
      }

      const assignedSet = new Set(winningTiles);
      const remainingTiles = tilesToAssign.filter((tile) => !assignedSet.has(tile));

      winningTiles.forEach((tile) =>
        assignTextureToTile(tile, winningTexture, { isWinning: true })
      );

      const counts = new Map();
      if (winningTexture.id) {
        counts.set(winningTexture.id, winningTiles.length);
      }

      if (
        !distributeNonWinningTextures(remainingTiles, pool, {
          excludedId: winningTexture.id,
          initialCounts: counts,
        })
      ) {
        return false;
      }

      totalSafe = MATCHING_CARDS_REQUIRED;
    } else {
      roundWinningTexture = null;
      if (!distributeNonWinningTextures(tilesToAssign, pool)) {
        return false;
      }

      totalSafe = 0;
    }

    revealedSafe = 0;
    roundOutcome = outcome;
    roundLayoutPrepared = true;
    return true;
  }

  function ensureRoundLayout(outcome, selectedTile) {
    if (!selectedTile) return false;
    if (roundOutcome === outcome) {
      return true;
    }
    if (roundOutcome !== "pending" && roundOutcome !== outcome) {
      return false;
    }
    if (roundLayoutPrepared && roundOutcome === outcome) {
      return true;
    }

    return assignRoundLayout(outcome, selectedTile);
  }

  function getTextureByIdentifier(identifier, pool) {
    if (identifier == null) {
      return null;
    }

    const normalizeId = (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        const index = Math.max(0, Math.floor(value) - 1);
        return `card-${index}`;
      }
      return null;
    };

    const normalizedId = normalizeId(identifier);
    if (!normalizedId) {
      return null;
    }

    const searchPool = Array.isArray(pool) && pool.length ? pool : loadedCardTextures;
    return (
      searchPool.find((entry) => entry?.id === normalizedId) ??
      loadedCardTextures.find((entry) => entry?.id === normalizedId) ??
      null
    );
  }

  function assignTextureToTile(tile, textureEntry, { isWinning = false } = {}) {
    tile.cardTexture = textureEntry?.texture ?? null;
    tile.cardTextureId = textureEntry?.id ?? null;
    tile.isWinningCard = Boolean(isWinning && textureEntry);
  }

  function ensurePoolVarietyForAssignments(
    pool,
    {
      excludedId = null,
      tilesNeeded = 0,
      limitPerType = Math.max(1, MATCHING_CARDS_REQUIRED - 1),
    } = {}
  ) {
    if (!tilesNeeded) {
      return pool;
    }

    const filtered = pool.filter(
      (entry) => entry && (!excludedId || entry.id !== excludedId)
    );
    const requiredTypes = Math.max(
      1,
      Math.ceil(tilesNeeded / Math.max(1, limitPerType))
    );

    if (filtered.length >= requiredTypes) {
      return pool;
    }

    const extras = loadedCardTextures.filter(
      (entry) =>
        entry &&
        (!excludedId || entry.id !== excludedId) &&
        !pool.includes(entry)
    );
    if (!extras.length) {
      return pool;
    }

    const additional = shuffleInPlace(extras.slice());
    const needed = Math.max(0, requiredTypes - filtered.length);
    if (!needed) {
      return pool;
    }

    return pool.concat(additional.slice(0, needed));
  }

  function distributeNonWinningTextures(
    tilesToAssign,
    pool,
    { excludedId = null, initialCounts = new Map() } = {}
  ) {
    if (!tilesToAssign?.length) {
      return true;
    }

    const limitPerType = Math.max(1, MATCHING_CARDS_REQUIRED - 1);
    pool = ensurePoolVarietyForAssignments(pool, {
      excludedId,
      tilesNeeded: tilesToAssign.length,
      limitPerType,
    });

    const usablePool = pool.filter(
      (entry) => entry && (!excludedId || entry.id !== excludedId)
    );
    if (!usablePool.length) {
      return false;
    }

    const counts = new Map(initialCounts);

    for (const tile of tilesToAssign) {
      let candidates = usablePool.filter(
        (entry) => (counts.get(entry.id) ?? 0) < limitPerType
      );

      if (!candidates.length) {
        let minCount = Infinity;
        for (const entry of usablePool) {
          const count = counts.get(entry.id) ?? 0;
          if (count < minCount) {
            minCount = count;
            candidates = [entry];
          } else if (count === minCount) {
            candidates.push(entry);
          }
        }
      }

      const selected = pickRandomTexture(candidates.length ? candidates : usablePool);
      assignTextureToTile(tile, selected, { isWinning: false });
      if (selected?.id) {
        counts.set(selected.id, (counts.get(selected.id) ?? 0) + 1);
      }
    }

    return true;
  }

  function expandPoolForLossScenario(pool) {
    const totalTiles = tiles.filter((t) => t && !t.destroyed).length;
    const requiredTypes = Math.max(
      1,
      Math.ceil(totalTiles / Math.max(1, MATCHING_CARDS_REQUIRED - 1))
    );

    if (pool.length >= requiredTypes) {
      return pool;
    }

    const extras = loadedCardTextures.filter((entry) => !pool.includes(entry));
    if (!extras.length) {
      return pool;
    }

    const additional = extras.slice();
    shuffleInPlace(additional);
    const needed = Math.max(0, requiredTypes - pool.length);
    return pool.concat(additional.slice(0, needed));
  }

  function applyPredeterminedLayout(outcome, winningCardType) {
    const tilesToAssign = tiles.filter((tile) => tile && !tile.destroyed);
    if (!tilesToAssign.length) {
      return false;
    }

    let pool = refreshActiveCardPool();
    if (!pool.length) {
      return false;
    }

    if (outcome === "loss") {
      pool = expandPoolForLossScenario(pool);
    }

    tilesToAssign.forEach((tile) => {
      tile.isWinningCard = false;
      tile.cardTexture = null;
      tile.cardTextureId = null;
    });

    const forcedSelectedTile =
      waitingForChoice && selectedTile && !selectedTile.destroyed
        ? selectedTile
        : null;

    if (outcome === "win") {
      let winningEntry = getTextureByIdentifier(winningCardType, pool);
      if (!winningEntry) {
        winningEntry = pickRandomTexture(pool);
      }
      if (!winningEntry) {
        return false;
      }

      roundWinningTexture = winningEntry;

      const availableTiles = tilesToAssign.filter((tile) => tile !== forcedSelectedTile);
      const shuffled = shuffleInPlace(availableTiles.slice());
      let winningTiles = [];
      if (forcedSelectedTile) {
        winningTiles.push(forcedSelectedTile);
      }
      const needed = Math.max(0, MATCHING_CARDS_REQUIRED - winningTiles.length);
      winningTiles = winningTiles.concat(shuffled.slice(0, needed));
      const assignedSet = new Set(winningTiles);
      const remainingTiles = tilesToAssign.filter((tile) => !assignedSet.has(tile));

      winningTiles.forEach((tile) =>
        assignTextureToTile(tile, winningEntry, { isWinning: true })
      );

      const counts = new Map();
      counts.set(winningEntry.id, winningTiles.length);
      if (!distributeNonWinningTextures(remainingTiles, pool, {
        excludedId: winningEntry.id,
        initialCounts: counts,
      })) {
        return false;
      }

      totalSafe = Math.min(MATCHING_CARDS_REQUIRED, winningTiles.length);
    } else {
      if (forcedSelectedTile) {
        assignTextureToTile(forcedSelectedTile, null, { isWinning: false });
      }
      roundWinningTexture = null;
      const success = distributeNonWinningTextures(tilesToAssign, pool);
      if (!success) {
        return false;
      }
      totalSafe = 0;
    }

    revealedSafe = 0;
    roundOutcome = outcome;
    roundLayoutPrepared = true;
    return true;
  }

  function determineBetResult(isWin, winningCardType) {
    const desiredOutcome = isWin ? "win" : "loss";

    if (roundLayoutPrepared && roundOutcome === desiredOutcome) {
      return true;
    }

    const applied = applyPredeterminedLayout(desiredOutcome, winningCardType);
    if (applied) {
      onChange(getState());
    }
    return applied;
  }

  async function loadSoundEffects() {
    const loaders = Object.entries(soundEffectPaths).map(([key, path]) =>
      loadSoundEffect(key, path)
    );

    await Promise.all(loaders);
  }

  function playSoundEffect(key, options = {}) {
    if (!enabledSoundKeys.has(key)) return;

    const alias = SOUND_ALIASES[key];
    if (!alias) return;

    try {
      sound.play(alias, options);
    } catch (err) {
      // Ignore playback errors so they don't interrupt gameplay
    }
  }

  function spawnExplosionSheetOnTile(tile) {
    if (!explosionSheetEnabled || !explosionFrames || !explosionFrames.length)
      return;

    const anim = new AnimatedSprite(explosionFrames);
    anim.loop = true;
    anim.animationSpeed = explosionSheetFps / 60;
    anim.anchor.set(0.5);
    anim.alpha = explosionSheetOpacity;

    const size = tile._tileSize;
    anim.position.set(size / 2, size / 2);

    const sx = (size * explosionSheetScaleFit) / explosionFrameW;
    const sy = (size * explosionSheetScaleFit) / explosionFrameH;
    anim.scale.set(Math.min(sx, sy));

    const wrap = tile._wrap;
    const iconIndex = wrap.getChildIndex(tile._icon);
    wrap.addChildAt(anim, iconIndex);

    activeExplosionSprites.add(anim);
    const originalDestroy = anim.destroy.bind(anim);
    anim.destroy = (...args) => {
      activeExplosionSprites.delete(anim);
      return originalDestroy(...args);
    };

    anim.play();
  }

  function lossShakeTile(tile) {
    if (!explosionShakeEnabled || !tile || tile.destroyed || tile._lossShaking)
      return;

    tile._lossShaking = true;

    const duration = explosionShakeDuration;
    const amp = explosionShakeAmplitude;
    const rotAmp = explosionShakerotationAmplitude;
    const f1 = explosionShakeBaseFrequency;
    const f2 = explosionShakeSecondaryFrequency;

    const bx = tile._baseX ?? tile.x;
    const by = tile._baseY ?? tile.y;
    const r0 = tile.rotation;

    const phiX1 = Math.random() * Math.PI * 2;
    const phiX2 = Math.random() * Math.PI * 2;
    const phiY1 = Math.random() * Math.PI * 2;
    const phiY2 = Math.random() * Math.PI * 2;

    tween(app, {
      duration,
      skipUpdate: disableAnimations,
      ease: (t) => t,
      update: (p) => {
        const decay = Math.exp(-5 * p);
        const w1 = p * Math.PI * 2 * f1;
        const w2 = p * Math.PI * 2 * f2;

        const dx =
          (Math.sin(w1 + phiX1) + 0.5 * Math.sin(w2 + phiX2)) * amp * decay;
        const dy =
          (Math.cos(w1 + phiY1) + 0.5 * Math.sin(w2 + phiY2)) * amp * decay;

        if (!tile || tile.destroyed) {
          tile && (tile._lossShaking = false);
          return;
        }

        tile.x = bx + dx;
        tile.y = by + dy;

        tile.rotation = r0 + Math.sin(w2 + phiX1) * rotAmp * decay;
      },
      complete: () => {
        if (!tile || tile.destroyed) {
          tile && (tile._lossShaking = false);
          return;
        }

        tile.x = bx;
        tile.y = by;
        tile.rotation = r0;
        tile._lossShaking = false;
      },
    });
  }

  function getSkew(wrap) {
    return hoverTiltAxis === "y" ? wrap.skew.y : wrap.skew.x;
  }

  function setSkew(wrap, v) {
    if (hoverTiltAxis === "y") wrap.skew.y = v;
    else wrap.skew.x = v;
  }

  function hoverTile(tile, on) {
    if (!hoverEnabled || !tile || tile._animating) return;

    const wrap = tile._wrap;
    if (!wrap) return;

    const startScale = wrap.scale.x;
    const endScale = on ? 1.03 : 1.0;

    const startSkew = getSkew(wrap);
    const endSkew = on ? hoverSkewAmount : 0;

    const startY = tile.y;
    const endY = on ? tile._baseY - 3 : tile._baseY;

    const token = Symbol("hover");
    tile._hoverToken = token;

    // Change color
    const card = tile._card;
    const inset = tile._inset;
    if (card && inset) {
      const size = tile._tileSize;
      const r = tile._tileRadius;
      const pad = tile._tilePad;
      if (on) {
        flipFace(card, size, size, r, PALETTE.hover);
        flipInset(inset, size, size, r, pad, PALETTE.hover);
      } else {
        refreshTileTint(tile);
      }
    }

    if (disableAnimations) {
      tile._wrap.scale.set(endScale);
      setSkew(tile._wrap, endSkew);
      tile.y = endY;
      return;
    }

    tween(app, {
      duration: on ? hoverEnterDuration : hoverExitDuration,
      skipUpdate: disableAnimations,
      ease: (x) => (on ? 1 - Math.pow(1 - x, 3) : x * x * x),
      update: (p) => {
        if (!tile || tile.destroyed) return;
        const wrap = tile._wrap;
        if (!wrap) return;
        if (tile._hoverToken !== token) return;
        const scale = wrap.scale;
        if (!scale) return;
        const s = startScale + (endScale - startScale) * p;
        scale.x = scale.y = s;

        const k = startSkew + (endSkew - startSkew) * p;
        setSkew(wrap, k);

        tile.y = startY + (endY - startY) * p;
      },
      complete: () => {
        if (!tile || tile.destroyed) return;
        const wrap = tile._wrap;
        if (!wrap) return;
        if (tile._hoverToken !== token) return;
        const scale = wrap.scale;
        if (!scale) return;
        if (typeof scale.set === "function") {
          scale.set(endScale);
        } else {
          scale.x = scale.y = endScale;
        }
        setSkew(wrap, endSkew);
        tile.y = endY;
      },
    });
  }

  function wiggleTile(t) {
    if (!wiggleSelectionEnabled || t._animating) return;

    const wrap = t._wrap;
    const baseSkew = getSkew(wrap);
    const baseScale = wrap.scale.x;

    t._animating = true;

    const token = Symbol("wiggle");
    t._wiggleToken = token;

    tween(app, {
      duration: wiggleSelectionDuration,
      skipUpdate: disableAnimations,
      ease: (p) => p,
      update: (p) => {
        if (t._wiggleToken !== token) return;
        const wiggle =
          Math.sin(p * Math.PI * wiggleSelectionTimes) *
          wiggleSelectionIntensity;
        setSkew(wrap, baseSkew + wiggle);

        const scaleWiggle =
          1 +
          Math.sin(p * Math.PI * wiggleSelectionTimes) * wiggleSelectionScale;
        wrap.scale.x = wrap.scale.y = baseScale * scaleWiggle;
      },
      complete: () => {
        if (t._wiggleToken !== token) return;
        setSkew(wrap, baseSkew);
        wrap.scale.x = wrap.scale.y = baseScale;
        t._animating = false;
      },
    });
  }

  function stopHover(t) {
    t._hoverToken = Symbol("hover-cancelled");
  }

  function stopWiggle(t) {
    t._wiggleToken = Symbol("wiggle-cancelled");
    t._animating = false;
  }

  function setAnimationsEnabled(enabled) {
    const nextDisabled = !Boolean(enabled);
    if (disableAnimations === nextDisabled) {
      return;
    }

    disableAnimations = nextDisabled;

    if (disableAnimations) {
      for (const tile of tiles) {
        if (!tile) continue;
        stopHover(tile);
        stopWiggle(tile);
        forceFlatPose(tile);
        refreshTileTint(tile);
      }

      if (winPopup?.container) {
        const { container } = winPopup;
        container.alpha = 1;
        if (container.scale?.set) {
          container.scale.set(1);
        } else if (container.scale != null) {
          container.scale = 1;
        }
      }
    }
  }

  function isAutoModeActive() {
    try {
      return String(getMode?.() ?? "manual").toLowerCase() === "auto";
    } catch (e) {
      return false;
    }
  }

  function paintTileBase(graphic, size, radius, color) {
    if (!graphic || typeof graphic.clear !== "function") {
      return;
    }

    graphic
      .clear()
      .roundRect(0, 0, size, size, radius)
      .fill(color)
      .stroke({ color: PALETTE.tileStroke, width: strokeWidth, alpha: 0.9 });
  }

  function paintTileInset(graphic, size, radius, pad, color) {
    if (!graphic || typeof graphic.clear !== "function") {
      return;
    }

    graphic
      .clear()
      .roundRect(
        pad,
        pad,
        size - pad * 2,
        size - pad * 2,
        Math.max(8, radius - 6)
      )
      .fill(color);
  }

  function applyTileTint(tile, tint) {
    if (!tile) return;
    if (tile._inset) {
      tile._inset.tint = tint;
    }
    if (tile._card) {
      tile._card.tint = tint;
    }
  }

  function refreshTileTint(tile) {
    if (!tile) return;

    const card = tile._card;
    const inset = tile._inset;

    if (!card && !inset) {
      return;
    }

    if (tile.revealed) {
      if (card) {
        card.tint = PALETTE.defaultTint;
      }
      if (inset) {
        inset.tint = PALETTE.defaultTint;
      }
      return;
    }

    const size = tile._tileSize;
    const radius = tile._tileRadius;
    const pad = tile._tilePad;

    const baseColor = tile.isAutoSelected
      ? AUTO_SELECTION_COLOR
      : PALETTE.tileBase;
    const insetColor = tile.isAutoSelected
      ? AUTO_SELECTION_COLOR
      : PALETTE.tileInset;

    paintTileBase(card, size, radius, baseColor);
    paintTileInset(inset, size, radius, pad, insetColor);

    if (card) {
      card.tint = PALETTE.defaultTint;
    }
    if (inset) {
      inset.tint = PALETTE.defaultTint;
    }
  }

  function notifyAutoSelectionChange() {
    onAutoSelectionChange(autoSelectedTiles.size);
  }

  function setAutoTileSelected(
    tile,
    selected,
    { emit = true, refresh = true, releaseHover = true } = {}
  ) {
    if (!tile) return;

    if (selected) {
      if (tile.isAutoSelected) {
        if (emit) notifyAutoSelectionChange();
        return;
      }
      stopHover(tile);
      tile.isAutoSelected = true;
      tile.taped = true;
      autoSelectedTiles.add(tile);
      autoSelectionOrder.push(tile);
    } else {
      if (!tile.isAutoSelected) {
        if (emit) notifyAutoSelectionChange();
        return;
      }
      tile.isAutoSelected = false;
      tile.taped = false;
      autoSelectedTiles.delete(tile);
      const index = autoSelectionOrder.indexOf(tile);
      if (index >= 0) {
        autoSelectionOrder.splice(index, 1);
      }
    }

    tile._pressed = false;
    if (refresh) {
      refreshTileTint(tile);
    }
    if (releaseHover) {
      hoverTile(tile, false);
    }

    if (emit) {
      notifyAutoSelectionChange();
    }
  }

  function toggleAutoTileSelection(tile) {
    if (!tile || tile.revealed) {
      return;
    }

    const willSelect = !tile.isAutoSelected;
    setAutoTileSelected(tile, willSelect);
    waitingForChoice = false;
    selectedTile = null;
    onChange(getState());
  }

  function clearAutoSelections({ emit = true } = {}) {
    if (autoSelectedTiles.size === 0) {
      if (emit) notifyAutoSelectionChange();
      return;
    }

    for (const tile of Array.from(autoSelectedTiles)) {
      tile.isAutoSelected = false;
      tile.taped = false;
      refreshTileTint(tile);
    }

    autoSelectedTiles.clear();
    autoSelectionOrder.length = 0;

    if (emit) {
      notifyAutoSelectionChange();
    }
  }

  function createTile(row, col, size) {
    const raduis = Math.min(18, size * 0.18);
    const pad = Math.max(7, Math.floor(size * 0.08));
    const elevationOffset = Math.max(4, Math.floor(size * 0.07));
    const lipOffset = Math.max(2, Math.floor(size * 0.04));
    const shadowBlur = Math.max(4, Math.floor(size * 0.09));

    const elevationShadow = new Graphics()
      .roundRect(0, 0, size, size, raduis)
      .fill(PALETTE.tileElevationShadow);
    elevationShadow.y = elevationOffset;
    elevationShadow.alpha = 0.32;
    const shadowFilter = new BlurFilter(shadowBlur);
    shadowFilter.quality = 2;
    elevationShadow.filters = [shadowFilter];

    const elevationLip = new Graphics()
      .roundRect(0, 0, size, size, raduis)
      .fill(PALETTE.tileElevationBase);
    elevationLip.y = lipOffset;
    elevationLip.alpha = 0.85;

    const card = new Graphics();
    paintTileBase(card, size, raduis, PALETTE.tileBase);

    const inset = new Graphics();
    paintTileInset(inset, size, raduis, pad, PALETTE.tileInset);

    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.x = size / 2;
    icon.y = size / 2;
    icon.visible = false;

    // Centered wrapper – flip happens here
    const flipWrap = new Container();
    flipWrap.addChild(elevationShadow, elevationLip, card, inset, icon);
    flipWrap.position.set(size / 2, size / 2);
    flipWrap.pivot.set(size / 2, size / 2);

    const t = new Container();
    t.addChild(flipWrap);

    t.eventMode = "static";
    t.cursor = "pointer";
    t.row = row;
    t.col = col;
    t.revealed = false;
    t._animating = false;
    t._layoutScale = 1;

    t._wrap = flipWrap;
    t._card = card;
    t._inset = inset;
    t._icon = icon;
    t._tileSize = size;
    t._tileRadius = raduis;
    t._tilePad = pad;

    // Spwan animation
    const s0 = 0.0001;
    flipWrap.scale?.set?.(s0);
    if (disableAnimations) {
      flipWrap.scale?.set?.(1, 1);
    } else {
      tween(app, {
        duration: cardsSpawnDuration,
        skipUpdate: disableAnimations,
        ease: (x) => Ease.easeOutBack(x),
        update: (p) => {
          const s = s0 + (1 - s0) * p;
          flipWrap.scale?.set?.(s);
        },
        complete: () => {
          flipWrap.scale?.set?.(1, 1);
        },
      });
    }

    t.on("pointerover", () => {
      const autoMode = isAutoModeActive();

      const waitingBlocked = !autoMode && waitingForChoice;

      if (
        !gameOver &&
        !waitingBlocked &&
        !t.revealed &&
        !t._animating &&
        selectedTile !== t
      ) {
        if (hoverEnabled && (!autoMode || !t.isAutoSelected)) {
          playSoundEffect("tileHover");
        }
        if (!autoMode || !t.isAutoSelected) {
          hoverTile(t, true);
        }

        if (t._pressed) {
          applyTileTint(t, PALETTE.pressedTint);
        }
      }
    });
    t.on("pointerdown", () => {
      const autoMode = isAutoModeActive();
      const isSelectingNewAutoTile = autoMode && !t.isAutoSelected;

      if (
        gameOver ||
        t.revealed ||
        t._animating ||
        (!autoMode && waitingForChoice)
      ) {
        return;
      }

      playSoundEffect("tileTapDown");
      applyTileTint(t, PALETTE.pressedTint);
      t._pressed = true;
    });
    t.on("pointerup", () => {
      if (t._pressed) {
        t._pressed = false;
        refreshTileTint(t);
      }
    });
    t.on("pointerout", () => {
      if (!t.revealed && !t._animating && selectedTile !== t) {
        if (!isAutoModeActive() || !t.isAutoSelected) {
          hoverTile(t, false);
        }
        if (t._pressed) {
          t._pressed = false;
          refreshTileTint(t);
        }
      }
    });
    t.on("pointerupoutside", () => {
      if (t._pressed) {
        t._pressed = false;
        refreshTileTint(t);
      }
    });
    t.on("pointertap", () => {
      const autoMode = isAutoModeActive();

      if (autoMode) {
        if (gameOver || t.revealed || t._animating) {
          return;
        }

        toggleAutoTileSelection(t);
        return;
      }

      if (
        gameOver ||
        waitingForChoice ||
        t.revealed ||
        t._animating
      )
        return;

      t.taped = true;
      hoverTile(t, false);
      enterWaitingState(t);
    });

    return t;
  }

  function selectRandomTile() {
    if (gameOver || waitingForChoice) {
      return null;
    }

    const untapedTiles = tiles.filter((t) => !t.taped);
    if (untapedTiles.length === 0) {
      return null;
    }

    const candidates = untapedTiles.filter((t) => !t.revealed && !t._animating);
    if (candidates.length === 0) {
      return null;
    }

    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    tile.taped = true;
    hoverTile(tile, false);
    enterWaitingState(tile);

    return { row: tile.row, col: tile.col };
  }

  function getAutoSelectionCoordinates() {
    return autoSelectionOrder.map((tile) => ({ row: tile.row, col: tile.col }));
  }

  function revealAutoSelections(results = []) {
    if (!Array.isArray(results) || results.length === 0) {
      return;
    }

    const tileMap = new Map(
      tiles.map((tile) => [`${tile.row},${tile.col}`, tile])
    );

    waitingForChoice = false;
    selectedTile = null;

    let pendingReveals = 0;

    const finalizeAutoRound = () => {
      if (pendingReveals > 0) {
        return;
      }
      finalizeRoundIfComplete();
    };

    for (const entry of results) {
      const key = `${entry.row},${entry.col}`;
      const tile = tileMap.get(key);
      if (!tile || tile.revealed) {
        continue;
      }

      const useSelectionBase = Boolean(tile.isAutoSelected);
      if (tile.isAutoSelected) {
        setAutoTileSelected(tile, false, {
          emit: false,
          refresh: false,
          releaseHover: false,
        });
      }

      const normalizedResult = String(entry?.result ?? "").toLowerCase();
      if (!roundLayoutPrepared) {
        const fallbackOutcome = normalizedResult === "lost" ? "loss" : "win";
        if (!ensureRoundLayout(fallbackOutcome, tile)) {
          continue;
        }
      }

      const started = revealTileWithFlip(
        tile,
        { isWinning: tile.isWinningCard },
        true,
        {
          useSelectionBase,
          staggerRevealAll: false,
          onComplete: () => {
            pendingReveals = Math.max(0, pendingReveals - 1);
            finalizeAutoRound();
          },
        }
      );

      if (started) {
        pendingReveals += 1;
      }
    }

    clearAutoSelections({ emit: false });
    notifyAutoSelectionChange();

    waitingForChoice = false;
    onChange(getState());

    finalizeAutoRound();
  }

  function flipFace(graphic, w, h, r, color, stroke = true) {
    graphic.clear().roundRect(0, 0, w, h, r).fill(color);
    if (stroke) {
      graphic.stroke({
        color: PALETTE.tileStrokeFlipped,
        width: strokeWidth,
        alpha: 0.5,
      });
    }
  }

  function flipInset(graphic, w, h, r, pad, color) {
    graphic
      .clear()
      .roundRect(pad, pad, w - pad * 2, h - pad * 2, Math.max(8, r - 6))
      .fill(color);
  }

  function highlightWinningTiles(color = AUTO_SELECTION_COLOR) {
    for (const tile of tiles) {
      if (!tile?.isWinningCard || !tile.revealed) {
        continue;
      }

      const card = tile._card;
      if (!card || card.destroyed) {
        continue;
      }

      const radius = tile._tileRadius;
      const tileSize = tile._tileSize;
      flipFace(card, tileSize, tileSize, radius, color);
    }
  }

  function isRoundFullyRevealed() {
    return tiles.every((tile) => tile?.revealed);
  }

  function finalizeRoundIfComplete() {
    if (gameOver || !isRoundFullyRevealed()) {
      return;
    }

    if (roundOutcome === "win") {
      completeWin();
    } else {
      gameOver = true;
      onGameOver();
      onChange(getState());
      return;
    }
    onChange(getState());
  }

  function completeWin() {
    highlightWinningTiles();
    if (gameOver) {
      return;
    }

    gameOver = true;
    playSoundEffect("win");
    onWin();
  }

  function easeFlip(t) {
    switch (flipEaseFunction) {
      case "easeInOutBack":
        return Ease.easeInOutBack(t);

      case "easeInOutSine":
        return Ease.easeInOutSine(t);
    }
  }

  function forceFlatPose(t) {
    t._hoverToken = Symbol("hover-kill");
    t._wiggleToken = Symbol("wiggle-kill");

    const w = t._wrap;
    if (!w || !w.scale) {
      return;
    }

    const clampOnce = () => {
      if (!w.scale) return;

      w.scale.set(1, 1);
      w.skew.set(0, 0);
      w.rotation = 0;

      const layoutScale = t._layoutScale ?? 1;
      t.scale?.set(layoutScale, layoutScale);
      t.skew?.set(0, 0);
      t.rotation = 0;

      t.y = t._baseY ?? t.y;
    };

    clampOnce();

    app.ticker.addOnce(clampOnce);
    app.ticker.addOnce(clampOnce);
  }

  function revealTileWithFlip(
    tile,
    revealContext = {},
    revealedByPlayer = true,
    options = {}
  ) {
    const {
      useSelectionBase = false,
      staggerRevealAll = true,
      onComplete = null,
    } = options;
    if (tile._animating || tile.revealed) return false;

    const unrevealed = tiles.filter((t) => !t.revealed).length;
    const revealedCount = tiles.length - unrevealed;
    const progress = Math.min(1, revealedCount / tiles.length);
    const flipDelay = revealedByPlayer
      ? flipDelayMin + (flipDelayMax - flipDelayMin) * progress
      : flipDelayMin;
    setTimeout(() => {
      stopHover(tile);
      stopWiggle(tile);
      const wrap = tile._wrap;
      const card = tile._card;
      const inset = tile._inset;
      const icon = tile._icon;
      const radius = tile._tileRadius;
      const pad = tile._tilePad;
      const tileSize = tile._tileSize;

      if (
        tile.destroyed ||
        !wrap ||
        !wrap.scale ||
        !wrap.skew ||
        wrap.destroyed ||
        !card ||
        card.destroyed ||
        !inset ||
        inset.destroyed ||
        !icon ||
        icon.destroyed
      ) {
        tile._animating = false;
        onComplete?.(tile, { revealedByPlayer, cancelled: true });
        return;
      }

      tile._animating = true;

      if (revealedByPlayer) {
        playSoundEffect("tileFlip");
      }

      const startScaleY = wrap.scale.y;
      const startSkew = getSkew(wrap);

      let swapped = false;

      if (!revealedByPlayer) {
        icon.alpha = iconRevealedSizeOpacity;
      }

      tween(app, {
        duration: flipDuration,
        skipUpdate: disableAnimations,
        ease: (t) => easeFlip(t),
        update: (t) => {
          if (
            tile.destroyed ||
            !wrap.scale ||
            !wrap.skew ||
            wrap.destroyed ||
            card.destroyed ||
            inset.destroyed ||
            icon.destroyed
          ) {
            tile._animating = false;
            onComplete?.(tile, { revealedByPlayer, cancelled: true });
            return;
          }

          const widthFactor = Math.max(0.0001, Math.abs(Math.cos(Math.PI * t)));

          const elev = Math.sin(Math.PI * t);
          const popS = 1 + 0.06 * elev;

          const biasSkew =
            (tile._tiltDir ?? (startSkew >= 0 ? +1 : -1)) *
            0.22 *
            Math.sin(Math.PI * t);
          const skewOut = startSkew * (1 - t) + biasSkew;

          wrap.scale.x = widthFactor * popS;
          wrap.scale.y = startScaleY * popS;
          setSkew(wrap, skewOut);

          if (!swapped && t >= 0.5) {
            swapped = true;
            icon.visible = true;
            const iconSizeFactor = revealedByPlayer
              ? 1.0
              : iconRevealedSizeFactor;
            const maxW = tile._tileSize * iconSizePercentage * iconSizeFactor;
            const maxH = tile._tileSize * iconSizePercentage * iconSizeFactor;
            icon.width = maxW;
            icon.height = maxH;

            const isWinning =
              revealContext?.isWinning ?? tile.isWinningCard ?? false;
            let texture = tile.cardTexture ?? null;
            if (!texture) {
              if (isWinning && roundWinningTexture?.texture) {
                texture = roundWinningTexture.texture;
              } else if (activeCardPool.length) {
                const fallbackEntry = pickRandomTexture(activeCardPool);
                texture = fallbackEntry?.texture ?? null;
                if (texture) {
                  tile.cardTexture = texture;
                  tile.cardTextureId = fallbackEntry?.id ?? tile.cardTextureId;
                }
              }
            }
            if (texture) {
              icon.texture = texture;
            }

            const facePalette = revealedByPlayer
              ? useSelectionBase
                ? AUTO_SELECTION_COLOR
                : isWinning
                ? PALETTE.safeA
                : PALETTE.lossA
              : isWinning
              ? PALETTE.safeAUnrevealed
              : PALETTE.lossAUnrevealed;
            const insetPalette = revealedByPlayer
              ? isWinning
                ? PALETTE.safeB
                : PALETTE.lossB
              : isWinning
              ? PALETTE.safeBUnrevealed
              : PALETTE.lossBUnrevealed;
            flipFace(card, tileSize, tileSize, radius, facePalette);
            flipInset(inset, tileSize, tileSize, radius, pad, insetPalette);

            if (revealedByPlayer) {
              if (isWinning) {
                const minPitch = Math.max(0.01, Number(winningCardRevealPitchMin));
                const maxPitch = Math.max(0.01, Number(winningCardRevealPitchMax));
                const safeProgress =
                  totalSafe <= 1
                    ? 1
                    : Math.min(
                        1,
                        Math.max(0, revealedSafe / Math.max(totalSafe - 1, 1))
                      );
                const pitch =
                  minPitch +
                  (maxPitch - minPitch) * Ease.easeInQuad(safeProgress);
                playSoundEffect("winningCardRevealed", { speed: pitch });
              } else {
                playSoundEffect("loss");
              }
            }
          }
        },
        complete: () => {
          if (tile.destroyed || !wrap.scale || wrap.destroyed) {
            tile._animating = false;
            onComplete?.(tile, { revealedByPlayer, cancelled: true });
            return;
          }

          if (!revealedByPlayer && icon && !icon.destroyed) {
            icon.alpha = 1;
          }

          forceFlatPose(tile);
          tile._animating = false;
          tile.revealed = true;

          const isWinning = revealContext?.isWinning ?? tile.isWinningCard;
          if (isWinning) {
            revealedSafe = Math.min(
              Math.max(totalSafe, MATCHING_CARDS_REQUIRED),
              revealedSafe + 1
            );
          }

          if (revealedByPlayer) {
            onChange(getState());
          }

          onComplete?.(tile, { revealedByPlayer });

          finalizeRoundIfComplete();
        },
      });
      try {
        window.__card_tiles = tiles.length;
      } catch {}
    }, flipDelay);

    return true;
  }

  function revealAllTiles(triggeredTile, { stagger = true } = {}) {
    const unrevealed = tiles.filter((t) => !t.revealed && !t._animating);
    if (!unrevealed.length) {
      return;
    }

    const revealTile = (tile, idx) => {
      const delay = stagger ? revealAllIntervalDelay * idx : 0;
      const execute = () => {
        if (!tile.revealed) {
          revealTileWithFlip(
            tile,
            { isWinning: tile.isWinningCard },
            false,
            { staggerRevealAll: false }
          );
        }
      };
      if (delay > 0 && !disableAnimations) {
        setTimeout(execute, delay);
      } else {
        execute();
      }
    };

    const orderedTiles = unrevealed.slice();
    if (triggeredTile) {
      const index = orderedTiles.indexOf(triggeredTile);
      if (index >= 0) {
        orderedTiles.splice(index, 1);
        orderedTiles.unshift(triggeredTile);
      }
    }

    orderedTiles.forEach((tile, idx) => revealTile(tile, idx));
  }

  function buildBoard({ emitAutoSelectionChange = true } = {}) {
    clearSelection({ emitAutoSelectionChange });
    cleanupExplosionSprites();
    const removed = board.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true });
    }
    tiles = [];
    revealedSafe = 0;
    totalSafe = 0;
    roundOutcome = "pending";
    roundWinningTexture = null;
    roundLayoutPrepared = false;
    activeCardPool = [];

    const layout = layoutSizes();

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const tile = createTile(r, c, layout.tileSize);
        board.addChild(tile);
        tiles.push(tile);
      }
    }

    layoutBoard(layout);

    if (shouldPlayStartSound) {
      playSoundEffect("gameStart");
      shouldPlayStartSound = false;
    }
  }

  function layoutSizes() {
    const canvasSize = Math.min(app.renderer.width, app.renderer.height);
    const topSpace = 16;
    const boardSpace = Math.max(40, canvasSize - topSpace - 5);
    const gap = Math.max(1, Math.floor(boardSpace * gapBetweenTiles));
    const totalGaps = gap * (GRID - 1);
    const tileSize = Math.floor((boardSpace - totalGaps) / GRID);
    const contentSize = tileSize * GRID + totalGaps;
    return { tileSize, gap, contentSize };
  }

  function layoutBoard(layout = layoutSizes()) {
    if (!tiles.length) return;

    const { tileSize, gap, contentSize } = layout;
    const startX = -contentSize / 2;
    const startY = -contentSize / 2;

    for (const tile of tiles) {
      const targetSize = tileSize;
      const baseSize = tile._tileSize || targetSize || 1;
      const scale = baseSize === 0 ? 1 : targetSize / baseSize;

      tile.scale?.set?.(scale, scale);
      tile._layoutScale = scale;

      const x = startX + tile.col * (targetSize + gap);
      const y = startY + tile.row * (targetSize + gap);

      tile.position.set(x, y);
      tile._baseX = x;
      tile._baseY = y;
    }
  }

  function centerBoard() {
    board.position.set(app.renderer.width / 2, app.renderer.height / 2);
    board.scale.set(1);
    positionWinPopup();
  }

  function resizeSquare() {
    const cw = Math.max(1, root.clientWidth || initialSize);
    const ch = Math.max(1, root.clientHeight || cw);

    const size = Math.floor(Math.min(cw, ch));
    app.renderer.resize(size, size);
    if (!tiles.length) {
      buildBoard();
    } else {
      layoutBoard();
    }
    centerBoard();
    positionWinPopup();
  }

  function enterWaitingState(tile) {
    waitingForChoice = true;
    selectedTile = tile;

    if (onCardSelected) {
      onCardSelected({
        row: tile.row,
        col: tile.col,
        tile: tile,
      });
    }

    const sy = getSkew(tile._wrap) || 0;
    tile._tiltDir = sy >= 0 ? +1 : -1;

    wiggleTile(tile);
    onChange(getState());
  }

  function clearSelection({ emitAutoSelectionChange = true } = {}) {
    if (selectedTile && !selectedTile.revealed) {
      hoverTile(selectedTile, false);
      refreshTileTint(selectedTile);
    }
    waitingForChoice = false;
    selectedTile = null;
    clearAutoSelections({ emit: emitAutoSelectionChange });
  }

  function applyAutoSelectionsFromCoordinates(
    coordinates = [],
    { emit = true } = {}
  ) {
    const list = Array.isArray(coordinates) ? coordinates : [];
    if (list.length === 0) {
      clearAutoSelections({ emit });
      return 0;
    }

    const tileMap = new Map(
      tiles.map((tile) => [`${tile.row},${tile.col}`, tile])
    );

    clearAutoSelections({ emit: false });

    let applied = 0;
    for (const entry of list) {
      const key = `${entry.row},${entry.col}`;
      const tile = tileMap.get(key);
      if (!tile || tile.revealed || tile._animating) {
        continue;
      }
      setAutoTileSelected(tile, true, { emit: false });
      applied += 1;
    }

    if (emit) {
      notifyAutoSelectionChange();
    }

    return applied;
  }

  function revealRemainingTiles() {
    revealAllTiles();
  }

  function getAutoResetDelay() {
    return autoResetDelayMs;
  }

  resizeSquare();
  // Kick one extra layout tick after mount to cover late size changes
  setTimeout(resizeSquare, 0);

  const ro = new ResizeObserver(() => resizeSquare());
  ro.observe(root);

  return {
    app,
    reset,
    setCardTypeCount,
    getState,
    destroy,
    setSelectedCardIsWin,
    setSelectedCardIsLoss,
    revealSelectedTile,
    selectRandomTile,
    getAutoSelections: getAutoSelectionCoordinates,
    revealAutoSelections,
    clearAutoSelections,
    applyAutoSelections: applyAutoSelectionsFromCoordinates,
    revealRemainingTiles,
    getAutoResetDelay,
    showWinPopup: spawnWinPopup,
    setAnimationsEnabled,
    determineBetResult,
  };
}
