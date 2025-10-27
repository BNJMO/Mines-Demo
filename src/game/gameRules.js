export class GameRules {
  constructor({ gridSize, mines }) {
    this.gridSize = gridSize;
    this.mines = Math.max(1, Math.min(mines, gridSize * gridSize - 1));
    this.reset();
  }

  reset() {
    this.revealedSafe = 0;
    this.totalSafe = this.gridSize * this.gridSize - this.mines;
    this.gameOver = false;
    this.waitingForChoice = false;
    this.selectedTile = null;
    this.revealedMap = new Map();
  }

  setMines(count) {
    this.mines = Math.max(1, Math.min(count, this.gridSize * this.gridSize - 1));
    this.reset();
  }

  selectTile(row, col) {
    this.waitingForChoice = true;
    this.selectedTile = { row, col };
  }

  clearSelection() {
    this.waitingForChoice = false;
    this.selectedTile = null;
  }

  revealResult({ row, col, result }) {
    if (this.gameOver) {
      return { face: null, gameOver: true };
    }

    const key = `${row},${col}`;
    if (this.revealedMap.has(key)) {
      return this.revealedMap.get(key);
    }

    const normalized = String(result || "").toLowerCase();
    const isBomb = normalized === "bomb" || normalized === "lost";

    const face = isBomb ? "bomb" : "diamond";
    const outcome = { face, gameOver: false, win: false };

    if (isBomb) {
      this.gameOver = true;
      outcome.gameOver = true;
    } else {
      this.revealedSafe += 1;
      if (this.revealedSafe >= this.totalSafe) {
        this.gameOver = true;
        outcome.gameOver = true;
        outcome.win = true;
      }
    }

    this.revealedMap.set(key, outcome);
    return outcome;
  }

  getState() {
    return {
      grid: this.gridSize,
      mines: this.mines,
      revealedSafe: this.revealedSafe,
      totalSafe: this.totalSafe,
      gameOver: this.gameOver,
      waitingForChoice: this.waitingForChoice,
      selectedTile: this.selectedTile,
    };
  }
}

