import type { Direction, Movement, PieceId, State } from "./types.js";

const DIRECTIONS = ["N", "E", "S", "O"] as const satisfies readonly Direction[];
const BOARD_SIZE = 10;

function wrapIndex(index: number): number {
  return ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
}

function advance(row: number, col: number, direction: Direction, steps: number): { row: number; col: number } {
  let currentRow = row;
  let currentCol = col;

  for (let step = 0; step < steps; step += 1) {
    switch (direction) {
      case "N": currentRow = wrapIndex(currentRow - 1); break;
      case "S": currentRow = wrapIndex(currentRow + 1); break;
      case "E": currentCol = wrapIndex(currentCol + 1); break;
      case "O": currentCol = wrapIndex(currentCol - 1); break;
    }
  }

  return { row: currentRow, col: currentCol };
}

function isOwnPiece(cell: string, player: State["jugador"]): boolean {
  return cell !== "" && cell !== "N" && cell.startsWith(player);
}

function isNeutral(cell: string): boolean {
  return cell === "N";
}

function isLegalPath(state: State, row: number, col: number, direction: Direction, steps: number): boolean {
  let currentRow = row;
  let currentCol = col;

  for (let step = 0; step < steps; step += 1) {
    const next = advance(currentRow, currentCol, direction, 1);
    currentRow = next.row;
    currentCol = next.col;

    const cell = state.tablero[currentRow][currentCol];
    if (isOwnPiece(cell, state.jugador)) return false;
    if (cell !== "" && cell !== "N") return false;
  }

  return true;
}

function scoreMove(state: State, row: number, col: number, direction: Direction, steps: number): number {
  const destination = advance(row, col, direction, steps);
  const cell = state.tablero[destination.row][destination.col];

  let score = 0;

  if (isNeutral(cell)) score += 10000;
  else if (cell === "") score += 200;

  const directionPriority: Record<Direction, number> = { N: 40, E: 30, S: 20, O: 10 };
  score += directionPriority[direction];

  const centerDistance = Math.abs(destination.row - 4.5) + Math.abs(destination.col - 4.5);
  score += (10 - centerDistance) * 15;

  const neighbors = [
    { row: destination.row - 1, col: destination.col },
    { row: destination.row + 1, col: destination.col },
    { row: destination.row, col: destination.col - 1 },
    { row: destination.row, col: destination.col + 1 },
  ].filter(pos => pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE)
    .filter(pos => isNeutral(state.tablero[pos.row][pos.col])).length;
  score += neighbors * 80;

  return score;
}

function chooseDirection(state: State, row: number, col: number): Direction | null {
  let bestDirection: Direction | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const direction of DIRECTIONS) {
    let moveScore = Number.NEGATIVE_INFINITY;

    for (let steps = 1; steps <= 3; steps += 1) {
      if (!isLegalPath(state, row, col, direction, steps)) continue;
      const score = scoreMove(state, row, col, direction, steps);
      if (score > moveScore) moveScore = score;
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

export function chooseMove(state: State): Movement {
  const movements: Movement = {};

  for (const [rowIndex, row] of state.tablero.entries()) {
    for (const [colIndex, cell] of row.entries()) {
      if (typeof cell !== "string" || !cell.startsWith(state.jugador)) continue;

      const direction = chooseDirection(state, rowIndex, colIndex);
      if (direction) {
        movements[cell as PieceId] = direction;
      }
    }
  }

  return movements;
}
