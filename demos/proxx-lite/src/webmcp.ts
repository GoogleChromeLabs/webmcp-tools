/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebMCP integration: exposes the PROXX Lite game as tools that in-browser AI agents can call.
 * Spec: https://github.com/webmachinelearning/webmcp
 *
 * Tools are registered through VueUse's `useWebMCP`, which feature-detects `document.modelContext`,
 * registers with an AbortSignal, and unregisters automatically when the calling scope is disposed.
 */
import { computed, nextTick, ref } from 'vue'
import { useWebMCP, type ConfigurableDocument } from '@vueuse/core'
import { DIFFICULTIES, type Difficulty, type MoveResult, useGame } from './game'

export const toolLog = ref<{ time: string; tool: string; args: string; result: string }[]>([])

const game = useGame()
const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[]

function snapshot() {
  const { state, flagsPlaced } = game
  return {
    status: state.status,
    rows: state.rows,
    cols: state.cols,
    blackHoles: state.blackHoles,
    flagsPlaced: flagsPlaced.value,
    blackHolesRemaining: state.blackHoles - flagsPlaced.value,
    legend: "'#' hidden, 'F' flagged, '.' empty, '1'-'8' count of adjacent black holes, '*' black hole, 'X' black hole that ended the game. Coordinates are (row, col), 0-indexed.",
    board: game.boardAsText(),
  }
}

/** Structured, non-throwing error so the agent receives the message and can retry. */
const invalid = (message: string) => ({ ok: false, message })

const isInt = (v: unknown): v is number => Number.isInteger(v)

function validateCell({ row, col }: { row?: unknown; col?: unknown }) {
  if (!isInt(row) || !isInt(col)) return invalid('Pass integer "row" and "col" coordinates.')
  return null
}

interface ToolDef<Args> {
  name: string
  description: string
  inputSchema?: object
  run: (input: Args) => MoveResult
  annotations?: { readOnlyHint?: boolean }
}

const cellSchema = {
  type: 'object',
  properties: {
    row: { type: 'integer', minimum: 0, description: 'Zero-based row index.' },
    col: { type: 'integer', minimum: 0, description: 'Zero-based column index.' },
  },
  required: ['row', 'col'],
}

const tools: ToolDef<any>[] = [
  {
    name: 'proxx_get_state',
    description:
      'Returns the current game status, board dimensions, black hole and flag counts, and a text grid of the board. Use it to inspect the board before deciding on a move.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({ ok: true, message: 'Current state returned.' }),
    annotations: { readOnlyHint: true },
  },
  {
    name: 'proxx_new_game',
    description:
      'Starts a new PROXX Lite game, discarding the current one. Use a preset difficulty, or pass custom dimensions for a different board size.',
    inputSchema: {
      type: 'object',
      properties: {
        difficulty: {
          type: 'string',
          enum: DIFFICULTY_NAMES,
          default: 'easy',
          description:
            'Preset board: easy is 8×8 with 10 black holes, medium 16×16 with 40, hard 24×24 with 99. Ignored for any custom dimension that is set.',
        },
        rows: { type: 'integer', minimum: 2, maximum: 30, description: 'Custom number of rows.' },
        cols: { type: 'integer', minimum: 2, maximum: 40, description: 'Custom number of columns.' },
        blackHoles: { type: 'integer', minimum: 1, description: 'Custom number of black holes; must be fewer than rows × cols.' },
      },
    },
    run: ({ difficulty = 'easy', rows, cols, blackHoles }: { difficulty?: Difficulty; rows?: number; cols?: number; blackHoles?: number }) => {
      // The browser does not validate against inputSchema or apply defaults, so do it here.
      if (!DIFFICULTY_NAMES.includes(difficulty))
        return { ...invalid(`Unknown difficulty "${difficulty}".`), difficulties: DIFFICULTY_NAMES }
      for (const [key, value] of Object.entries({ rows, cols, blackHoles }))
        if (value !== undefined && !isInt(value)) return invalid(`"${key}" must be an integer.`)
      const preset = DIFFICULTIES[difficulty]
      const r = rows ?? preset.rows
      const c = cols ?? preset.cols
      const b = blackHoles ?? preset.blackHoles
      if (r < 2 || r > 30 || c < 2 || c > 40) return invalid('Board must be 2–30 rows and 2–40 columns.')
      if (b < 1 || b >= r * c) return invalid(`Black holes must be between 1 and ${r * c - 1} for a ${r}×${c} board.`)
      return game.newGame(r, c, b)
    },
  },
  {
    name: 'proxx_reveal_cell',
    description:
      'Reveals (left-clicks) a hidden cell. The first reveal of a game is always safe; revealing a black hole ends the game.',
    inputSchema: cellSchema,
    run: (input: { row: number; col: number }) => validateCell(input) ?? game.reveal(input.row, input.col),
  },
  {
    name: 'proxx_flag_cell',
    description: 'Places or removes a flag on a hidden cell to mark a suspected black hole.',
    inputSchema: {
      ...cellSchema,
      properties: {
        ...cellSchema.properties,
        flagged: { type: 'boolean', description: 'true to flag, false to unflag. Omit to toggle the current flag.' },
      },
    },
    run: (input: { row: number; col: number; flagged?: boolean }) => {
      if (input.flagged !== undefined && typeof input.flagged !== 'boolean') return invalid('"flagged" must be a boolean.')
      return validateCell(input) ?? game.toggleFlag(input.row, input.col, input.flagged)
    },
  },
  {
    name: 'proxx_chord_cell',
    description:
      'Chords a revealed number cell: when its adjacent flag count equals its number, reveals all other adjacent hidden cells. Use it to clear several safe cells in one move.',
    inputSchema: cellSchema,
    run: (input: { row: number; col: number }) => validateCell(input) ?? game.chord(input.row, input.col),
  },
]

/**
 * Registers all PROXX Lite tools for the lifetime of the calling component (or effect scope).
 * Returns whether WebMCP is supported and all tools are registered.
 */
export function useProxxTools(options: ConfigurableDocument = {}) {
  const registrations = tools.map((def) =>
    useWebMCP({
      ...options,
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: any = {}) => {
        const result = def.run(input)
        toolLog.value.unshift({
          time: new Date().toLocaleTimeString(),
          tool: def.name,
          args: JSON.stringify(input),
          result: result.message,
        })
        toolLog.value.splice(20)
        // Return only after the UI reflects the move, so agent and user see the same state.
        await nextTick()
        return { result, state: snapshot() }
      },
      annotations: def.annotations,
    }),
  )

  const isSupported = computed(() => registrations.every((r) => r.isSupported.value))
  const isRegistered = computed(() => registrations.every((r) => r.isRegistered.value))
  return { isSupported, isRegistered }
}
