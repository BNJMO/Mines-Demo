import { Application, Assets, Container, Rectangle, Texture } from "pixi.js";
import diamondTextureUrl from "../../assets/sprites/Diamond.png";
import bombTextureUrl from "../../assets/sprites/Bomb.png";
import explosionSheetUrl from "../../assets/sprites/Explosion_Spritesheet.png";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import diamondRevealedSoundUrl from "../../assets/sounds/DiamondRevealed.wav";
import bombRevealedSoundUrl from "../../assets/sounds/BombRevealed.wav";
import winSoundUrl from "../../assets/sounds/Win.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";
import {
  PALETTE,
  SOUND_ALIASES,
  DEFAULT_FONT_FAMILY,
} from "./constants.js";
import { tween } from "./utils/tween.js";
import { createSoundManager } from "./sound.js";
import { createWinPopup } from "./components/winPopup.js";
import { CardGrid } from "./cardGrid.js";

export async function createGame(mount, opts = {}) {
  // Load sound library
  let sound;
  try {
    const soundModule = await import("@pixi/sound");
    sound = soundModule.sound;
  } catch (e) {
    console.warn("Sounds disabled:", e.message);
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

  const gridSize = opts.grid ?? 5;
  const initialMines = Math.max(1, Math.min(opts.mines ?? 5, gridSize * gridSize - 1));
  const fontFamily = opts.fontFamily ?? DEFAULT_FONT_FAMILY;
  const initialSize = Math.max(1, opts.size ?? 400);
  const backgroundColor = opts.backgroundColor ?? PALETTE.appBg;
  const onCardSelected = opts.onCardSelected ?? null;
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const onAutoSelectionChange =
    typeof opts.onAutoSelectionChange === "function"
      ? (count) => opts.onAutoSelectionChange(count)
      : () => {};
  const onWin = opts.onWin ?? (() => {});
  const onGameOver = opts.onGameOver ?? (() => {});
  const onChange = opts.onChange ?? (() => {});

  let animationsEnabled = !(opts.disableAnimations ?? false);

  const gridOptions = {
    disableAnimations: !animationsEnabled,
    gridSize,
    mines: initialMines,
    strokeWidth: opts.strokeWidth ?? 1,
    gapBetweenTiles: opts.gapBetweenTiles ?? 0.012,
    cardsSpawnDuration: opts.cardsSpawnDuration ?? 350,
    hoverEnabled: opts.hoverEnabled ?? true,
    hoverEnterDuration: opts.hoverEnterDuration ?? 120,
    hoverExitDuration: opts.hoverExitDuration ?? 200,
    hoverTiltAxis: opts.hoverTiltAxis ?? "x",
    hoverSkewAmount: opts.hoverSkewAmount ?? 0.02,
    wiggleSelectionEnabled: opts.wiggleSelectionEnabled ?? true,
    wiggleSelectionDuration: opts.wiggleSelectionDuration ?? 900,
    wiggleSelectionTimes: opts.wiggleSelectionTimes ?? 15,
    wiggleSelectionIntensity: opts.wiggleSelectionIntensity ?? 0.03,
    wiggleSelectionScale: opts.wiggleSelectionScale ?? 0.005,
    flipDelayMin: opts.flipDelayMin ?? 150,
    flipDelayMax: opts.flipDelayMax ?? 500,
    flipDuration: opts.flipDuration ?? 300,
    flipEaseFunction: opts.flipEaseFunction ?? "easeInOutSine",
    iconSizePercentage: opts.iconSizePercentage ?? 0.7,
    iconRevealedSizeOpacity: opts.iconRevealedSizeOpacity ?? 0.4,
    iconRevealedSizeFactor: opts.iconRevealedSizeFactor ?? 0.85,
    revealAllIntervalDelay: opts.revealAllIntervalDelay ?? 40,
    autoResetDelayMs: Number(opts.autoResetDelayMs ?? 1500),
    diamondRevealPitchMin: Number(opts.diamondRevealPitchMin ?? 1.0),
    diamondRevealPitchMax: Number(opts.diamondRevealPitchMax ?? 1.5),
    explosionShakeEnabled: opts.explosionShakeEnabled ?? true,
    explosionShakeDuration: opts.explosionShakeDuration ?? 1000,
    explosionShakeAmplitude: opts.explosionShakeAmplitude ?? 6,
    explosionShakerotationAmplitude:
      opts.explosionShakerotationAmplitude ?? 0.012,
    explosionShakeBaseFrequency: opts.explosionShakeBaseFrequency ?? 8,
    explosionShakeSecondaryFrequency: opts.explosionShakeSecondaryFrequency ?? 13,
    explosionSheetEnabled: opts.explosionSheetEnabled ?? true,
    explosionSheetFps: opts.explosionSheetFps ?? 24,
    explosionSheetScaleFit: opts.explosionSheetScaleFit ?? 0.8,
    explosionSheetOpacity: opts.explosionSheetOpacity ?? 0.75,
  };

  const diamondTexturePath = opts.dimaondTexturePath ?? diamondTextureUrl;
  const bombTexturePath = opts.bombTexturePath ?? bombTextureUrl;
  const explosionSheetPath = opts.explosionSheetPath ?? explosionSheetUrl;

  const soundEffectPaths = {
    tileTapDown: opts.tileTapDownSoundPath ?? tileTapDownSoundUrl,
    tileFlip: opts.tileFlipSoundPath ?? tileFlipSoundUrl,
    tileHover: opts.tileHoverSoundPath ?? tileHoverSoundUrl,
    diamondRevealed: opts.diamondRevealedSoundPath ?? diamondRevealedSoundUrl,
    bombRevealed: opts.bombRevealedSoundPath ?? bombRevealedSoundUrl,
    win: opts.winSoundPath ?? winSoundUrl,
    gameStart: opts.gameStartSoundPath ?? gameStartSoundUrl,
  };

  const soundManager = createSoundManager({
    sound,
    effectPaths: soundEffectPaths,
    aliases: SOUND_ALIASES,
  });

  async function loadDiamondTexture() {
    return Assets.load(diamondTexturePath);
  }

  async function loadBombTexture() {
    return Assets.load(bombTexturePath);
  }

  async function loadExplosionFrames() {
    if (!gridOptions.explosionSheetEnabled) {
      return { frames: null, width: 0, height: 0 };
    }

    const baseTex = await Assets.load(explosionSheetPath);
    const sheetW = baseTex.width;
    const sheetH = baseTex.height;
    const cols = opts.explosionSheetCols ?? 7;
    const rows = opts.explosionSheetRows ?? 3;
    const frameW = Math.floor(sheetW / cols);
    const frameH = Math.floor(sheetH / rows);
    const frames = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = new Rectangle(c * frameW, r * frameH, frameW, frameH);
        frames.push(new Texture({ source: baseTex.source, frame: rect }));
      }
    }

    return { frames, width: frameW, height: frameH };
  }

  const [diamondTexture, bombTexture, explosionSheet] = await Promise.all([
    loadDiamondTexture().catch((e) => {
      console.error("loadDiamondTexture failed", e);
      return null;
    }),
    loadBombTexture().catch((e) => {
      console.error("loadBombTexture failed", e);
      return null;
    }),
    loadExplosionFrames().catch((e) => {
      console.error("loadExplosionFrames failed", e);
      return { frames: null, width: 0, height: 0 };
    }),
  ]);

  try {
    await soundManager.loadAll();
  } catch (e) {
    console.warn("loadSoundEffects failed (non-fatal)", e);
  }

  const root =
    typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("createGame: mount element not found");

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = `${initialSize}px`;
    root.style.maxWidth = "100%";
  }

  const app = new Application();
  await app.init({
    background: backgroundColor,
    width: initialSize,
    height: initialSize,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });

  root.innerHTML = "";
  root.appendChild(app.canvas);

  const board = new Container();
  const ui = new Container();
  app.stage.addChild(board, ui);

  const cardGrid = new CardGrid({
    app,
    board,
    options: gridOptions,
    palette: PALETTE,
    playSoundEffect: (key, options = {}) => soundManager.play(key, options),
    getMode,
    onCardSelected,
    onAutoSelectionChange,
    onWin,
    onGameOver,
    onChange,
    textures: {
      diamondTexture,
      bombTexture,
      explosionFrames: explosionSheet.frames,
      explosionFrameW: explosionSheet.width,
      explosionFrameH: explosionSheet.height,
    },
  });

  const winPopup = createWinPopup({
    app,
    palette: PALETTE,
    fontFamily,
    width: opts.winPopupWidth ?? 240,
    height: opts.winPopupHeight ?? 170,
    showDuration: opts.winPopupShowDuration ?? 260,
    runTween: (config) => tween(app, config),
    isAnimationDisabled: () => !animationsEnabled,
    playWinSound: () => soundManager.play("win"),
  });
  ui.addChild(winPopup.container);

  cardGrid.reset();
  centerBoard();

  function resizeSquare() {
    const rect = root.getBoundingClientRect();
    const size = Math.max(1, Math.min(rect.width, rect.height || rect.width));
    app.renderer.resize(size, size);
    centerBoard();
  }

  function centerBoard() {
    cardGrid.centerBoard();
    winPopup.position();
  }

  function setAnimationsEnabled(enabled) {
    animationsEnabled = Boolean(enabled);
    cardGrid.setAnimationsEnabled(enabled);
    if (!animationsEnabled) {
      winPopup.hide();
    }
  }

  const ro = new ResizeObserver(() => resizeSquare());
  ro.observe(root);
  resizeSquare();
  setTimeout(resizeSquare, 0);

  function destroy() {
    try {
      ro.disconnect();
    } catch {}
    cardGrid.destroy();
    app.destroy(true);
    if (app.canvas?.parentNode === root) root.removeChild(app.canvas);
  }

  function setMines(n) {
    cardGrid.setMines(n);
    cardGrid.reset();
  }

  function getState() {
    return cardGrid.getState();
  }

  function reset(options = {}) {
    cardGrid.reset(options);
  }

  function setSelectedCardIsDiamond() {
    cardGrid.finalizeSelection(false);
  }

  function SetSelectedCardIsBomb() {
    cardGrid.finalizeSelection(true);
  }

  function selectRandomTile() {
    return cardGrid.selectRandomTile();
  }

  function getAutoSelectionCoordinates() {
    return cardGrid.getAutoSelectionCoordinates();
  }

  function revealAutoSelections(results) {
    cardGrid.revealAutoSelections(results);
  }

  function clearAutoSelections() {
    cardGrid.clearAutoSelections();
  }

  function applyAutoSelectionsFromCoordinates(coords) {
    return cardGrid.applyAutoSelectionsFromCoordinates(coords);
  }

  function revealRemainingTiles() {
    cardGrid.revealRemainingTiles();
  }

  function getAutoResetDelay() {
    return cardGrid.getAutoResetDelay();
  }

  function showWinPopup(multiplierValue, amountValue) {
    winPopup.show(multiplierValue, amountValue);
  }

  return {
    app,
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
    getAutoResetDelay,
    showWinPopup,
    setAnimationsEnabled,
  };
}
