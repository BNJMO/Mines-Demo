import { BlurFilter, Container, Graphics, Sprite } from "pixi.js";
import Ease from "../ease.js";

const AUTO_SELECTION_COLOR = 0x5800a5;

/**
 * Card encapsulates the visual and interaction logic for a single tile on the grid.
 * It exposes a PIXI.Container that can be added to a parent scene while the
 * surrounding game container can control its behaviour via the provided
 * callbacks.
 */
export class Card {
  constructor({
    app,
    palette,
    animationOptions,
    iconOptions,
    row,
    col,
    tileSize,
    strokeWidth,
    disableAnimations,
    interactionCallbacks = {},
  }) {
    this.app = app;
    this.palette = palette;
    this.animationOptions = animationOptions;
    this.iconOptions = {
      sizePercentage: iconOptions?.sizePercentage ?? 0.7,
      revealedSizeFactor: iconOptions?.revealedSizeFactor ?? 0.85,
    };
    this.row = row;
    this.col = col;
    this.strokeWidth = strokeWidth;
    this.disableAnimations = Boolean(disableAnimations);
    this.interactionCallbacks = interactionCallbacks;

    this.revealed = false;
    this.destroyed = false;
    this.isAutoSelected = false;
    this.taped = false;

    this._animating = false;
    this._pressed = false;
    this._hoverToken = null;
    this._wiggleToken = null;
    this._layoutScale = 1;
    this._bombShaking = false;
    this._swapHandled = false;

    this._tiltDir = 1;
    this._baseX = 0;
    this._baseY = 0;

    this.container = this.#createCard(tileSize);
  }

  setDisableAnimations(disabled) {
    this.disableAnimations = disabled;
    if (disabled) {
      this.forceFlatPose();
      this.refreshTint();
      if (this._wrap?.scale?.set) {
        this._wrap.scale.set(1);
      }
      if (this._wrap) {
        this.setSkew(0);
      }
    }
  }

  get displayObject() {
    return this.container;
  }

  setAutoSelected(selected, { refresh = true } = {}) {
    this.isAutoSelected = Boolean(selected);
    if (refresh) {
      this.refreshTint();
    }
  }

  applyTint(color) {
    if (!this._card) return;
    this._card.tint = color ?? this.palette.defaultTint;
    this._inset.tint = color ?? this.palette.defaultTint;
  }

  refreshTint() {
    if (this.revealed) return;
    const base = this.isAutoSelected
      ? AUTO_SELECTION_COLOR
      : this.palette.defaultTint;
    this.applyTint(base);
  }

  setPressed(pressed) {
    this._pressed = pressed;
    if (!pressed) {
      this.refreshTint();
    } else {
      this.applyTint(this.palette.pressedTint);
    }
  }

  hover(on) {
    if (this.revealed || this._animating) return;
    const { hoverEnabled, hoverEnterDuration, hoverExitDuration, hoverSkewAmount, hoverTiltAxis } =
      this.animationOptions;

    if (!hoverEnabled) return;

    const wrap = this._wrap;
    if (!wrap) return;

    const startScale = wrap.scale.x;
    const endScale = on ? 1.03 : 1.0;
    const startSkew = this.getSkew();
    const endSkew = on ? hoverSkewAmount : 0;
    const startY = this.container.y;
    const endY = on ? this._baseY - 3 : this._baseY;

    const token = Symbol("card-hover");
    this._hoverToken = token;

    if (this.disableAnimations) {
      this._wrap.scale?.set?.(endScale);
      this.setSkew(endSkew);
      this.container.y = endY;
      return;
    }

    this.tween({
      duration: on ? hoverEnterDuration : hoverExitDuration,
      ease: (x) => (on ? 1 - Math.pow(1 - x, 3) : x * x * x),
      update: (p) => {
        if (this._hoverToken !== token) return;
        const scale = startScale + (endScale - startScale) * p;
        wrap.scale.x = wrap.scale.y = scale;
        const k = startSkew + (endSkew - startSkew) * p;
        this.setSkew(k);
        this.container.y = startY + (endY - startY) * p;
      },
      complete: () => {
        if (this._hoverToken !== token) return;
        wrap.scale.x = wrap.scale.y = endScale;
        this.setSkew(endSkew);
        this.container.y = endY;
      },
    });
  }

