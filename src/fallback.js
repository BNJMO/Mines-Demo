// Simple DOM/CSS fallback for Scratch Cards board (no WebGL, no audio)
// Always renders a 3x3 grid and exposes a minimal API compatible with main.js usage

export function createFallbackMinesGame(mountSelector, opts = {}) {
  const root =
    typeof mountSelector === 'string'
      ? document.querySelector(mountSelector)
      : mountSelector;
  if (!root) throw new Error('fallback: mount not found');
  root.innerHTML = '';

  const GRID = opts.grid ?? 3;

  const board = document.createElement('div');
  board.className = 'fallback-board';
  board.style.setProperty('--grid', GRID);
  root.appendChild(board);

  const tiles = [];
  const currentAssignments = new Map();

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = document.createElement('div');
      t.className = 'fallback-tile';
      t.dataset.row = String(r);
      t.dataset.col = String(c);
      board.appendChild(t);
      tiles.push(t);
    }
  }

  function reset() {
    tiles.forEach((t) => {
      t.classList.remove('revealed');
      t.textContent = '';
      delete t.dataset.cardType;
    });
  }

  function getKey(row, col) {
    return `${row},${col}`;
  }

  function revealTile(row, col, contentKey) {
    const tile = tiles.find(
      (t) => Number(t.dataset.row) === row && Number(t.dataset.col) === col
    );
    if (!tile || tile.classList.contains('revealed')) return;
    tile.classList.add('revealed');
    const key = contentKey ?? '❓';
    tile.dataset.cardType = key;
    tile.textContent = key;
  }

  function setRoundAssignments(assignments = []) {
    currentAssignments.clear();
    assignments.forEach((entry) => {
      if (
        typeof entry?.row === 'number' &&
        typeof entry?.col === 'number'
      ) {
        currentAssignments.set(
          getKey(entry.row, entry.col),
          entry.contentKey ?? entry.result ?? null
        );
      }
    });
    reset();
  }

  function revealSelectedCard() {
    // Fallback reveals immediately on click; selection is handled inline.
  }

  function revealAutoSelections(results = []) {
    results.forEach((entry) => {
      if (typeof entry?.row === 'number' && typeof entry?.col === 'number') {
        revealTile(
          entry.row,
          entry.col,
          entry.contentKey ?? entry.result ?? null
        );
      }
    });
  }

  function selectRandomTile() {
    const hidden = tiles.filter((t) => !t.classList.contains('revealed'));
    if (!hidden.length) return null;
    const tile = hidden[Math.floor(Math.random() * hidden.length)];
    const row = Number(tile.dataset.row);
    const col = Number(tile.dataset.col);
    const assigned = currentAssignments.get(getKey(row, col));
    revealTile(row, col, assigned);
    return { row, col };
  }

  function revealRemainingTiles() {
    tiles.forEach((tile) => {
      const row = Number(tile.dataset.row);
      const col = Number(tile.dataset.col);
      const assigned = currentAssignments.get(getKey(row, col));
      revealTile(row, col, assigned);
    });
  }

  function setMines() {}
  function showWinPopup() {}

  board.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains('fallback-tile')) return;
    if (t.classList.contains('revealed')) return;

    const row = Number(t.dataset.row);
    const col = Number(t.dataset.col);
    const assigned = currentAssignments.get(getKey(row, col));
    revealTile(row, col, assigned ?? `T${Math.floor(Math.random() * 9) + 1}`);
  });

  return {
    reset,
    setMines,
    showWinPopup,
    setRoundAssignments,
    revealSelectedCard,
    revealAutoSelections,
    selectRandomTile,
    getAutoSelections: () => [],
    clearAutoSelections: () => {},
    applyAutoSelections: () => 0,
    revealRemainingTiles,
    getAutoResetDelay: () => opts.autoResetDelayMs ?? 1500,
    setAnimationsEnabled: () => {},
  };
}
