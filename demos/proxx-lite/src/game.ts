/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { computed, reactive } from 'vue'

export interface Cell {
  blackHole: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost'

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: Record<Difficulty, { rows: number; cols: number; blackHoles: number }> = {
  easy: { rows: 8, cols: 8, blackHoles: 10 },
  medium: { rows: 16, cols: 16, blackHoles: 40 },
  hard: { rows: 24, cols: 24, blackHoles: 99 },
}

export interface MoveResult {
  ok: boolean
  message: string
}

const state = reactive({
  rows: 8,
  cols: 8,
  blackHoles: 10,
  board: [] as Cell[][],
  status: 'ready' as GameStatus,
  startedAt: 0,
  endedAt: 0,
  explodedAt: null as { row: number; col: number } | null,
})

function emptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ blackHole: false, revealed: false, flagged: false, adjacent: 0 })),
  )
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

function neighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      if (inBounds(r + dr, c + dc)) out.push([r + dr, c + dc])
    }
  return out
}

/** Places black holes after the first click so the first reveal (and its neighbors when possible) is always safe. */
function placeBlackHoles(safeR: number, safeC: number) {
  const total = state.rows * state.cols
  const excluded = new Set<number>([safeR * state.cols + safeC])
  if (total - state.blackHoles >= 9) for (const [r, c] of neighbors(safeR, safeC)) excluded.add(r * state.cols + c)

  const candidates: number[] = []
  for (let i = 0; i < total; i++) if (!excluded.has(i)) candidates.push(i)
  // Fisher–Yates partial shuffle
  for (let i = 0; i < state.blackHoles; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    const idx = candidates[i]
    state.board[Math.floor(idx / state.cols)][idx % state.cols].blackHole = true
  }
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      state.board[r][c].adjacent = neighbors(r, c).filter(([nr, nc]) => state.board[nr][nc].blackHole).length
}

function checkWin() {
  for (const row of state.board) for (const cell of row) if (!cell.blackHole && !cell.revealed) return
  state.status = 'won'
  state.endedAt = Date.now()
  // Auto-flag all black holes on win.
  for (const row of state.board) for (const cell of row) if (cell.blackHole) cell.flagged = true
}

function lose(r: number, c: number) {
  state.status = 'lost'
  state.endedAt = Date.now()
  state.explodedAt = { row: r, col: c }
  for (const row of state.board) for (const cell of row) if (cell.blackHole) cell.revealed = true
}

function validate(r: number, c: number): MoveResult | null {
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBounds(r, c))
    return { ok: false, message: `Cell (${r}, ${c}) is out of bounds. Board is ${state.rows} rows x ${state.cols} cols (0-indexed).` }
  if (state.status === 'won' || state.status === 'lost')
    return { ok: false, message: `Game is over (${state.status}). Start a new game first.` }
  return null
}

export function newGame(rows: number, cols: number, blackHoles: number): MoveResult {
  rows = Math.max(2, Math.min(30, Math.floor(rows)))
  cols = Math.max(2, Math.min(40, Math.floor(cols)))
  blackHoles = Math.max(1, Math.min(rows * cols - 1, Math.floor(blackHoles)))
  Object.assign(state, {
    rows,
    cols,
    blackHoles,
    board: emptyBoard(rows, cols),
    status: 'ready',
    startedAt: 0,
    endedAt: 0,
    explodedAt: null,
  })
  return { ok: true, message: `New game: ${rows}x${cols} with ${blackHoles} black holes.` }
}

export function reveal(r: number, c: number): MoveResult {
  const err = validate(r, c)
  if (err) return err
  const cell = state.board[r][c]
  if (cell.flagged) return { ok: false, message: `Cell (${r}, ${c}) is flagged. Unflag it before revealing.` }
  if (cell.revealed) return { ok: false, message: `Cell (${r}, ${c}) is already revealed.` }

  if (state.status === 'ready') {
    placeBlackHoles(r, c)
    state.status = 'playing'
    state.startedAt = Date.now()
  }

  if (cell.blackHole) {
    lose(r, c)
    return { ok: true, message: `Cell (${r}, ${c}) was a black hole. Game over.` }
  }

  // Flood fill from zero cells.
  const stack: [number, number][] = [[r, c]]
  let opened = 0
  while (stack.length) {
    const [cr, cc] = stack.pop()!
    const cur = state.board[cr][cc]
    if (cur.revealed || cur.flagged) continue
    cur.revealed = true
    opened++
    if (cur.adjacent === 0) for (const n of neighbors(cr, cc)) stack.push(n)
  }
  checkWin()
  return {
    ok: true,
    message: `Revealed ${opened} cell(s) starting at (${r}, ${c}).${state.status === 'won' ? ' You won!' : ''}`,
  }
}

export function toggleFlag(r: number, c: number, flagged?: boolean): MoveResult {
  const err = validate(r, c)
  if (err) return err
  const cell = state.board[r][c]
  if (cell.revealed) return { ok: false, message: `Cell (${r}, ${c}) is already revealed and cannot be flagged.` }
  cell.flagged = flagged ?? !cell.flagged
  return { ok: true, message: `Cell (${r}, ${c}) is now ${cell.flagged ? 'flagged' : 'unflagged'}.` }
}

/** Reveal all unflagged neighbors of a revealed number when the flag count matches. */
export function chord(r: number, c: number): MoveResult {
  const err = validate(r, c)
  if (err) return err
  const cell = state.board[r][c]
  if (!cell.revealed || cell.adjacent === 0)
    return { ok: false, message: `Cell (${r}, ${c}) must be a revealed number to chord.` }
  const ns = neighbors(r, c)
  const flags = ns.filter(([nr, nc]) => state.board[nr][nc].flagged).length
  if (flags !== cell.adjacent)
    return { ok: false, message: `Cell (${r}, ${c}) shows ${cell.adjacent} but has ${flags} adjacent flag(s).` }
  const messages: string[] = []
  for (const [nr, nc] of ns) {
    const n = state.board[nr][nc]
    if (!n.revealed && !n.flagged && state.status === 'playing') messages.push(reveal(nr, nc).message)
  }
  return { ok: true, message: messages.length ? messages.join(' ') : 'Nothing to reveal.' }
}

const flagsPlaced = computed(() => state.board.flat().filter((c) => c.flagged).length)

export function useGame() {
  return { state, flagsPlaced, newGame, reveal, toggleFlag, chord }
}

newGame(8, 8, 10)
