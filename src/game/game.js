import { Assets } from "pixi.js";
import { GameScene } from "./gameScene.js";
import { GameRules } from "./gameRules.js";
import diamondTextureUrl from "../../assets/sprites/Diamond.png";
import bombTextureUrl from "../../assets/sprites/Bomb.png";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import diamondRevealedSoundUrl from "../../assets/sounds/DiamondRevealed.wav";
import bombRevealedSoundUrl from "../../assets/sounds/BombRevealed.wav";
import winSoundUrl from "../../assets/sounds/Win.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";

const PALETTE = {
  appBg: 0x091b26,
  tileBase: 0x2b4756,
  tileInset: 0x2b4756,
  tileStroke: 0x080e11,
  tileStrokeFlipped: 0x0f0f0f,
  tileElevationBase: 0x1b2931,
  tileElevationShadow: 0x091b26,
  hover: 0x528aa5,
  pressedTint: 0x7a7a7a,
  defaultTint: 0xffffff,
  safeA: 0x0f181e,
  safeAUnrevealed: 0x0f181e,
  safeB: 0x0f181e,
  safeBUnrevealed: 0x0f181e,
  bombA: 0x0f181e,
  bombAUnrevealed: 0x0f181e,
  bombB: 0x0f181e,
  bombBUnrevealed: 0x0f181e,
  winPopupBorder: 0xeaff00,
  winPopupBackground: 0x091b26,
  winPopupMultiplierText: 0xeaff00,
  winPopupSeparationLine: 0x1b2931,
};

const SOUND_ALIASES = {
  tileHover: "mines.tileHover",
  tileTapDown: "mines.tileTapDown",
  tileFlip: "mines.tileFlip",
  diamondRevealed: "mines.diamondRevealed",
  bombRevealed: "mines.bombRevealed",
  win: "mines.win",
  gameStart: "mines.gameStart",
};

function createDummySound() {
  return {
    add: (_, options) => {
      if (options?.loaded) {
        setTimeout(() => options.loaded(), 0);
      }
    },
    play: () => {},
    stop: () => {},
    exists: () => false,
  };
}

async function loadSoundLibrary() {
  try {
    const soundModule = await import("@pixi/sound");
    return soundModule.sound;
  } catch (error) {
    console.warn("Sounds disabled:", error.message);
    return createDummySound();
  }
}

async function loadTexture(path) {
  if (!path) return null;
  try {
    return await Assets.load(path);
  } catch (error) {
    console.error("Texture load failed", path, error);
    return null;
  }
}

function createSoundManager(sound, soundEffectPaths) {
  const enabledSoundKeys = Object.entries(soundEffectPaths)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  for (const key of enabledSoundKeys) {
    const alias = SOUND_ALIASES[key];
    if (!alias || sound.exists(alias)) continue;
    sound.add(alias, {
      url: soundEffectPaths[key],
      preload: true,
      loaded: () => {},
    });
  }

  return {
    play(name, options) {
      const alias = SOUND_ALIASES[name];
      if (!alias || !sound.exists(alias)) return;
      sound.play(alias, options);
    },
  };
}

function isAutoModeActive(getMode) {
  try {
    return String(getMode?.() ?? "manual").toLowerCase() === "auto";
  } catch (error) {
    console.warn("getMode failed", error);
    return false;
  }
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
  return `${amountValue ?? "0.00"}`;
}

