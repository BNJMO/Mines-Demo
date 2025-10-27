import { Container, Graphics, Sprite, AnimatedSprite, BlurFilter } from "pixi.js";
import Ease from "../ease.js";
import { AUTO_SELECTION_COLOR, PALETTE } from "./constants.js";
import { tween } from "./utils/tween.js";

function easeFromName(name, t) {
  switch (name) {
    case "easeInOutBack":
      return Ease.easeInOutBack(t);
    case "easeInOutSine":
      return Ease.easeInOutSine(t);
    case "easeOutBack":
      return Ease.easeOutBack(t);
    case "easeInOutQuad":
      return Ease.easeInOutQuad(t);
    default:
      return t;
  }
}

export class CardGrid {
  constructor({
    app,
    board,
    options,
    palette = PALETTE,
    playSoundEffect,
    getMode,
    onCardSelected = null,
    onAutoSelectionChange = () => {},
    onWin = () => {},
    onGameOver = () => {},
    onChange = () => {},
    textures = {},
  }) {
    this.app = app;
    this.board = board ?? new Container();
    this.options = options;
    this.palette = palette;
    this.playSoundEffect = playSoundEffect ?? (() => {});
    this.getMode = getMode ?? (() => "manual");
    this.onCardSelected = onCardSelected;
    this.onAutoSelectionChange = onAutoSelectionChange;
    this.onWin = onWin;
    this.onGameOver = onGameOver;
    this.onChange = onChange;

    this.disableAnimations = Boolean(options.disableAnimations);
    this.gridSize = options.gridSize ?? 5;
    this.mines = Math.max(1, Math.min(options.mines ?? 5, this.gridSize * this.gridSize - 1));

    this.tiles = [];
    this.bombPositions = new Set();
    this.gameOver = false;
    this.shouldPlayStartSound = true;
    this.revealedSafe = 0;
    this.totalSafe = this.gridSize * this.gridSize - this.mines;
    this.waitingForChoice = false;
    this.selectedTile = null;
    this.autoSelectedTiles = new Set();
    this.autoSelectionOrder = [];

    this.diamondTexture = textures.diamondTexture ?? null;
    this.bombTexture = textures.bombTexture ?? null;
    this.explosionFrames = textures.explosionFrames ?? null;
    this.explosionFrameW = textures.explosionFrameW ?? 0;
    this.explosionFrameH = textures.explosionFrameH ?? 0;
    this.activeExplosionSprites = new Set();
  }

  reset({ preserveAutoSelections = false } = {}) {
    this.gameOver = false;
    this.bombPositions.clear();
    this.shouldPlayStartSound = true;
    const preservedAutoSelections = preserveAutoSelections
      ? this.getAutoSelectionCoordinates()
      : null;
    const emitAutoSelectionChange = !preserveAutoSelections;
    this.buildBoard({ emitAutoSelectionChange });
    if (preserveAutoSelections && preservedAutoSelections?.length) {
      this.applyAutoSelectionsFromCoordinates(preservedAutoSelections);
    }
    this.onChange(this.getState());
  }

  setTextures(textures = {}) {
    if (textures.diamondTexture) {
      this.diamondTexture = textures.diamondTexture;
    }
    if (textures.bombTexture) {
      this.bombTexture = textures.bombTexture;
    }
    if (Array.isArray(textures.explosionFrames)) {
      this.explosionFrames = textures.explosionFrames;
    }
    if (textures.explosionFrameW != null) {
      this.explosionFrameW = textures.explosionFrameW;
    }
    if (textures.explosionFrameH != null) {
      this.explosionFrameH = textures.explosionFrameH;
    }
  }

  setGridSize(size) {
    this.gridSize = Math.max(1, size | 0);
    this.mines = Math.min(this.mines, this.gridSize * this.gridSize - 1);
    this.totalSafe = this.gridSize * this.gridSize - this.mines;
  }

  setMines(count) {
    this.mines = Math.max(1, Math.min(count | 0, this.gridSize * this.gridSize - 1));
    this.totalSafe = this.gridSize * this.gridSize - this.mines;
  }