  stopHover() {
    this._hoverToken = Symbol("card-hover-cancel");
  }

  wiggle() {
    const {
      wiggleSelectionEnabled,
      wiggleSelectionDuration,
      wiggleSelectionTimes,
      wiggleSelectionIntensity,
      wiggleSelectionScale,
    } = this.animationOptions;

    if (!wiggleSelectionEnabled || this._animating) return;

    const wrap = this._wrap;
    const baseSkew = this.getSkew();
    const baseScale = wrap.scale.x;

    this._animating = true;

    const token = Symbol("card-wiggle");
    this._wiggleToken = token;

    this.tween({
      duration: wiggleSelectionDuration,
      ease: (p) => p,
      update: (p) => {
        if (this._wiggleToken !== token) return;
        const wiggle =
          Math.sin(p * Math.PI * wiggleSelectionTimes) *
          wiggleSelectionIntensity;
        this.setSkew(baseSkew + wiggle);

        const scaleWiggle =
          1 + Math.sin(p * Math.PI * wiggleSelectionTimes) * wiggleSelectionScale;
        wrap.scale.x = wrap.scale.y = baseScale * scaleWiggle;
      },
      complete: () => {
        if (this._wiggleToken !== token) return;
        this.setSkew(baseSkew);
        wrap.scale.x = wrap.scale.y = baseScale;
        this._animating = false;
      },
    });
  }

  stopWiggle() {
    this._wiggleToken = Symbol("card-wiggle-cancel");
    this._animating = false;
  }

  forceFlatPose() {
    if (!this._wrap) return;
    this._wrap.scale.x = this._wrap.scale.y = 1;
    this.setSkew(0);
    this.container.x = this._baseX;
    this.container.y = this._baseY;
    this.container.rotation = 0;
    this._bombShaking = false;
  }