export async function createGame(mount, opts = {}) {
  const GRID = Math.max(2, opts.grid ?? 5);
  let mines = Math.max(1, Math.min(opts.mines ?? 5, GRID * GRID - 1));
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const initialSize = Math.max(1, opts.size ?? 400);
  const onCardSelected = opts.onCardSelected ?? (() => {});
  const onWin = opts.onWin ?? (() => {});
  const onGameOver = opts.onGameOver ?? (() => {});
  const onChange = opts.onChange ?? (() => {});
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const onAutoSelectionChange =
    typeof opts.onAutoSelectionChange === "function"
      ? (count) => opts.onAutoSelectionChange(count)
      : () => {};
  const backgroundColor = opts.backgroundColor ?? PALETTE.appBg;

  let disableAnimations = Boolean(opts.disableAnimations ?? false);

  const iconSizePercentage = opts.iconSizePercentage ?? 0.7;
  const iconRevealedSizeFactor = opts.iconRevealedSizeFactor ?? 0.85;
  const cardsSpawnDuration = opts.cardsSpawnDuration ?? 350;
  const revealAllIntervalDelay = opts.revealAllIntervalDelay ?? 40;
  const autoResetDelayMs = Number(opts.autoResetDelayMs ?? 1500);
  const strokeWidth = opts.strokeWidth ?? 1;
  const gapBetweenTiles = opts.gapBetweenTiles ?? 0.012;
  const flipDuration = opts.flipDuration ?? 300;
  const flipEaseFunction = opts.flipEaseFunction ?? "easeInOutSine";

  const hoverOptions = {
    hoverEnabled: opts.hoverEnabled ?? true,
    hoverEnterDuration: opts.hoverEnterDuration ?? 120,
    hoverExitDuration: opts.hoverExitDuration ?? 200,
    hoverSkewAmount: opts.hoverSkewAmount ?? 0.02,
    hoverTiltAxis: opts.hoverTiltAxis ?? "x",
  };

  const wiggleOptions = {
    wiggleSelectionEnabled: opts.wiggleSelectionEnabled ?? true,
    wiggleSelectionDuration: opts.wiggleSelectionDuration ?? 900,
    wiggleSelectionTimes: opts.wiggleSelectionTimes ?? 15,
    wiggleSelectionIntensity: opts.wiggleSelectionIntensity ?? 0.03,
    wiggleSelectionScale: opts.wiggleSelectionScale ?? 0.005,
  };

  const winPopupOptions = {
    winPopupWidth: opts.winPopupWidth ?? 240,
    winPopupHeight: opts.winPopupHeight ?? 170,
  };

  const root =
    typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) {
    throw new Error("createGame: mount element not found");
  }

  const soundEffectPaths = {
    tileTapDown: opts.tileTapDownSoundPath ?? tileTapDownSoundUrl,
    tileFlip: opts.tileFlipSoundPath ?? tileFlipSoundUrl,
    tileHover: opts.tileHoverSoundPath ?? tileHoverSoundUrl,
    diamondRevealed: opts.diamondRevealedSoundPath ?? diamondRevealedSoundUrl,
    bombRevealed: opts.bombRevealedSoundPath ?? bombRevealedSoundUrl,
    win: opts.winSoundPath ?? winSoundUrl,
    gameStart: opts.gameStartSoundPath ?? gameStartSoundUrl,
  };

  const sound = await loadSoundLibrary();
  const soundManager = createSoundManager(sound, soundEffectPaths);

  const [diamondTexture, bombTexture] = await Promise.all([
    loadTexture(opts.diamondTexturePath ?? diamondTextureUrl),
    loadTexture(opts.bombTexturePath ?? bombTextureUrl),
  ]);

  const textures = {
    diamond: diamondTexture,
    bomb: bombTexture,
  };

  const scene = new GameScene({
    root,
    backgroundColor,
    initialSize,
    palette: PALETTE,
    fontFamily,
    gridSize: GRID,
    strokeWidth,
    cardOptions: {
      icon: {
        sizePercentage: iconSizePercentage,
        revealedSizeFactor: iconRevealedSizeFactor,
      },
      winPopupWidth: winPopupOptions.winPopupWidth,
      winPopupHeight: winPopupOptions.winPopupHeight,
    },
    layoutOptions: { gapBetweenTiles },
    textures,
    animationOptions: {
      ...hoverOptions,
      ...wiggleOptions,
      cardsSpawnDuration,
      disableAnimations,
    },
  });

  await scene.init();

  const rules = new GameRules({ gridSize: GRID, mines });

  const cardsByKey = new Map();
  const autoSelectedTiles = new Set();
  const autoSelectionOrder = [];

  function registerCards() {
    cardsByKey.clear();
    for (const card of scene.cards) {
      cardsByKey.set(`${card.row},${card.col}`, card);
      card.setDisableAnimations(disableAnimations);
    }
  }

  function emitAutoSelectionChange() {
    onAutoSelectionChange(autoSelectionOrder.length);
  }

  function notifyStateChange() {
    onChange(rules.getState());
  }

  function setAutoTileSelected(card, selected, { emit = true } = {}) {
    if (!card || card.revealed || card._animating) return;
    const key = `${card.row},${card.col}`;
    if (selected) {
      if (autoSelectedTiles.has(key)) return;
      autoSelectedTiles.add(key);
      autoSelectionOrder.push(card);
      card.setAutoSelected(true);
    } else {
      if (!autoSelectedTiles.has(key)) return;
      autoSelectedTiles.delete(key);
      card.setAutoSelected(false);
      const idx = autoSelectionOrder.indexOf(card);
      if (idx >= 0) autoSelectionOrder.splice(idx, 1);
    }
    if (emit) emitAutoSelectionChange();
  }

  function clearAutoSelections({ emit = true } = {}) {
    for (const card of autoSelectionOrder) {
      card.setAutoSelected(false);
    }
    autoSelectedTiles.clear();
    autoSelectionOrder.length = 0;
    if (emit) emitAutoSelectionChange();
  }

  function applyAutoSelectionsFromCoordinates(list = []) {
    clearAutoSelections({ emit: false });
    let applied = 0;
    for (const entry of list) {
      const key = `${entry.row},${entry.col}`;
      const card = cardsByKey.get(key);
      if (!card || card.revealed || card._animating) continue;
      setAutoTileSelected(card, true, { emit: false });
      applied += 1;
    }
    emitAutoSelectionChange();
    return applied;
  }

  function getAutoSelectionCoordinates() {
    return autoSelectionOrder.map((card) => ({ row: card.row, col: card.col }));
  }

  function enterWaitingState(card) {
    rules.selectTile(card.row, card.col);
    const skew = typeof card.getSkew === "function" ? card.getSkew() : 0;
    card._tiltDir = skew >= 0 ? +1 : -1;
    card.wiggle();
    onCardSelected({ row: card.row, col: card.col, tile: card });
    notifyStateChange();
  }

  function revealCard(card, face, { revealedByPlayer = true } = {}) {
    if (!card) return;
    const useSelectionTint = card.isAutoSelected;
    if (card.isAutoSelected) {
      setAutoTileSelected(card, false);
    }
    const playDiamondSound = () => soundManager.play("diamondRevealed");
    const playBombSound = () => soundManager.play("bombRevealed");

    soundManager.play("tileFlip");
    card._revealedFace = face;
    card.reveal({
      face,
      useSelectionTint,
      revealedByPlayer,
      iconSizePercentage,
      iconRevealedSizeFactor,
      textures,
      palette: PALETTE,
      flipDuration,
      flipEaseFunction,
      playDiamondSound: face === "diamond" ? playDiamondSound : null,
      playBombSound: face === "bomb" ? playBombSound : null,
    });
  }

  function revealRemainingTiles() {
    const unrevealed = scene.cards.filter((card) => !card.revealed);
    if (!unrevealed.length) return;

    const bombsRevealed = scene.cards.filter(
      (c) => c._revealedFace === "bomb"
    ).length;
    const bombsNeeded = Math.max(0, mines - bombsRevealed);
    const shuffled = [...unrevealed];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const bombTiles = new Set(shuffled.slice(0, bombsNeeded));
    shuffled.forEach((card, index) => {
      const face = bombTiles.has(card) ? "bomb" : "diamond";
      const delay = disableAnimations
        ? 0
        : revealAllIntervalDelay * index;
      setTimeout(
        () => revealCard(card, face, { revealedByPlayer: false }),
        delay
      );
    });
  }

  function handleCardTap(card) {
    const autoMode = isAutoModeActive(getMode);
    if (card.revealed || card._animating || rules.gameOver) return;

    if (autoMode) {
      const isSelected = autoSelectedTiles.has(`${card.row},${card.col}`);
      setAutoTileSelected(card, !isSelected);
      return;
    }

    if (rules.waitingForChoice) return;

    card.taped = true;
    card.hover(false);
    enterWaitingState(card);
  }

  function handlePointerOver(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    if (isAutoModeActive(getMode) && card.isAutoSelected) return;
    soundManager.play("tileHover");
    card.hover(true);
  }

  function handlePointerOut(card) {
    if (card.revealed || card._animating) return;
    card.hover(false);
    if (card._pressed) {
      card._pressed = false;
      card.refreshTint();
    }
  }

  function handlePointerDown(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    soundManager.play("tileTapDown");
    card.setPressed(true);
  }

  function handlePointerUp(card) {
    if (card._pressed) {
      card.setPressed(false);
    }
  }

  scene.buildGrid({
    interactionFactory: () => ({
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerUpOutside: handlePointerUp,
      onPointerTap: handleCardTap,
    }),
  });

  registerCards();
  soundManager.play("gameStart");

  function reset({ preserveAutoSelections = false } = {}) {
    rules.reset();
    clearAutoSelections({ emit: !preserveAutoSelections });
    scene.hideWinPopup();
    scene.clearGrid();
    scene.buildGrid({
      interactionFactory: () => ({
        onPointerOver: handlePointerOver,
        onPointerOut: handlePointerOut,
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerUpOutside: handlePointerUp,
        onPointerTap: handleCardTap,
      }),
    });
    registerCards();
    if (preserveAutoSelections) {
      applyAutoSelectionsFromCoordinates(getAutoSelectionCoordinates());
    }
    notifyStateChange();
  }

  function setMines(count) {
    mines = Math.max(1, Math.min(count | 0, GRID * GRID - 1));
    rules.setMines(mines);
    reset();
  }

  function setSelectedCardIsDiamond() {
    const selection = rules.selectedTile;
    if (!selection) return;
    const card = cardsByKey.get(`${selection.row},${selection.col}`);
    if (!card || card.revealed) return;
    const outcome = rules.revealResult({ ...selection, result: "diamond" });
    revealCard(card, outcome.face);
    if (outcome.win) {
      revealRemainingTiles();
      onWin();
      scene.showWinPopup({
        multiplier: formatMultiplier(opts.winMultiplier ?? 1),
        amount: formatAmount(opts.winAmount ?? 0),
      });
      soundManager.play("win");
    }
    if (outcome.gameOver && !outcome.win) {
      onGameOver();
    }
    rules.clearSelection();
    notifyStateChange();
  }

  function SetSelectedCardIsBomb() {
    const selection = rules.selectedTile;
    if (!selection) return;
    const card = cardsByKey.get(`${selection.row},${selection.col}`);
    if (!card || card.revealed) return;
    const outcome = rules.revealResult({ ...selection, result: "bomb" });
    revealCard(card, outcome.face);
    if (outcome.gameOver) {
      revealRemainingTiles();
      onGameOver();
    }
    rules.clearSelection();
    notifyStateChange();
  }

  function selectRandomTile() {
    const candidates = scene.cards.filter(
      (card) => !card.revealed && !card._animating
    );
    if (!candidates.length) return null;
    const card =
      candidates[Math.floor(Math.random() * candidates.length)];
    handleCardTap(card);
    return { row: card.row, col: card.col };
  }

  function revealAutoSelections(results = []) {
    if (!Array.isArray(results)) return;
    for (const entry of results) {
      const card = cardsByKey.get(`${entry.row},${entry.col}`);
      if (!card || card.revealed) continue;
      const outcome = rules.revealResult({
        row: entry.row,
        col: entry.col,
        result: entry.result,
      });
      revealCard(card, outcome.face, { revealedByPlayer: true });
    }
    notifyStateChange();
  }

  function getState() {
    return rules.getState();
  }

  function destroy() {
    scene.destroy();
    clearAutoSelections({ emit: false });
    cardsByKey.clear();
    autoSelectionOrder.length = 0;
    autoSelectedTiles.clear();
  }

  function setAnimationsEnabled(enabled) {
    disableAnimations = !enabled;
    scene.setAnimationsEnabled(enabled);
  }

  function showWinPopup({ multiplier, amount }) {
    scene.showWinPopup({ multiplier: formatMultiplier(multiplier), amount });
    soundManager.play("win");
  }

  return {
    app: scene.app,
    reset,
    setMines,
    getState,
    destroy,
    setSelectedCardIsDiamond,
    SetSelectedCardIsBomb,
    selectRandomTile,
    getAutoSelections: getAutoSelectionCoordinates,
    revealAutoSelections,
    clearAutoSelections,
    applyAutoSelections: applyAutoSelectionsFromCoordinates,
    revealRemainingTiles,
    getAutoResetDelay: () => autoResetDelayMs,
    showWinPopup,
    setAnimationsEnabled,
  };
}
