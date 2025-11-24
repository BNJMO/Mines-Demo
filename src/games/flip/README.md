# Flip Game

A Pixi.js heads-or-tails experience with manual and auto play, multiplier growth, and a provably-fair hook.

## Running

```bash
npm install
npm run dev
```

Open the app and use the **Flip** section. The control panel on the right is rendered with Pixi as well.

## Controls

- Left/Right arrows: select Heads or Tails.
- Space: trigger a flip.
- UI buttons: adjust bet, toggle autoplay, and start flips.

## Server RNG hook

Pass a `networkRNG` function to `createGame` that returns `{ outcome: 'heads' | 'tails', salt, proof }`. See `getResult` and `verifyResult` in `FlipGame.js` for the validation scaffold.
