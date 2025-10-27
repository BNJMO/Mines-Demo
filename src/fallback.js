// Simple DOM/CSS fallback for the scratch card board (no WebGL, no audio)
// Always renders a 5x5 grid and exposes a minimal API compatible with main.js usage

export function createFallbackScratchGame(mountSelector, opts = {}) {
  const root = typeof mountSelector === 'string' ? document.querySelector(mountSelector) : mountSelector;
  if (!root) throw new Error('fallback: mount not found');
  root.innerHTML = '';

  const GRID = opts.grid ?? 5;
  let cardTypeCount = Math.max(1, Math.min(opts.cardTypes ?? 5, GRID * GRID - 1));

  const board = document.createElement('div');
  board.className = 'fallback-board';
  board.style.setProperty('--grid', GRID);
  root.appendChild(board);

  const tiles = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = document.createElement('div');
      t.className = 'fallback-tile';
      t.dataset.row = r;
      t.dataset.col = c;
      board.appendChild(t);
      tiles.push(t);
    }
  }

  function reset() {
    tiles.forEach((t) => {
      t.classList.remove('revealed', 'loss', 'win');
      t.textContent = '';
    });
  }

  function setCardTypeCount(n) {
    cardTypeCount = Math.max(1, Math.min(n | 0, GRID * GRID - 1));
    reset();
  }

  // Minimal API to satisfy main.js controls
  function setSelectedCardIsWin() {}
  function setSelectedCardIsLoss() {}
  function showWinPopup() {}

  // Basic interactivity: tap reveals random content with a simple rule
  board.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains('fallback-tile')) return;
    if (t.classList.contains('revealed')) return;

    // Very simple randomization similar to main.js example
    const isLoss = Math.random() < Math.min(0.85, cardTypeCount / (GRID * GRID));
    t.classList.add('revealed');
    t.classList.add(isLoss ? 'loss' : 'win');
    t.textContent = isLoss ? '✖️' : '✅';
  });

  // Return API used by main.js bindings
  return {
    reset,
    setCardTypeCount,
    setSelectedCardIsWin,
    setSelectedCardIsLoss,
    showWinPopup,
  };
}

