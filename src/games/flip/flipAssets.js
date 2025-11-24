import {
  Assets,
  Color,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";

const DEFAULT_ASSETS = [
  { alias: "coin_heads", src: "assets/flip/coin_heads.png" },
  { alias: "coin_tails", src: "assets/flip/coin_tails.png" },
  { alias: "ui_button", src: "assets/flip/ui_button.png" },
];

function makeHeadTexture() {
  const g = new Graphics();
  g.circle(0, 0, 48).fill(new Color("#1ec8b6"));
  g.circle(0, 0, 30).fill(new Color("#0f6f64"));
  g.text({
    text: "H",
    style: { fill: "#ffffff", fontSize: 40, fontWeight: "700" },
    x: -12,
    y: -28,
  });
  return Texture.from(g);
}

function makeTailTexture() {
  const g = new Graphics();
  g.poly([0, -50, 50, 0, 0, 50, -50, 0]).fill(new Color("#fbbc05"));
  g.poly([0, -32, 32, 0, 0, 32, -32, 0]).fill(new Color("#c08a00"));
  g.text({
    text: "T",
    style: { fill: "#2d1b00", fontSize: 36, fontWeight: "700" },
    x: -10,
    y: -24,
  });
  return Texture.from(g);
}

function makeButtonTexture() {
  const g = new Graphics();
  g.roundRect(-80, -32, 160, 64, 16).fill(new Color("#2b4bff"));
  g.roundRect(-74, -26, 148, 52, 14).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
  return Texture.from(g);
}

async function tryLoadTexture(alias, src, fallbackFactory) {
  try {
    const texture = await Assets.load({ alias, src });
    return texture;
  } catch (err) {
    console.warn(`[flipAssets] Missing asset ${src}, using placeholder`, err);
    return fallbackFactory();
  }
}

export async function loadFlipAssets() {
  const results = {};
  const headTexture = await tryLoadTexture(
    DEFAULT_ASSETS[0].alias,
    DEFAULT_ASSETS[0].src,
    makeHeadTexture
  );
  const tailTexture = await tryLoadTexture(
    DEFAULT_ASSETS[1].alias,
    DEFAULT_ASSETS[1].src,
    makeTailTexture
  );
  const buttonTexture = await tryLoadTexture(
    DEFAULT_ASSETS[2].alias,
    DEFAULT_ASSETS[2].src,
    makeButtonTexture
  );

  results.heads = headTexture;
  results.tails = tailTexture;
  results.button = buttonTexture;
  results.coinSprites = {
    heads: Sprite.from(headTexture),
    tails: Sprite.from(tailTexture),
  };
  results.factories = { headTexture: makeHeadTexture, tailTexture: makeTailTexture };
  return results;
}

export const flipAssetList = DEFAULT_ASSETS;