  reveal({
    content,
    useSelectionTint = false,
    revealedByPlayer = false,
    iconSizePercentage,
    iconRevealedSizeFactor,
    onComplete,
    flipDuration,
    flipEaseFunction,
  }) {
    if (!this._wrap || this._animating || this.revealed) {
      return false;
    }

    this._animating = true;
    this.stopHover();
    this.stopWiggle();

    const easeFlip = Ease[flipEaseFunction] || ((t) => t);
    const wrap = this._wrap;
    const card = this._card;
    const inset = this._inset;
    const icon = this._icon;
    const tileSize = this._tileSize;
    const radius = this._tileRadius;
    const pad = this._tilePad;
    const startScaleY = wrap.scale.y;
    const startSkew = this.getSkew();
    const startTilt = this._tiltDir >= 0 ? +1 : -1;

    const palette = this.palette;
    const contentConfig = content ?? {};
    const contentKey =
      contentConfig.key ?? contentConfig.face ?? contentConfig.type ?? null;

    this.tween({
      duration: flipDuration,
      ease: (t) => easeFlip(t),
      update: (t) => {
        const widthFactor = Math.max(0.0001, Math.abs(Math.cos(Math.PI * t)));
        const elev = Math.sin(Math.PI * t);
        const popS = 1 + 0.06 * elev;
        const biasSkew = startTilt * 0.22 * Math.sin(Math.PI * t);
        const skewOut = startSkew * (1 - t) + biasSkew;

        wrap.scale.x = widthFactor * popS;
        wrap.scale.y = startScaleY * popS;
        this.setSkew(skewOut);

        if (!this._swapHandled && t >= 0.5) {
          this._swapHandled = true;
          icon.visible = true;
          const iconSizeFactor = revealedByPlayer
            ? 1.0
            : iconRevealedSizeFactor ??
              contentConfig.iconRevealedSizeFactor ??
              this.iconOptions.revealedSizeFactor;
          const baseSize =
            iconSizePercentage ??
            contentConfig.iconSizePercentage ??
            this.iconOptions.sizePercentage;
          const maxW = tileSize * baseSize * iconSizeFactor;
          const maxH = tileSize * baseSize * iconSizeFactor;
          icon.width = maxW;
          icon.height = maxH;

          if (contentConfig.texture) {
            icon.texture = contentConfig.texture;
          }

          contentConfig.configureIcon?.(icon, {
            card: this,
            revealedByPlayer,
          });

          const facePalette = this.#resolveRevealColor({
            paletteSet: contentConfig.palette?.face,
            revealedByPlayer,
            useSelectionTint,
            fallbackRevealed:
              contentConfig.fallbackPalette?.face?.revealed ??
              palette.tileBase ??
              this.palette.defaultTint,
            fallbackUnrevealed:
              contentConfig.fallbackPalette?.face?.unrevealed ??
              palette.tileBase ??
              this.palette.defaultTint,
          });
          this.flipFace(facePalette);

          const insetPalette = this.#resolveRevealColor({
            paletteSet: contentConfig.palette?.inset,
            revealedByPlayer,
            useSelectionTint: false,
            fallbackRevealed:
              contentConfig.fallbackPalette?.inset?.revealed ??
              palette.tileInset ??
              this.palette.tileInset ??
              this.palette.defaultTint,
            fallbackUnrevealed:
              contentConfig.fallbackPalette?.inset?.unrevealed ??
              palette.tileInset ??
              this.palette.tileInset ??
              this.palette.defaultTint,
          });
          this.flipInset(insetPalette);

          if (revealedByPlayer) {
            contentConfig.playSound?.({ card: this, revealedByPlayer });
          }

          contentConfig.onReveal?.({ card: this, revealedByPlayer });
        }
      },
      complete: () => {
        this.forceFlatPose();
        this._animating = false;
        this.revealed = true;
        this._swapHandled = false;
        const completionPayload = {
          content: contentConfig,
          key: contentKey,
          revealedByPlayer,
        };
        if (contentKey != null && completionPayload.face == null) {
          completionPayload.face = contentKey;
        }
        onComplete?.(this, completionPayload);
      },
    });

    return true;
  }

  flipFace(color) {
    if (!this._card) return;
    this._card
      .clear()
      .roundRect(0, 0, this._tileSize, this._tileSize, this._tileRadius)
      .fill(color)
      .stroke({
        color: this.palette.tileStrokeFlipped ?? this.palette.tileStroke,
        width: this.strokeWidth,
        alpha: 0.9,
      });
  }

  flipInset(color) {
    if (!this._inset) return;
    const pad = this._tilePad;
    const size = this._tileSize - pad * 2;
    this._inset
      .clear()
      .roundRect(pad, pad, size, size, Math.max(0, this._tileRadius - pad))
      .fill(color);
  }

  tween({ duration, ease = (t) => t, update, complete }) {
    if (this.disableAnimations || duration <= 0) {
      update?.(ease(1));
      complete?.();
      return;
    }

    const start = performance.now();
    const loop = () => {
      const elapsed = (performance.now() - start) / duration;
      const t = Math.min(1, elapsed);
      update?.(ease(t));
      if (t >= 1) {
        this.app.ticker.remove(loop);
        complete?.();
      }
    };
    this.app.ticker.add(loop);
  }

  setLayout({ x, y, scale }) {
    this._baseX = x;
    this._baseY = y;
    this.container.position.set(x, y);
    if (scale != null) {
      this.container.scale?.set?.(scale, scale);
      this._layoutScale = scale;
    }
  }

  setSkew(v) {
    if (!this._wrap) return;
    if (this.animationOptions.hoverTiltAxis === "y") {
      this._wrap.skew.y = v;
    } else {
      this._wrap.skew.x = v;
    }
  }

  getSkew() {
    if (!this._wrap) return 0;
    return this.animationOptions.hoverTiltAxis === "y"
      ? this._wrap.skew.y
      : this._wrap.skew.x;
  }

  #resolveRevealColor({
    paletteSet,
    revealedByPlayer,
    useSelectionTint,
    fallbackRevealed,
    fallbackUnrevealed,
  }) {
    if (revealedByPlayer && useSelectionTint) {
      return AUTO_SELECTION_COLOR;
    }

    if (revealedByPlayer) {
      return paletteSet?.revealed ?? fallbackRevealed ?? this.palette.defaultTint;
    }

    return (
      paletteSet?.unrevealed ??
      fallbackUnrevealed ??
      this.palette.defaultTint ?? 0xffffff
    );
  }

  #createCard(tileSize) {
    const pad = Math.max(6, Math.floor(tileSize * 0.08));
    const radius = Math.max(10, Math.floor(tileSize * 0.16));
    const elevationOffset = Math.max(2, Math.floor(tileSize * 0.04));
    const lipOffset = Math.max(4, Math.floor(tileSize * 0.09));
    const shadowBlur = Math.max(10, Math.floor(tileSize * 0.22));

    const elevationShadow = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileElevationShadow);
    elevationShadow.y = elevationOffset;
    elevationShadow.alpha = 0.32;
    const shadowFilter = new BlurFilter(shadowBlur);
    shadowFilter.quality = 2;
    elevationShadow.filters = [shadowFilter];

    const elevationLip = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileElevationBase);
    elevationLip.y = lipOffset;
    elevationLip.alpha = 0.85;

    const card = new Graphics();
    card
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileBase)
      .stroke({
        color: this.palette.tileStroke,
        width: this.strokeWidth,
        alpha: 0.9,
      });

    const inset = new Graphics();
    inset
      .roundRect(pad, pad, tileSize - pad * 2, tileSize - pad * 2, Math.max(0, radius - pad))
      .fill(this.palette.tileInset);

    const icon = new Sprite();
    icon.anchor.set(0.5);
    icon.x = tileSize / 2;
    icon.y = tileSize / 2;
    icon.visible = false;

    const flipWrap = new Container();
    flipWrap.addChild(elevationShadow, elevationLip, card, inset, icon);
    flipWrap.position.set(tileSize / 2, tileSize / 2);
    flipWrap.pivot.set(tileSize / 2, tileSize / 2);

    const tile = new Container();
    tile.addChild(flipWrap);
    tile.eventMode = "static";
    tile.cursor = "pointer";

    tile.row = this.row;
    tile.col = this.col;

    this._wrap = flipWrap;
    this._card = card;
    this._inset = inset;
    this._icon = icon;
    this._tileSize = tileSize;
    this._tileRadius = radius;
    this._tilePad = pad;

    const s0 = 0.0001;
    flipWrap.scale?.set?.(s0);
    if (this.disableAnimations) {
      flipWrap.scale?.set?.(1, 1);
    } else {
      this.tween({
        duration: this.animationOptions.cardsSpawnDuration,
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

    tile.on("pointerover", () => this.interactionCallbacks.onPointerOver?.(this));
    tile.on("pointerout", () => this.interactionCallbacks.onPointerOut?.(this));
    tile.on("pointerdown", () => this.interactionCallbacks.onPointerDown?.(this));
    tile.on("pointerup", () => this.interactionCallbacks.onPointerUp?.(this));
    tile.on("pointerupoutside", () =>
      this.interactionCallbacks.onPointerUpOutside?.(this)
    );
    tile.on("pointertap", () => this.interactionCallbacks.onPointerTap?.(this));

    return tile;
  }
}

