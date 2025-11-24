import { Application, Color, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { loadFlipAssets } from "./flipAssets.js";
import { FlipUI } from "./ui/FlipUI.js";

export const DEFAULT_GROWTH_FACTOR = 1.05;
export const START_MULTIPLIER = 2.0;
export const HOUSE_EDGE = 0.02;
export const MULTIPLIER_CAP = 1027604.48;
export const HISTORY_LENGTH = 30;

function mulberry32(seed) {
  return function prng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function advanceMultiplier(current, growthFactor = DEFAULT_GROWTH_FACTOR) {
  const grown = current * growthFactor;
  return Math.min(grown, MULTIPLIER_CAP);
}

export function resetMultiplier() {
  return START_MULTIPLIER;
}

export class FlipGame {
  constructor({ app, controlPanelContainer, networkRNG } = {}) {
    this.app = app;
    this.controlPanelContainer = controlPanelContainer;
    this.networkRNG = networkRNG;
    this.stage = new Container();
    this.uiLayer = new Container();
    this.state = {
      balance: 1000,
      currentBet: 1,
      chosenSide: "heads",
      currentMultiplier: START_MULTIPLIER,
      consecutiveWins: 0,
      lastPayout: 0,
      history: [],
      autoPlay: false,
      autoNonce: 0,
      autoOptions: { rounds: 10, stopOnLoss: false, stopOnMultiplier: 0 },
    };
    this.prng = mulberry32(Date.now());
    this.runningAnimation = null;
    this.localNonce = 0;
    this.autoPlayActive = false;

    this.coinContainer = new Container();
    this.coinSprite = new Sprite();

    this.app.stage.addChild(this.stage);
    this.stage.addChild(this.coinContainer);

    this.controlPanelContainer?.addChild?.(this.uiLayer);
    this.layoutResize = this.layoutResize.bind(this);
    window.addEventListener("resize", this.layoutResize);
  }

  async init() {
    this.assets = await loadFlipAssets();
    this.buildScene();
    this.loadSavedState();
    this.flipUI = new FlipUI({
      assets: this.assets,
      container: this.uiLayer,
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    });
    this.flipUI.setAutoOptions(this.state.autoOptions);
    this.flipUI.setBet(this.state.currentBet);
    this.flipUI.setSide(this.state.chosenSide);
    this.flipUI.setMultiplier(this.state.currentMultiplier);
    this.flipUI.setStreak(this.state.consecutiveWins);
    this.flipUI.setBalance(this.state.balance);
    this.flipUI.setLastPayout(this.state.lastPayout);
    this.flipUI.setNextPayout(this.state.currentBet * this.state.currentMultiplier);
    this.flipUI.setHistory(this.state.history);
    this.bindUI();
    this.layoutResize();
  }

  destroy() {
    window.removeEventListener("resize", this.layoutResize);
    this.app.ticker.remove(this.runningAnimation);
    this.stage.destroy({ children: true });
  }

  bindUI() {
    this.flipUI.on("flip", () => this.startRound());
    this.flipUI.on("sidechange", (side) => {
      this.state.chosenSide = side;
      this.saveState();
    });
    this.flipUI.on("betchange", (value) => {
      this.state.currentBet = value;
      this.flipUI.setNextPayout(value * this.state.currentMultiplier);
      this.saveState();
    });
    this.flipUI.on("maxbet", () => {
      const maxBet = this.state.balance;
      this.flipUI.setBet(maxBet, { emit: true });
    });
    this.flipUI.on("autoplaytoggle", () => {
      this.state.autoPlay = !this.state.autoPlay;
      if (this.state.autoPlay) {
        const options = this.flipUI.getAutoOptions();
        this.state.autoOptions = options;
        this.autoPlay({
          maxRounds: options.rounds,
          stopOnLoss: options.stopOnLoss,
          stopOnMultiplier: options.stopOnMultiplier,
        });
      }
    });
    this.flipUI.on("autoconfig", () => {
      if (!this.state.autoPlay) return;
      const options = this.flipUI.getAutoOptions();
      this.state.autoOptions = options;
      this.autoPlay({
        maxRounds: options.rounds,
        stopOnLoss: options.stopOnLoss,
        stopOnMultiplier: options.stopOnMultiplier,
      });
    });
  }

  layoutResize() {
    const parent = this.app.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(320, rect.height);
    this.app.renderer.resize(w, h);
    this.coinContainer.position.set(w / 2, h / 2);
    this.coinSprite.scale.set(Math.min(w, h) / 300);
    if (this.uiLayer) {
      this.uiLayer.position.set(16, 16);
    }
  }

  buildScene() {
    const bg = new Graphics();
    bg.rect(0, 0, this.app.renderer.width, this.app.renderer.height).fill(new Color("#091b26"));
    this.stage.addChild(bg);

    this.coinSprite.texture = this.assets?.heads ?? Sprite.WHITE;
    this.coinSprite.anchor.set(0.5);
    this.coinSprite.width = 180;
    this.coinSprite.height = 180;
    this.coinContainer.addChild(this.coinSprite);

    this.statusText = new Text({
      text: "Pick heads or tails",
      style: new TextStyle({ fill: "#ffffff", fontSize: 20, fontWeight: "600" }),
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(0, 140);
    this.coinContainer.addChild(this.statusText);
  }

  saveState() {
    const state = {
      balance: this.state.balance,
      currentBet: this.state.currentBet,
      chosenSide: this.state.chosenSide,
      currentMultiplier: this.state.currentMultiplier,
      consecutiveWins: this.state.consecutiveWins,
      lastPayout: this.state.lastPayout,
      history: this.state.history,
      autoOptions: this.flipUI?.getAutoOptions?.() ?? this.state.autoOptions,
    };
    localStorage.setItem("flip_game_state_v1", JSON.stringify(state));
  }

  loadSavedState() {
    try {
      const stored = localStorage.getItem("flip_game_state_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(this.state, parsed);
      }
    } catch (err) {
      console.warn("Could not load saved flip state", err);
    }
  }

  async startRound() {
    if (this.runningAnimation) return;
    if (this.state.currentBet <= 0 || this.state.balance < this.state.currentBet) {
      this.statusText.text = "Insufficient balance";
      return;
    }
    this.flipUI.disableInputs();
    this.state.balance -= this.state.currentBet;
    this.flipUI.setBalance(this.state.balance);
    const { outcome, proof } = await this.getResult();
    this.statusText.text = "Flipping...";
    await this.coinFlipAnimation(outcome);
    this.resolveOutcome(outcome);
    this.saveState();
    this.flipUI.enableInputs();
    if (this.state.autoPlay && !this.autoPlayActive) {
      setTimeout(() => this.startRound(), 400);
    }
  }

  resolveOutcome(outcome) {
    const win = outcome === this.state.chosenSide;
    if (win) {
      this.state.consecutiveWins += 1;
      this.state.currentMultiplier = advanceMultiplier(
        this.state.currentMultiplier,
        DEFAULT_GROWTH_FACTOR
      );
      const payout = this.state.currentBet * this.state.currentMultiplier * (1 - HOUSE_EDGE);
      this.state.balance += payout;
      this.state.lastPayout = payout;
      this.statusText.text = `Win! ${outcome}`;
      this.emitParticles(true);
    } else {
      this.state.consecutiveWins = 0;
      this.state.currentMultiplier = resetMultiplier();
      this.state.lastPayout = 0;
      this.statusText.text = `Lost on ${outcome}`;
      this.emitParticles(false);
    }
    this.state.history.push(outcome);
    this.state.history = this.state.history.slice(-HISTORY_LENGTH);

    this.flipUI.setBalance(this.state.balance);
    this.flipUI.setStreak(this.state.consecutiveWins);
    this.flipUI.setMultiplier(this.state.currentMultiplier);
    this.flipUI.setLastPayout(this.state.lastPayout);
    this.flipUI.setNextPayout(this.state.currentBet * this.state.currentMultiplier);
    this.flipUI.setHistory(this.state.history);
  }

  async getResult() {
    if (this.networkRNG) {
      try {
        const result = await this.networkRNG();
        if (result?.outcome === "heads" || result?.outcome === "tails") {
          return { outcome: result.outcome, proof: result };
        }
      } catch (err) {
        console.warn("networkRNG failed, falling back", err);
      }
    }
    const outcome = this.localRandom() < 0.5 ? "heads" : "tails";
    return { outcome, proof: { nonce: this.localNonce } };
  }

  localRandom() {
    this.localNonce += 1;
    return this.prng();
  }

  coinFlipAnimation(outcome) {
    return new Promise((resolve) => {
      const duration = 60;
      let frame = 0;
      const startScale = this.coinSprite.scale.x;
      const endScale = startScale;
      const animate = () => {
        frame += 1;
        const progress = frame / duration;
        const swing = Math.sin(progress * Math.PI);
        this.coinSprite.scale.y = Math.max(0.05, Math.abs(Math.cos(progress * Math.PI)));
        this.coinSprite.rotation = progress * Math.PI * 2;
        if (progress > 0.5 && frame % 4 === 0) {
          this.coinSprite.texture = outcome === "heads" ? this.assets.heads : this.assets.tails;
        }
        if (frame >= duration) {
          this.coinSprite.rotation = 0;
          this.coinSprite.scale.set(endScale);
          this.app.ticker.remove(animate);
          this.runningAnimation = null;
          resolve();
        }
      };
      this.runningAnimation = animate;
      this.app.ticker.add(animate);
    });
  }

  emitParticles(isWin) {
    const burst = new Graphics();
    burst.circle(0, 0, 8).fill(new Color(isWin ? "#2bff9c" : "#ff2b4b"));
    burst.alpha = 0.9;
    this.coinContainer.addChild(burst);
    const duration = 30;
    let frame = 0;
    const animate = () => {
      frame += 1;
      burst.scale.set(1 + frame / 10);
      burst.alpha = Math.max(0, 1 - frame / duration);
      if (frame >= duration) {
        this.app.ticker.remove(animate);
        burst.destroy();
      }
    };
    this.app.ticker.add(animate);
  }

  async autoPlay({ maxRounds = 10, stopOnLoss = false, stopOnMultiplier } = {}) {
    this.autoPlayActive = true;
    for (let i = 0; i < maxRounds; i++) {
      const startingMultiplier = this.state.currentMultiplier;
      await this.startRound();
      if (!this.state.autoPlay) break;
      if (stopOnLoss && this.state.lastPayout === 0) break;
      if (stopOnMultiplier && this.state.currentMultiplier >= stopOnMultiplier) break;
      if (this.state.currentMultiplier !== startingMultiplier && this.state.lastPayout === 0) {
        break;
      }
    }
    this.state.autoPlay = false;
    this.autoPlayActive = false;
  }
}

export function verifyResult(serverSeed, clientSeed, nonce) {
  const combinedSeed =
    String(serverSeed ?? "") + String(clientSeed ?? "") + String(nonce ?? "");
  let hash = 0;
  for (let i = 0; i < combinedSeed.length; i++) {
    hash = (hash << 5) - hash + combinedSeed.charCodeAt(i);
    hash |= 0;
  }
  const prng = mulberry32(Math.abs(hash));
  return prng() < 0.5 ? "heads" : "tails";
}

export async function createFlipAppForMount(mount, options = {}) {
  const root = typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("mount missing");
  const app = new Application();
  const rect = root.getBoundingClientRect();
  await app.init({
    background: options.background ?? 0x0b1722,
    width: Math.max(320, rect.width || 480),
    height: Math.max(320, rect.height || 480),
    antialias: true,
    autoDensity: true,
  });
  root.innerHTML = "";
  root.appendChild(app.canvas);
  return app;
}