  setAnimationsEnabled(enabled) {
    const nextDisabled = !Boolean(enabled);
    if (this.disableAnimations === nextDisabled) {
      return;
    }

    this.disableAnimations = nextDisabled;

    if (this.disableAnimations) {
      for (const tile of this.tiles) {
        if (!tile) continue;
        this.stopHover(tile);
        this.stopWiggle(tile);
        this.forceFlatPose(tile);
        this.refreshTileTint(tile);
      }
    }
  }

  getState() {
    return {
      grid: this.gridSize,
      mines: this.mines,
      revealedSafe: this.revealedSafe,
      totalSafe: this.totalSafe,
      gameOver: this.gameOver,
      waitingForChoice: this.waitingForChoice,
      selectedTile: this.selectedTile
        ? { row: this.selectedTile.row, col: this.selectedTile.col }
        : null,
    };
  }

  destroy() {
    this.cleanupExplosionSprites();
    const removed = this.board.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true });
    }
    this.tiles = [];
    this.bombPositions.clear();
  }

  cleanupExplosionSprites() {
    for (const sprite of this.activeExplosionSprites) {
      if (!sprite.destroyed) {
        sprite.stop();
        sprite.destroy();
      }
    }
    this.activeExplosionSprites.clear();
  }

  isAutoModeActive() {
    try {
      return String(this.getMode?.() ?? "manual").toLowerCase() === "auto";
    } catch (e) {
      return false;
    }
  }

  notifyAutoSelectionChange() {
    this.onAutoSelectionChange(this.autoSelectedTiles.size);
  }

  paintTileBase(graphic, size, radius, color) {
    if (!graphic || typeof graphic.clear !== "function") {
      return;
    }

    graphic
      .clear()
      .roundRect(0, 0, size, size, radius)
      .fill(color)
      .stroke({
        color: this.palette.tileStroke,
        width: this.options.strokeWidth,
        alpha: 0.9,
      });
  }

  paintTileInset(graphic, size, radius, pad, color) {
    if (!graphic || typeof graphic.clear !== "function") {
      return;
    }

    graphic
      .clear()
      .roundRect(pad, pad, size - pad * 2, size - pad * 2, Math.max(0, radius - pad))
      .fill(color)
      .stroke({
        color: this.palette.tileStroke,
        width: this.options.strokeWidth,
        alpha: 0.3,
      });
  }

  applyTileTint(tile, tint) {
    tile.tint = tint;
    tile._card.tint = tint;
    tile._inset.tint = tint;
  }

  refreshTileTint(tile) {
    const baseTint = tile.isAutoSelected
      ? AUTO_SELECTION_COLOR
      : this.palette.defaultTint;
    tile.tint = baseTint;
    tile._card.tint = baseTint;
    tile._inset.tint = baseTint;
  }

  setAutoTileSelected(tile, selected, { emit = true, refresh = true, releaseHover = true } = {}) {
    if (selected) {
      tile.isAutoSelected = true;
      this.autoSelectedTiles.add(tile);
      this.autoSelectionOrder.push(tile);
      if (refresh) {
        this.applyTileTint(tile, AUTO_SELECTION_COLOR);
        tile._icon.alpha = this.options.iconRevealedSizeOpacity;
      }
    } else {
      tile.isAutoSelected = false;
      this.autoSelectedTiles.delete(tile);
      const idx = this.autoSelectionOrder.indexOf(tile);
      if (idx >= 0) {
        this.autoSelectionOrder.splice(idx, 1);
      }
      if (refresh) {
        this.refreshTileTint(tile);
        tile._icon.alpha = 1;
      }
    }

    if (emit) {
      this.notifyAutoSelectionChange();
    }

    if (releaseHover && !selected) {
      this.hoverTile(tile, false);
    }
  }

  toggleAutoTileSelection(tile) {
    this.setAutoTileSelected(tile, !tile.isAutoSelected);
  }

  clearAutoSelections({ emit = true } = {}) {
    for (const tile of this.autoSelectedTiles) {
      tile.isAutoSelected = false;
      this.refreshTileTint(tile);
      tile._icon.alpha = 1;
    }
    this.autoSelectedTiles.clear();
    this.autoSelectionOrder.length = 0;
    if (emit) {
      this.notifyAutoSelectionChange();
    }
  }

  createTile(row, col, size) {
    const gap = size * this.options.gapBetweenTiles;
    const x = col * (size + gap);
    const y = row * (size + gap);
    const radius = size * 0.12;
    const elevationOffset = size * 0.1;
    const shadowBlur = size * 0.08;
    const lipOffset = size * 0.04;

    const elevationShadow = new Graphics()
      .roundRect(0, 0, size, size, radius)
      .fill(this.palette.tileElevationShadow);
    elevationShadow.y = elevationOffset;
    elevationShadow.alpha = 0.32;
    const shadowFilter = new BlurFilter(shadowBlur);
    shadowFilter.quality = 2;
    elevationShadow.filters = [shadowFilter];

    const elevationLip = new Graphics()
      .roundRect(0, 0, size, size, radius)
      .fill(this.palette.tileElevationBase);
    elevationLip.y = lipOffset;
    elevationLip.alpha = 0.85;

    const card = new Graphics();
    this.paintTileBase(card, size, radius, this.palette.tileBase);

    const inset = new Graphics();
    this.paintTileInset(inset, size, radius, gap, this.palette.tileInset);

    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.x = size / 2;
    icon.y = size / 2;
    icon.visible = false;

    const flipWrap = new Container();
    flipWrap.addChild(elevationShadow, elevationLip, card, inset, icon);
    flipWrap.position.set(size / 2, size / 2);
    flipWrap.pivot.set(size / 2, size / 2);

    const tile = new Container();
    tile.addChild(flipWrap);

    tile.eventMode = "static";
    tile.cursor = "pointer";
    tile.row = row;
    tile.col = col;
    tile.revealed = false;
    tile._animating = false;
    tile._layoutScale = 1;

    tile._wrap = flipWrap;
    tile._card = card;
    tile._inset = inset;
    tile._icon = icon;
    tile._tileSize = size;
    tile._tileRadius = radius;
    tile._tilePad = gap;

    const startScale = 0.0001;
    flipWrap.scale?.set?.(startScale);
    if (this.disableAnimations) {
      flipWrap.scale?.set?.(1, 1);
    } else {
      tween(this.app, {
        duration: this.options.cardsSpawnDuration,
        skipUpdate: this.disableAnimations,
        ease: (x) => Ease.easeOutBack(x),
        update: (p) => {
          const s = startScale + (1 - startScale) * p;
          flipWrap.scale?.set?.(s);
        },
        complete: () => {
          flipWrap.scale?.set?.(1, 1);
        },
      });
    }

    tile.position.set(x, y);
    tile._baseX = x;
    tile._baseY = y;

    tile.on("pointerover", () => this.onTilePointerOver(tile));
    tile.on("pointerdown", () => this.onTilePointerDown(tile));
    tile.on("pointerup", () => this.onTilePointerUp(tile));
    tile.on("pointerout", () => this.onTilePointerOut(tile));
    tile.on("pointerupoutside", () => this.onTilePointerUpOutside(tile));
    tile.on("pointertap", () => this.handleTileTap(tile));

    return tile;
  }

  layoutBoard(layout) {
    const { tileSize, contentSize } = layout;
    const { width, height } = this.app.renderer;
    const scale = Math.min(width, height) / Math.max(contentSize, 1);
    const offsetX = (width - contentSize * scale) / 2;
    const offsetY = (height - contentSize * scale) / 2;

    for (const tile of this.tiles) {
      tile._layoutScale = scale;
      tile.scale.set(scale);
      tile.position.set(
        offsetX + tile._baseX * scale + tile._tileSize * scale * 0.5,
        offsetY + tile._baseY * scale + tile._tileSize * scale * 0.5
      );
      tile.pivot.set(tile._tileSize / 2, tile._tileSize / 2);
    }
  }

  layoutSizes() {
    const canvasSize = Math.min(this.app.renderer.width, this.app.renderer.height);
    const topSpace = 16;
    const boardSpace = Math.max(40, canvasSize - topSpace - 5);
    const gap = Math.max(1, Math.floor(boardSpace * this.options.gapBetweenTiles));
    const totalGaps = gap * (this.gridSize - 1);
    const tileSize = Math.floor((boardSpace - totalGaps) / this.gridSize);
    const contentSize = tileSize * this.gridSize + totalGaps;
    return { tileSize, gap, contentSize };
  }

  buildBoard({ emitAutoSelectionChange = true } = {}) {
    this.clearSelection({ emitAutoSelectionChange });
    this.cleanupExplosionSprites();
    const removed = this.board.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true });
    }
    this.tiles = [];
    this.revealedSafe = 0;
    this.totalSafe = this.gridSize * this.gridSize - this.mines;

    const layout = this.layoutSizes();

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const tile = this.createTile(r, c, layout.tileSize);
        this.board.addChild(tile);
        this.tiles.push(tile);
      }
    }

    this.layoutBoard(layout);

    if (this.shouldPlayStartSound) {
      this.playSoundEffect("gameStart");
      this.shouldPlayStartSound = false;
    }
  }

  centerBoard() {
    this.layoutBoard(this.layoutSizes());
  }

  resize(rendererWidth, rendererHeight) {
    this.app.renderer.resize(rendererWidth, rendererHeight);
    this.centerBoard();
  }

  hoverTile(tile, on) {
    if (!this.options.hoverEnabled || !tile || tile._animating) return;

    const wrap = tile._wrap;
    if (!wrap) return;

    const startScale = wrap.scale.x;
    const endScale = on ? 1.03 : 1.0;

    const startSkew = this.getSkew(wrap);
    const endSkew = on ? this.options.hoverSkewAmount : 0;

    const startY = tile.y;
    const endY = on ? tile._baseY - 3 : tile._baseY;

    const token = Symbol("hover");
    tile._hoverToken = token;

    const card = tile._card;
    const inset = tile._inset;
    if (card && inset) {
      const size = tile._tileSize;
      const r = tile._tileRadius;
      const pad = tile._tilePad;
      if (on) {
        this.flipFace(card, size, size, r, this.palette.hover);
        this.flipInset(inset, size, size, r, pad, this.palette.hover);
      } else {
        this.refreshTileTint(tile);
      }
    }

    if (this.disableAnimations) {
      tile._wrap.scale.set(endScale);
      this.setSkew(tile._wrap, endSkew);
      tile.y = endY;
      return;
    }

    tween(this.app, {
      duration: on ? this.options.hoverEnterDuration : this.options.hoverExitDuration,
      skipUpdate: this.disableAnimations,
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
        this.setSkew(wrap, k);

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
        this.setSkew(wrap, endSkew);
        tile.y = endY;
      },
    });
  }

  wiggleTile(tile) {
    if (!this.options.wiggleSelectionEnabled || tile._animating) return;

    const wrap = tile._wrap;
    const baseSkew = this.getSkew(wrap);
    const baseScale = wrap.scale.x;

    tile._animating = true;

    const token = Symbol("wiggle");
    tile._wiggleToken = token;

    tween(this.app, {
      duration: this.options.wiggleSelectionDuration,
      skipUpdate: this.disableAnimations,
      ease: (p) => p,
      update: (p) => {
        if (tile._wiggleToken !== token) return;
        const wiggle =
          Math.sin(p * Math.PI * this.options.wiggleSelectionTimes) *
          this.options.wiggleSelectionIntensity;
        this.setSkew(wrap, baseSkew + wiggle);

        const scaleWiggle =
          1 +
          Math.sin(p * Math.PI * this.options.wiggleSelectionTimes) *
            this.options.wiggleSelectionScale;
        wrap.scale.x = wrap.scale.y = baseScale * scaleWiggle;
      },
      complete: () => {
        if (tile._wiggleToken !== token) return;
        this.setSkew(wrap, baseSkew);
        wrap.scale.x = wrap.scale.y = baseScale;
        tile._animating = false;
      },
    });
  }

  stopHover(tile) {
    tile._hoverToken = Symbol("hover-cancelled");
  }

  stopWiggle(tile) {
    tile._wiggleToken = Symbol("wiggle-cancelled");
    tile._animating = false;
  }

  getSkew(wrap) {
    return this.options.hoverTiltAxis === "y" ? wrap.skew.y : wrap.skew.x;
  }

  setSkew(wrap, value) {
    if (this.options.hoverTiltAxis === "y") wrap.skew.y = value;
    else wrap.skew.x = value;
  }

  flipFace(graphic, width, height, radius, color) {
    graphic
      .clear()
      .roundRect(0, 0, width, height, radius)
      .fill(color)
      .stroke({
        color: this.palette.tileStrokeFlipped,
        width: this.options.strokeWidth,
        alpha: 0.65,
      });
  }

  flipInset(graphic, width, height, radius, pad, color) {
    const insetRadius = Math.max(0, radius - pad);
    graphic
      .clear()
      .roundRect(pad, pad, width - pad * 2, height - pad * 2, insetRadius)
      .fill(color)
      .stroke({
        color: this.palette.tileStrokeFlipped,
        width: this.options.strokeWidth,
        alpha: 0.35,
      });
  }

  forceFlatPose(tile) {
    tile._hoverToken = Symbol("hover-kill");
    tile._wiggleToken = Symbol("wiggle-kill");

    const wrap = tile._wrap;
    if (!wrap || !wrap.scale) {
      return;
    }

    const clampOnce = () => {
      if (!wrap.scale) return;

      wrap.scale.set(1, 1);
      wrap.skew.set(0, 0);
      wrap.rotation = 0;

      const layoutScale = tile._layoutScale ?? 1;
      tile.scale?.set(layoutScale, layoutScale);
      tile.skew?.set(0, 0);
      tile.rotation = 0;

      tile.y = tile._baseY ?? tile.y;
    };

    clampOnce();

    this.app.ticker.addOnce(clampOnce);
    this.app.ticker.addOnce(clampOnce);
  }

  easeFlip(t) {
    return easeFromName(this.options.flipEaseFunction, t);
  }

  revealTileWithFlip(tile, face, revealedByPlayer = true, options = {}) {
    const {
      useSelectionBase = false,
      staggerRevealAll = true,
      onComplete = null,
    } = options;
    if (tile._animating || tile.revealed) return false;

    const unrevealed = this.tiles.filter((t) => !t.revealed).length;
    const revealedCount = this.tiles.length - unrevealed;
    const progress = Math.min(1, revealedCount / this.tiles.length);
    const delay = revealedByPlayer
      ? this.options.flipDelayMin +
        (this.options.flipDelayMax - this.options.flipDelayMin) * progress
      : this.options.flipDelayMin;
    setTimeout(() => {
      this.stopHover(tile);
      this.stopWiggle(tile);
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
        onComplete?.(tile, { face, revealedByPlayer, cancelled: true });
        return;
      }

      tile._animating = true;

      if (revealedByPlayer) {
        this.playSoundEffect("tileFlip");
      }

      const startScaleY = wrap.scale.y;
      const startSkew = this.getSkew(wrap);

      let swapped = false;

      if (!revealedByPlayer) {
        icon.alpha = this.options.iconRevealedSizeOpacity;
      }

      tween(this.app, {
        duration: this.options.flipDuration,
        skipUpdate: this.disableAnimations,
        ease: (t) => this.easeFlip(t),
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
            onComplete?.(tile, { face, revealedByPlayer, cancelled: true });
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
          this.setSkew(wrap, skewOut);

          if (!swapped && t >= 0.5) {
            swapped = true;
            icon.visible = true;
            const iconSizeFactor = revealedByPlayer
              ? 1.0
              : this.options.iconRevealedSizeFactor;
            const maxW = tile._tileSize * this.options.iconSizePercentage * iconSizeFactor;
            const maxH = tile._tileSize * this.options.iconSizePercentage * iconSizeFactor;
            icon.width = maxW;
            icon.height = maxH;

          if (face === "bomb") {
            icon.texture = this.bombTexture;
              const facePalette = revealedByPlayer
                ? useSelectionBase
                  ? AUTO_SELECTION_COLOR
                  : this.palette.bombA
                : this.palette.bombAUnrevealed;
              this.flipFace(card, tileSize, tileSize, radius, facePalette);
              const insetPalette = revealedByPlayer
                ? this.palette.bombB
                : this.palette.bombBUnrevealed;
              this.flipInset(inset, tileSize, tileSize, radius, pad, insetPalette);

              if (revealedByPlayer) {
                this.spawnExplosionSheetOnTile(tile);
                this.bombShakeTile(tile);
                this.playSoundEffect("bombRevealed");
              }
            } else {
              icon.texture = this.diamondTexture;
              const facePalette = revealedByPlayer
                ? useSelectionBase
                  ? AUTO_SELECTION_COLOR
                  : this.palette.safeA
                : this.palette.safeAUnrevealed;
              this.flipFace(card, tileSize, tileSize, radius, facePalette);
              const insetPalette = revealedByPlayer
                ? this.palette.safeB
                : this.palette.safeBUnrevealed;
              this.flipInset(inset, tileSize, tileSize, radius, pad, insetPalette);

              if (revealedByPlayer) {
                const minPitch = Math.max(0.01, Number(this.options.diamondRevealPitchMin));
                const maxPitch = Math.max(0.01, Number(this.options.diamondRevealPitchMax));
                const safeProgress =
                  this.totalSafe <= 1
                    ? 1
                    : Math.min(
                        1,
                        Math.max(0, this.revealedSafe / Math.max(this.totalSafe - 1, 1))
                      );
                const pitch =
                  minPitch +
                  (maxPitch - minPitch) * Ease.easeInQuad(safeProgress);
                this.playSoundEffect("diamondRevealed", { speed: pitch });
              }
            }
          }
        },
        complete: () => {
          if (tile.destroyed || !wrap.scale || wrap.destroyed) {
            tile._animating = false;
            onComplete?.(tile, { face, revealedByPlayer, cancelled: true });
            return;
          }

          this.forceFlatPose(tile);
          tile._animating = false;
          tile.revealed = true;

          if (revealedByPlayer) {
            if (face === "bomb") {
              this.revealAllTiles(tile, { stagger: staggerRevealAll });
              this.onGameOver();
            } else {
              this.revealedSafe += 1;
              if (this.revealedSafe >= this.totalSafe) {
                this.gameOver = true;
                this.revealAllTiles();
                this.onWin();
              }
            }

            this.onChange(this.getState());
          }

          onComplete?.(tile, { face, revealedByPlayer });
        },
      });
      try {
        window.__mines_tiles = this.tiles.length;
      } catch {}
    }, delay);

    return true;
  }

  spawnExplosionSheetOnTile(tile) {
    if (
      !this.options.explosionSheetEnabled ||
      !this.explosionFrames ||
      !this.explosionFrames.length
    )
      return;

    const anim = new AnimatedSprite(this.explosionFrames);
    anim.loop = true;
    anim.animationSpeed = this.options.explosionSheetFps / 60;
    anim.anchor.set(0.5);
    anim.alpha = this.options.explosionSheetOpacity;

    const size = tile._tileSize;
    anim.position.set(size / 2, size / 2);

    const sx = (size * this.options.explosionSheetScaleFit) / this.explosionFrameW;
    const sy = (size * this.options.explosionSheetScaleFit) / this.explosionFrameH;
    anim.scale.set(Math.min(sx, sy));

    const wrap = tile._wrap;
    const iconIndex = wrap.getChildIndex(tile._icon);
    wrap.addChildAt(anim, iconIndex);

    this.activeExplosionSprites.add(anim);
    const originalDestroy = anim.destroy.bind(anim);
    anim.destroy = (...args) => {
      this.activeExplosionSprites.delete(anim);
      return originalDestroy(...args);
    };

    anim.play();
  }

  bombShakeTile(tile) {
    if (
      !this.options.explosionShakeEnabled ||
      !tile ||
      tile.destroyed ||
      tile._bombShaking
    )
      return;

    tile._bombShaking = true;

    const duration = this.options.explosionShakeDuration;
    const amp = this.options.explosionShakeAmplitude;
    const rotAmp = this.options.explosionShakerotationAmplitude;
    const f1 = this.options.explosionShakeBaseFrequency;
    const f2 = this.options.explosionShakeSecondaryFrequency;

    const bx = tile._baseX ?? tile.x;
    const by = tile._baseY ?? tile.y;
    const r0 = tile.rotation;

    const phiX1 = Math.random() * Math.PI * 2;
    const phiX2 = Math.random() * Math.PI * 2;
    const phiY1 = Math.random() * Math.PI * 2;
    const phiY2 = Math.random() * Math.PI * 2;

    tween(this.app, {
      duration,
      skipUpdate: this.disableAnimations,
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
          tile && (tile._bombShaking = false);
          return;
        }

        tile.x = bx + dx;
        tile.y = by + dy;

        tile.rotation = r0 + Math.sin(w2 + phiX1) * rotAmp * decay;
      },
      complete: () => {
        if (!tile || tile.destroyed) {
          tile && (tile._bombShaking = false);
          return;
        }

        tile.x = bx;
        tile.y = by;
        tile.rotation = r0;
        tile._bombShaking = false;
      },
    });
  }

  selectRandomTile() {
    if (this.gameOver || this.waitingForChoice) {
      return null;
    }

    const untapedTiles = this.tiles.filter((t) => !t.taped);
    if (untapedTiles.length <= this.mines) {
      return null;
    }

    const candidates = untapedTiles.filter((t) => !t.revealed && !t._animating);
    if (candidates.length === 0) {
      return null;
    }

    const tile = candidates[Math.floor(Math.random() * candidates.length)];
    tile.taped = true;
    this.hoverTile(tile, false);
    this.enterWaitingState(tile);

    return { row: tile.row, col: tile.col };
  }

  getAutoSelectionCoordinates() {
    return this.autoSelectionOrder.map((tile) => ({ row: tile.row, col: tile.col }));
  }

  revealAutoSelections(results = []) {
    if (!Array.isArray(results) || results.length === 0) {
      return;
    }

    const tileMap = new Map(
      this.tiles.map((tile) => [`${tile.row},${tile.col}`, tile])
    );

    let pendingReveals = 0;
    let bombHit = false;
    let winFinalized = false;

    const finalizeAutoWin = () => {
      if (winFinalized || bombHit || pendingReveals > 0) {
        return;
      }
      if (this.revealedSafe < this.totalSafe) {
        winFinalized = true;
        this.revealAllTiles(undefined, { stagger: false });
        this.onWin();
      }
    };

    this.waitingForChoice = false;
    this.selectedTile = null;

    for (const entry of results) {
      const key = `${entry.row},${entry.col}`;
      const tile = tileMap.get(key);
      if (!tile || tile.revealed) {
        continue;
      }

      const useSelectionBase = Boolean(tile.isAutoSelected);
      if (tile.isAutoSelected) {
        this.setAutoTileSelected(tile, false, {
          emit: false,
          refresh: false,
          releaseHover: false,
        });
      }

      const normalizedResult = String(entry?.result ?? "").toLowerCase();
      const isBomb = normalizedResult === "lost";
      if (isBomb) {
        bombHit = true;
      }

      const started = this.revealTileWithFlip(tile, isBomb ? "bomb" : "diamond", true, {
        useSelectionBase,
        staggerRevealAll: false,
        onComplete: () => {
          pendingReveals = Math.max(0, pendingReveals - 1);
          finalizeAutoWin();
        },
      });

      if (started) {
        pendingReveals += 1;
      }
    }

    this.clearAutoSelections({ emit: false });
    this.notifyAutoSelectionChange();

    this.gameOver = true;
    this.waitingForChoice = false;
    this.onChange(this.getState());

    finalizeAutoWin();
  }

  revealAllTiles(triggeredBombTile, { stagger = true } = {}) {
    const unrevealed = this.tiles.filter((t) => !t.revealed);
    const bombsNeeded = this.mines - 1;
    let available = unrevealed.filter((t) => t !== triggeredBombTile);

    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
      this.stopHover(available[i]);
    }

    const bombTiles = available.slice(0, bombsNeeded);
    bombTiles.forEach((t) => this.bombPositions.add(`${t.row},${t.col}`));

    unrevealed.forEach((t, idx) => {
      const key = `${t.row},${t.col}`;
      const isBomb = this.bombPositions.has(key);

      if (stagger && this.options.revealAllIntervalDelay > 0 && !this.disableAnimations) {
        setTimeout(() => {
          this.revealTileWithFlip(t, isBomb ? "bomb" : "diamond", false);
        }, this.options.revealAllIntervalDelay * idx);
      } else {
        this.revealTileWithFlip(t, isBomb ? "bomb" : "diamond", false);
      }
    });
  }

  enterWaitingState(tile) {
    this.waitingForChoice = true;
    this.selectedTile = tile;
    tile._tiltDir = Math.random() > 0.5 ? 1 : -1;
    this.wiggleTile(tile);
    this.onCardSelected?.(tile.row, tile.col);
    this.onChange(this.getState());
  }

  clearSelection({ emitAutoSelectionChange = true } = {}) {
    this.waitingForChoice = false;
    this.selectedTile = null;
    for (const tile of this.tiles) {
      tile.taped = false;
      this.stopHover(tile);
      this.stopWiggle(tile);
      if (!tile.revealed) {
        this.refreshTileTint(tile);
        tile._icon.visible = false;
        tile._icon.alpha = 1;
      }
    }
    this.clearAutoSelections({ emit: emitAutoSelectionChange });
  }

  applyAutoSelectionsFromCoordinates(coords = []) {
    let applied = 0;
    const tileMap = new Map(
      this.tiles.map((tile) => [`${tile.row},${tile.col}`, tile])
    );

    for (const entry of coords) {
      const tile = tileMap.get(`${entry.row},${entry.col}`);
      if (!tile || tile.revealed || tile.isAutoSelected) continue;
      this.setAutoTileSelected(tile, true, { emit: false });
      applied += 1;
    }

    this.notifyAutoSelectionChange();
    return applied;
  }

  revealRemainingTiles() {
    this.revealAllTiles();
  }

  getAutoResetDelay() {
    return Number(this.options.autoResetDelayMs ?? 1500);
  }

  onTilePointerOver(tile) {
    const autoMode = this.isAutoModeActive();
    const untapedCount = this.tiles.filter((t) => !t.taped).length;
    if (!autoMode && untapedCount <= this.mines) return;

    const waitingBlocked = !autoMode && this.waitingForChoice;

    if (
      !this.gameOver &&
      !waitingBlocked &&
      !tile.revealed &&
      !tile._animating &&
      this.selectedTile !== tile
    ) {
      if (this.options.hoverEnabled && (!autoMode || !tile.isAutoSelected)) {
        this.playSoundEffect("tileHover");
      }
      if (!autoMode || !tile.isAutoSelected) {
        this.hoverTile(tile, true);
      }

      if (tile._pressed) {
        this.applyTileTint(tile, this.palette.pressedTint);
      }
    }
  }

  onTilePointerDown(tile) {
    const autoMode = this.isAutoModeActive();
    const untapedCount = this.tiles.filter((t) => !t.taped).length;
    const limitReached = untapedCount <= this.mines;
    const isSelectingNewAutoTile = autoMode && !tile.isAutoSelected;

    if (
      this.gameOver ||
      tile.revealed ||
      tile._animating ||
      (!autoMode && (this.waitingForChoice || limitReached)) ||
      (autoMode && isSelectingNewAutoTile && limitReached)
    ) {
      return;
    }

    this.playSoundEffect("tileTapDown");
    this.applyTileTint(tile, this.palette.pressedTint);
    tile._pressed = true;
  }

  onTilePointerUp(tile) {
    if (tile._pressed) {
      tile._pressed = false;
      this.refreshTileTint(tile);
    }
  }

  onTilePointerOut(tile) {
    if (!tile.revealed && !tile._animating && this.selectedTile !== tile) {
      if (!this.isAutoModeActive() || !tile.isAutoSelected) {
        this.hoverTile(tile, false);
      }
      if (tile._pressed) {
        tile._pressed = false;
        this.refreshTileTint(tile);
      }
    }
  }

  onTilePointerUpOutside(tile) {
    if (tile._pressed) {
      tile._pressed = false;
      this.refreshTileTint(tile);
    }
  }

  handleTileTap(tile) {
    const autoMode = this.isAutoModeActive();
    const untapedCount = this.tiles.filter((t) => !t.taped).length;

    if (autoMode) {
      if (this.gameOver || tile.revealed || tile._animating) {
        return;
      }
      if (!tile.isAutoSelected && untapedCount <= this.mines) {
        return;
      }

      this.toggleAutoTileSelection(tile);
      return;
    }

    if (
      this.gameOver ||
      this.waitingForChoice ||
      tile.revealed ||
      tile._animating ||
      untapedCount <= this.mines
    )
      return;

    tile.taped = true;
    this.hoverTile(tile, false);
    this.enterWaitingState(tile);
  }

  finalizeSelection(isBomb) {
    if (!this.waitingForChoice || !this.selectedTile) return;
    const tile = this.selectedTile;
    this.waitingForChoice = false;
    this.selectedTile = null;
    if (tile._animating) {
      this.stopHover(tile);
      this.stopWiggle(tile);
    }

    if (isBomb) {
      this.gameOver = true;
    }

    this.revealTileWithFlip(tile, isBomb ? "bomb" : "diamond");
  }

}
