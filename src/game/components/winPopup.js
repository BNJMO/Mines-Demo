import { Container, Graphics, Text } from "pixi.js";
import Ease from "../../ease.js";

function formatMultiplier(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toFixed(2)}×`;
  }

  const raw = `${value ?? ""}`;
  if (!raw) return "";
  return raw.endsWith("×") ? raw : `${raw}×`;
}

function formatAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    });
  }

  return `${value ?? ""}`;
}

export function createWinPopup({
  app,
  palette,
  fontFamily,
  width,
  height,
  showDuration,
  runTween,
  isAnimationDisabled,
  playWinSound,
}) {
  const container = new Container();
  container.visible = false;
  container.scale.set(0);
  container.eventMode = "none";
  container.zIndex = 1000;

  const border = new Graphics();
  border
    .roundRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20, 32)
    .fill(palette.winPopupBorder);

  const inner = new Graphics();
  inner
    .roundRect(-width / 2, -height / 2, width, height, 28)
    .fill(palette.winPopupBackground);

  const multiplierVerticalOffset = -height / 2 + height * 0.28;
  const amountRowVerticalOffset = height / 2 - height * 0.25;

  const centerLine = new Graphics();
  const centerLinePadding = 70;
  const centerLineWidth = width - centerLinePadding * 2;
  const centerLineThickness = 5;
  centerLine
    .rect(
      -centerLineWidth / 2,
      -centerLineThickness / 2,
      centerLineWidth,
      centerLineThickness
    )
    .fill(palette.winPopupSeparationLine);

  const multiplierText = new Text({
    text: "1.00×",
    style: {
      fill: palette.winPopupMultiplierText,
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

  function layoutAmountRow() {
    const spacing = 20;
    const coinDiameter = coinRadius * 2;
    const totalWidth = amountText.width + spacing + coinDiameter;

    amountText.position.set(-(spacing / 2 + coinRadius), 0);
    coinContainer.position.set(totalWidth / 2 - coinRadius, 0);

    amountRow.position.set(0, amountRowVerticalOffset);
  }

  layoutAmountRow();

  container.addChild(border, inner, centerLine, multiplierText, amountRow);

  function position() {
    container.position.set(app.renderer.width / 2, app.renderer.height / 2);
  }

  function hide() {
    container.visible = false;
    container.scale.set(0);
  }

  function show(multiplierValue, amountValue) {
    multiplierText.text = formatMultiplier(multiplierValue);
    amountText.text = formatAmount(amountValue);
    layoutAmountRow();
    position();

    container.visible = true;
    container.alpha = 1;
    container.scale.set(0);

    playWinSound?.();

    if (isAnimationDisabled?.()) {
      container.scale.set(1);
      return;
    }

    runTween({
      duration: showDuration,
      skipUpdate: isAnimationDisabled?.(),
      ease: (t) => Ease.easeOutQuad(t),
      update: (p) => {
        container.scale.set(p);
      },
    });
  }

  return {
    container,
    show,
    hide,
    position,
  };
}
