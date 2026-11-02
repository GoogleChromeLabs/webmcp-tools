<!--
  Copyright 2026 Google LLC
  SPDX-License-Identifier: Apache-2.0
-->
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { DIFFICULTIES, type Difficulty, type Cell, useGame } from './game'
import { toolLog, useProxxTools } from './webmcp'

const { state, newGame, reveal, toggleFlag, chord } = useGame()

// Tools live as long as this component; useWebMCP unregisters them via AbortSignal on unmount/HMR.
const { isRegistered: webmcpAvailable } = useProxxTools()

const TOOL_NAMES = [
  'proxx_get_state',
  'proxx_new_game',
  'proxx_reveal_cell',
  'proxx_flag_cell',
  'proxx_chord_cell',
]

/* ---------- Screens ---------- */

const screen = ref<'home' | 'game'>('home')
const flagMode = ref(false)

// newGame() always replaces the board, whether the user pressed START or an agent called proxx_new_game.
watch(
  () => state.board,
  () => {
    screen.value = 'game'
    flagMode.value = false
    newRecord.value = false
    Object.assign(form, { rows: state.rows, cols: state.cols, blackHoles: state.blackHoles })
    form.difficulty = matchPreset() ?? 'custom'
  },
)

/* ---------- Home form ---------- */

const form = reactive({ difficulty: 'easy' as Difficulty | 'custom', rows: 8, cols: 8, blackHoles: 10 })
const LIMITS = { rows: [2, 30], cols: [2, 40] } as const
const maxBlackHoles = computed(() => form.rows * form.cols - 1)

function matchPreset(): Difficulty | undefined {
  return (Object.keys(DIFFICULTIES) as Difficulty[]).find((k) => {
    const d = DIFFICULTIES[k]
    return d.rows === form.rows && d.cols === form.cols && d.blackHoles === form.blackHoles
  })
}

function applyPreset() {
  if (form.difficulty !== 'custom') Object.assign(form, DIFFICULTIES[form.difficulty])
}

function clampForm() {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v) || lo))
  form.rows = clamp(form.rows, ...LIMITS.rows)
  form.cols = clamp(form.cols, ...LIMITS.cols)
  form.blackHoles = clamp(form.blackHoles, 1, maxBlackHoles.value)
  form.difficulty = matchPreset() ?? 'custom'
}

function step(key: 'rows' | 'cols' | 'blackHoles', delta: number) {
  form[key] += delta
  clampForm()
}

function start() {
  clampForm()
  newGame(form.rows, form.cols, form.blackHoles)
}

function playAgain() {
  newGame(state.rows, state.cols, state.blackHoles)
}

/* ---------- HUD ---------- */

const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 250)
onUnmounted(() => clearInterval(timer))

const elapsed = computed(() => {
  if (!state.startedAt) return 0
  return Math.floor(((state.endedAt || now.value) - state.startedAt) / 1000)
})

const pad2 = (n: number) => String(n).padStart(2, '0')
const formatTime = (s: number) => {
  s = Math.min(s, 99 * 60 + 59)
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

const safeTotal = computed(() => state.rows * state.cols - state.blackHoles)
const safeLeft = computed(
  () => safeTotal.value - state.board.reduce((n, row) => n + row.filter((c) => c.revealed && !c.blackHole).length, 0),
)
const modeName = computed(() => {
  const d = (Object.keys(DIFFICULTIES) as Difficulty[]).find((k) => {
    const p = DIFFICULTIES[k]
    return p.rows === state.rows && p.cols === state.cols && p.blackHoles === state.blackHoles
  })
  return d ?? 'custom'
})

/* ---------- Best time ---------- */

const best = ref<number | null>(null)
const newRecord = ref(false)
const bestKey = () => `proxx-lite:best:${state.cols}x${state.rows}:${state.blackHoles}`

watch(
  () => state.status,
  (status) => {
    if (status !== 'won') return
    const prev = Number(localStorage.getItem(bestKey())) || Infinity
    newRecord.value = elapsed.value < prev
    if (newRecord.value) localStorage.setItem(bestKey(), String(elapsed.value))
    best.value = Math.min(prev, elapsed.value)
  },
)

/* ---------- Board ---------- */

function onCell(r: number, c: number, cell: Cell) {
  if (state.status === 'won' || state.status === 'lost') return
  if (cell.revealed) chord(r, c)
  else if (flagMode.value) toggleFlag(r, c)
  else if (!cell.flagged) reveal(r, c)
}

function onContextMenu(r: number, c: number, cell: Cell) {
  if (!cell.revealed && state.status !== 'won' && state.status !== 'lost') toggleFlag(r, c)
}

function cellKind(cell: Cell): 'hidden' | 'flagged' | 'cleared' | 'clue' | 'hole' {
  if (cell.revealed && cell.blackHole) return 'hole'
  if (cell.flagged) return 'flagged'
  if (!cell.revealed) return 'hidden'
  return cell.adjacent ? 'clue' : 'cleared'
}

function cellLabel(r: number, c: number, cell: Cell): string {
  const kind = cellKind(cell)
  const what =
    kind === 'clue' ? `${cell.adjacent} adjacent black hole${cell.adjacent > 1 ? 's' : ''}` : kind === 'hole' ? 'black hole' : kind
  return `Row ${r}, column ${c}: ${what}`
}

/* ---------- Dialogs & fullscreen ---------- */

const infoDialog = useTemplateRef<HTMLDialogElement>('infoDialog')
const logDialog = useTemplateRef<HTMLDialogElement>('logDialog')

// Light-dismiss fallback for browsers without <dialog closedby="any"> support.
const supportsClosedBy = 'closedBy' in HTMLDialogElement.prototype
function onDialogClick(event: MouseEvent) {
  const dialog = event.currentTarget as HTMLDialogElement
  if (supportsClosedBy || event.target !== dialog) return
  const rect = dialog.getBoundingClientRect()
  const inside =
    rect.top <= event.clientY && event.clientY <= rect.bottom && rect.left <= event.clientX && event.clientX <= rect.right
  if (!inside) dialog.close()
}

const canFullscreen = document.fullscreenEnabled
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}
</script>

<template>
  <!-- Shared tile artwork, referenced with <use>. -->
  <svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <symbol id="spiral" viewBox="0 0 40 40">
      <g fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.75">
        <rect x="4" y="4" width="32" height="32" rx="2.5" transform="rotate(8 20 20)" />
        <rect x="7.5" y="7.5" width="25" height="25" rx="2" transform="rotate(20 20 20)" />
        <rect x="11" y="11" width="18" height="18" rx="1.5" transform="rotate(32 20 20)" />
        <rect x="14.5" y="14.5" width="11" height="11" rx="1" transform="rotate(44 20 20)" />
      </g>
      <circle cx="20" cy="20" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5" />
    </symbol>
    <symbol id="spiral-flag" viewBox="0 0 40 40">
      <use href="#spiral" />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" />
    </symbol>
  </svg>

  <div class="app" :class="{ lost: state.status === 'lost' }">
    <!-- ================= HOME ================= -->
    <main v-if="screen === 'home'" class="screen home">
      <h1 class="logo" aria-label="PROXX Lite">
        <span class="logo-letters" aria-hidden="true">
          <span v-for="(ch, i) in 'PROXX'" :key="i" :style="{ '--i': i }">{{ ch }}</span>
        </span>
        <span class="logo-lite" aria-hidden="true">Lite</span>
      </h1>

      <form class="settings" @submit.prevent="start">
        <label class="field">
          <span class="field-label">Difficulty</span>
          <select v-model="form.difficulty" class="field-value" @change="applyPreset">
            <option v-for="(_, key) in DIFFICULTIES" :key="key" :value="key">{{ key }}</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <div class="row">
          <div class="field">
            <label class="field-label" for="width">Width</label>
            <input id="width" v-model.number="form.cols" class="field-value" type="number" inputmode="numeric"
              :min="LIMITS.cols[0]" :max="LIMITS.cols[1]" @change="clampForm" />
            <span class="stepper">
              <button type="button" aria-label="Increase width" @click="step('cols', 1)">▲</button>
              <button type="button" aria-label="Decrease width" @click="step('cols', -1)">▼</button>
            </span>
          </div>
          <div class="field">
            <label class="field-label" for="height">Height</label>
            <input id="height" v-model.number="form.rows" class="field-value" type="number" inputmode="numeric"
              :min="LIMITS.rows[0]" :max="LIMITS.rows[1]" @change="clampForm" />
            <span class="stepper">
              <button type="button" aria-label="Increase height" @click="step('rows', 1)">▲</button>
              <button type="button" aria-label="Decrease height" @click="step('rows', -1)">▼</button>
            </span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="holes">Black holes</label>
          <input id="holes" v-model.number="form.blackHoles" class="field-value" type="number" inputmode="numeric"
            min="1" :max="maxBlackHoles" @change="clampForm" />
          <span class="stepper">
            <button type="button" aria-label="Increase black holes" @click="step('blackHoles', 1)">▲</button>
            <button type="button" aria-label="Decrease black holes" @click="step('blackHoles', -1)">▼</button>
          </span>
        </div>

        <button class="btn primary" type="submit">Start</button>
      </form>

      <footer class="bar bottom">
        <button class="icon-btn" aria-label="How to play" @click="infoDialog?.showModal()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7v.01" /></svg>
        </button>
        <button class="webmcp" :class="{ on: webmcpAvailable }" @click="logDialog?.showModal()">
          WebMCP {{ webmcpAvailable ? 'active' : 'unavailable' }}
        </button>
        <button v-if="canFullscreen" class="icon-btn" aria-label="Toggle fullscreen" @click="toggleFullscreen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
        </button>
        <span v-else />
      </footer>
    </main>

    <!-- ================= GAME ================= -->
    <main v-else class="screen game">
      <header class="bar top">
        <span class="stat" title="Safe tiles left">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="12" r="2" /></svg>
          <span><span class="visually-hidden">Safe tiles left: </span>{{ pad2(safeLeft) }}/{{ pad2(safeTotal) }}</span>
        </span>
        <span class="title">PROXX Lite</span>
        <span class="stat" title="Time">
          <span><span class="visually-hidden">Time: </span>{{ formatTime(elapsed) }}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="8" /><path d="M9 2.5h6M12 9.5v4M18.5 6l1.5-1.5" /></svg>
        </span>
      </header>

      <!-- Win -->
      <section v-if="state.status === 'won'" class="end" aria-live="polite">
        <div class="end-tile" aria-hidden="true">
          <svg viewBox="0 0 40 40"><use href="#spiral" /></svg>
          <span class="end-dot" />
        </div>
        <p class="end-title">You win!<br />({{ modeName }} mode)</p>
        <div class="scores">
          <div>
            <span class="score-label">Score</span>
            <span class="score-value">{{ formatTime(elapsed) }}</span>
          </div>
          <svg class="score-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="8" /><path d="M9 2.5h6M12 9.5v4M18.5 6l1.5-1.5" /></svg>
          <div>
            <span class="score-label">{{ newRecord ? 'New best!' : 'Best' }}</span>
            <span class="score-value">{{ best === null ? '--:--' : formatTime(best) }}</span>
          </div>
        </div>
        <button class="btn primary" @click="playAgain">Play again</button>
        <button class="btn outline" @click="screen = 'home'">Main menu</button>
      </section>

      <!-- Board -->
      <div v-else class="board-wrap">
        <div
          class="board"
          role="grid"
          aria-label="PROXX Lite board"
          :style="{ '--cols': state.cols, '--rows': state.rows }"
        >
          <div v-for="(row, r) in state.board" :key="r" role="row" class="board-row">
            <button
              v-for="(cell, c) in row"
              :key="`${r}-${c}`"
              role="gridcell"
              class="cell"
              :class="[
                cellKind(cell),
                { exploded: state.explodedAt?.row === r && state.explodedAt?.col === c },
              ]"
              :style="{ '--i': r + c, '--t': state.rows > 1 ? r / (state.rows - 1) : 0 }"
              :aria-label="cellLabel(r, c, cell)"
              @click="onCell(r, c, cell)"
              @contextmenu.prevent="onContextMenu(r, c, cell)"
            >
              <svg v-if="cellKind(cell) === 'hidden'" class="spiral" viewBox="0 0 40 40" aria-hidden="true"><use href="#spiral" /></svg>
              <svg v-else-if="cellKind(cell) === 'flagged'" class="spiral" viewBox="0 0 40 40" aria-hidden="true"><use href="#spiral-flag" /></svg>
              <span v-else-if="cellKind(cell) === 'clue'" class="clue-num" aria-hidden="true">{{ cell.adjacent }}</span>
            </button>
          </div>
        </div>

        <div v-if="state.status === 'lost'" class="lost-panel" aria-live="polite">
          <p class="end-title">Game over</p>
          <button class="btn primary" @click="playAgain">Try again</button>
          <button class="btn outline" @click="screen = 'home'">Main menu</button>
        </div>
      </div>

      <p class="ticker" aria-live="polite">
        <template v-if="toolLog[0]">
          <span class="ticker-tag">Agent</span>
          <code>{{ toolLog[0].tool }}</code> → {{ toolLog[0].result }}
        </template>
      </p>

      <footer class="bar bottom">
        <button class="icon-btn" aria-label="Back to main menu" @click="screen = 'home'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4M10 6l-6 6 6 6" /></svg>
        </button>
        <div class="mode" :class="{ hidden: state.status === 'won' }">
          <button class="mode-label" :aria-pressed="!flagMode" @click="flagMode = false">Clear</button>
          <button
            class="switch"
            role="switch"
            :aria-checked="flagMode"
            aria-label="Flag mode"
            @click="flagMode = !flagMode"
          />
          <button class="mode-label" :aria-pressed="flagMode" @click="flagMode = true">Flag</button>
        </div>
        <div class="bar-end">
          <button class="icon-btn" :class="{ on: webmcpAvailable }" aria-label="Agent tool calls" @click="logDialog?.showModal()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
          </button>
          <button v-if="canFullscreen" class="icon-btn" aria-label="Toggle fullscreen" @click="toggleFullscreen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
          </button>
        </div>
      </footer>
    </main>

    <!-- ================= HOW TO PLAY ================= -->
    <dialog ref="infoDialog" class="sheet" closedby="any" aria-labelledby="help-title" @click="onDialogClick">
      <button class="close" aria-label="Close" @click="infoDialog?.close()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <h2 id="help-title">How to play</h2>
      <div class="legend">
        <span class="legend-item"><span class="cell hidden demo"><svg class="spiral" viewBox="0 0 40 40"><use href="#spiral" /></svg></span>Unrevealed</span>
        <span class="legend-item"><span class="cell hole demo" />Black hole</span>
      </div>
      <p>
        An unrevealed tile might have a black hole behind it, it might not. The idea is to clear all the tiles that
        <strong>don't</strong> have black holes behind them.
      </p>
      <div class="legend">
        <span class="legend-item"><span class="cell cleared demo" />Cleared</span>
        <span class="legend-item"><span class="cell clue demo" style="--t: 0"><span class="clue-num">1</span></span>Clue</span>
      </div>
      <p>
        If you avoid a black hole, the number tells you how many of the 8 surrounding tiles have a black hole behind
        them. Switch to <strong>Flag</strong> mode (or right-click) to mark the tiles you suspect, then tap a number to
        clear the rest of its neighbors.
      </p>
      <div class="legend">
        <span class="legend-item"><span class="cell flagged demo" style="--t: 1"><svg class="spiral" viewBox="0 0 40 40"><use href="#spiral-flag" /></svg></span>Flagged</span>
      </div>

      <h2>Play with an agent</h2>
      <p>
        This demo exposes the game through <strong>WebMCP</strong>, so an in-browser AI agent can play it with these
        tools:
      </p>
      <ul class="tools">
        <li v-for="name in TOOL_NAMES" :key="name"><code>{{ name }}</code></li>
      </ul>

      <h2>About</h2>
      <p class="credit">
        PROXX Lite is a simplified demo inspired by
        <a href="https://github.com/GoogleChromeLabs/proxx" target="_blank" rel="noopener">PROXX</a> by Google Chrome
        Labs. It is not the original game.
      </p>
    </dialog>

    <!-- ================= AGENT TOOL LOG ================= -->
    <dialog ref="logDialog" class="sheet" closedby="any" aria-labelledby="log-title" @click="onDialogClick">
      <button class="close" aria-label="Close" @click="logDialog?.close()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <h2 id="log-title">Agent tool calls</h2>
      <p class="webmcp" :class="{ on: webmcpAvailable }">WebMCP {{ webmcpAvailable ? 'active' : 'unavailable' }}</p>
      <p v-if="!toolLog.length" class="muted">No WebMCP tool calls yet. Ask your browser agent to play!</p>
      <ul class="log">
        <li v-for="(entry, i) in toolLog" :key="i">
          <span class="muted">{{ entry.time }}</span>
          <code>{{ entry.tool }}</code>
          <code class="muted">{{ entry.args }}</code>
          <span>→ {{ entry.result }}</span>
        </li>
      </ul>
    </dialog>
  </div>
</template>

<style>
@property --bg-a {
  syntax: '<color>';
  inherits: true;
  initial-value: #3b36c4;
}
@property --bg-b {
  syntax: '<color>';
  inherits: true;
  initial-value: #0c0d3f;
}

:root {
  --cyan: #44dde6;
  --pink: #ff2d78;
  --line: rgb(255 255 255 / 0.6);
  font-family: 'Space Mono', ui-monospace, monospace;
  color: #fff;
  background: #0c0d3f;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.muted { color: rgb(255 255 255 / 0.6); }

/* ---------- Animated space background ---------- */
.app {
  --bg-a: #3b36c4;
  --bg-b: #0c0d3f;
  position: relative;
  min-height: 100dvh;
  isolation: isolate;
  overflow: hidden;
  transition: --bg-a 1.2s, --bg-b 1.2s;
}
.app.lost { --bg-a: #8c1b55; --bg-b: #2a0414; }
.app::before {
  content: '';
  position: fixed;
  inset: -30%;
  z-index: -1;
  background:
    radial-gradient(40% 35% at 70% 10%, var(--bg-a), transparent 70%),
    radial-gradient(35% 30% at 25% 55%, var(--bg-a), transparent 70%),
    radial-gradient(30% 25% at 80% 85%, var(--bg-a), transparent 70%),
    var(--bg-b);
  filter: blur(30px);
  animation: drift 40s ease-in-out infinite alternate;
}
@keyframes drift {
  to { transform: rotate(25deg) scale(1.15) translate(4%, -3%); }
}

.screen {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: min(100%, 760px);
  margin-inline: auto;
  padding: 0 24px;
}
.game { width: 100%; height: 100dvh; padding: 0; }
.game > .bar,
.game > .ticker { width: min(100% - 48px, 712px); margin-inline: auto; }

/* ---------- Top / bottom bars ---------- */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-inline: 24px;
  padding-block: 18px;
}
.home .bar { margin-inline: 0; }
.bar.top { border-bottom: 1px solid var(--line); font-size: clamp(14px, 4vw, 18px); }
.bar.bottom { border-top: 1px solid var(--line); margin-top: auto; }
.bar svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.stat { display: flex; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; min-width: 9ch; }
.stat:last-child { justify-content: end; }
.title { letter-spacing: 0.05em; }
.bar-end { display: flex; gap: 4px; }
.icon-btn {
  display: grid; place-items: center;
  width: 44px; height: 44px; padding: 0;
  border: 0; border-radius: 50%; background: none;
}
.icon-btn:hover { background: rgb(255 255 255 / 0.1); }
.icon-btn.on { color: var(--cyan); }

.webmcp {
  margin: 0;
  padding: 4px 12px;
  border: 1px solid rgb(255 255 255 / 0.3);
  border-radius: 999px;
  background: none;
  font-size: 12px;
  color: rgb(255 255 255 / 0.6);
  width: fit-content;
}
.webmcp.on { border-color: var(--cyan); color: var(--cyan); }

/* ---------- Buttons ---------- */
.btn {
  display: block;
  width: 100%;
  padding: 18px;
  border: 3px solid #fff;
  border-radius: 10px;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 700;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  transition: transform 0.15s, box-shadow 0.15s;
}
.btn:hover { box-shadow: 0 0 24px rgb(255 255 255 / 0.35); }
.btn:active { transform: scale(0.98); }
.btn.primary { background: #fff; color: #1d1b6b; }
.app.lost .btn.primary { color: #5c0e33; }
.btn.outline { background: transparent; color: #fff; }

/* ---------- Home ---------- */
.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin: clamp(40px, 10vh, 110px) 0 clamp(40px, 8vh, 100px);
  font-weight: 400;
}
.logo-letters { display: flex; justify-content: space-between; gap: 8px; width: 100%; }
.logo-lite {
  font-size: clamp(16px, 4.5vw, 24px);
  letter-spacing: 0.6em;
  margin-right: -0.6em;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgb(255 255 255 / 0.6);
}
.logo-letters span {
  display: grid;
  place-items: center;
  width: clamp(48px, 15vw, 104px);
  aspect-ratio: 1;
  border: clamp(3px, 0.8vw, 5px) solid #fff;
  border-radius: 50%;
  font-size: clamp(22px, 7vw, 48px);
  font-weight: 400;
  box-shadow: 0 0 18px rgb(255 255 255 / 0.55), inset 0 0 12px rgb(255 255 255 / 0.25);
  animation: glow 3s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -0.6s);
}
@keyframes glow {
  to { box-shadow: 0 0 32px rgb(255 255 255 / 0.8), inset 0 0 16px rgb(255 255 255 / 0.35); }
}

.settings { display: flex; flex-direction: column; gap: 24px; margin-bottom: 48px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.field {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  padding: 14px 24px 12px;
  background: linear-gradient(110deg, rgb(4 4 30 / 0.75), rgb(4 4 30 / 0.35));
  border-bottom: 1px solid #fff;
  border-radius: 8px 8px 0 0;
}
.field:focus-within { border-bottom-color: var(--cyan); box-shadow: inset 0 -1px 0 var(--cyan); }
.field-label { grid-column: 1; font-size: 16px; color: rgb(255 255 255 / 0.75); }
.field-value {
  grid-column: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #fff;
  font: inherit;
  font-size: clamp(20px, 5.5vw, 26px);
  text-transform: capitalize;
  appearance: none;
  -moz-appearance: textfield;
}
.field-value:focus-visible { outline: none; }
.field-value::-webkit-inner-spin-button,
.field-value::-webkit-outer-spin-button { appearance: none; margin: 0; }
select.field-value { grid-column: 1 / -1; padding-right: 32px; cursor: pointer; }
select.field-value option { background: #0c0d3f; }
label.field::after {
  content: '';
  position: absolute;
  right: 24px;
  top: 50%;
  border: 9px solid transparent;
  border-top: 9px solid #fff;
  border-bottom: 0;
  pointer-events: none;
}
.stepper { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; }
.stepper button { padding: 0 2px; border: 0; background: none; font-size: 18px; line-height: 1.3; }
.stepper button:hover { color: var(--cyan); }

/* ---------- Board ---------- */
.board-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: safe center;
  justify-content: safe center;
  gap: 24px;
  padding: 16px 8px;
}
.board {
  /* Pitch = tile + gap; fits the viewport and scrolls when the board is too large. */
  --pitch: clamp(30px, min(calc((100vw - 16px) / var(--cols)), calc((100dvh - 210px) / var(--rows))), 100px);
  --size: calc(var(--pitch) * 0.8);
  display: flex;
  flex-direction: column;
  gap: calc(var(--pitch) * 0.2);
  margin: auto;
}
.board-row { display: flex; gap: calc(var(--pitch) * 0.2); }

.cell {
  --tint: color-mix(in oklch, #fff, var(--cyan) calc(var(--t, 0) * 100%));
  position: relative;
  display: grid;
  place-items: center;
  width: var(--size, 48px);
  height: var(--size, 48px);
  flex: none;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12%;
  background: none;
  overflow: hidden;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.3s, background-color 0.3s, transform 0.15s;
}
.cell.hidden {
  border-color: #fff;
  color: #fff;
  background: rgb(10 10 50 / 0.35);
  box-shadow: 0 0 6px rgb(255 255 255 / 0.55), inset 0 0 4px rgb(255 255 255 / 0.3);
}
.cell.hidden:hover { background: rgb(255 255 255 / 0.12); }
.cell.hidden:active { transform: scale(0.92); }
.cell.flagged {
  border-color: var(--cyan);
  color: var(--cyan);
  background: color-mix(in srgb, var(--cyan) 12%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--cyan) 60%, transparent);
}
.cell.cleared { border-color: rgb(255 255 255 / 0.18); border-width: 1.5px; cursor: default; }
.cell.clue {
  border-color: var(--tint);
  border-radius: 50%;
  color: var(--tint);
  transform: scale(0.82);
  box-shadow: 0 0 6px color-mix(in srgb, var(--tint) 50%, transparent);
}
.cell.hole {
  border: 3px solid var(--pink);
  border-radius: 50%;
  transform: scale(0.82);
  box-shadow: 0 0 10px var(--pink), inset 0 0 8px var(--pink);
  background: #000;
}
.cell.exploded { background: var(--pink); box-shadow: 0 0 24px 4px var(--pink); }
.clue-num { font-size: calc(var(--size, 48px) * 0.5); font-weight: 700; line-height: 1; }

.spiral {
  width: 100%;
  height: 100%;
  animation: spin 6s ease-in-out infinite alternate;
  animation-delay: calc(var(--i, 0) * -0.25s);
}
@keyframes spin {
  from { transform: rotate(-22deg) scale(1.05); }
  to { transform: rotate(22deg) scale(0.95); }
}

.lost-panel { display: flex; flex-direction: column; gap: 16px; width: min(100%, 520px); padding-inline: 16px; }

.ticker {
  min-height: 1.5em;
  margin-block: 0 4px;
  font-size: 12px;
  color: rgb(255 255 255 / 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ticker-tag {
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--cyan);
  color: #000;
  font-weight: 700;
}

/* ---------- Clear / Flag switch ---------- */
.mode { display: flex; align-items: center; gap: 12px; font-size: clamp(16px, 4.5vw, 22px); }
.mode.hidden { visibility: hidden; }
.mode-label { padding: 4px; border: 0; background: none; opacity: 0.6; }
.mode-label[aria-pressed='true'] { opacity: 1; }
.switch {
  position: relative;
  width: 60px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #fff;
}
.switch::after {
  content: '';
  position: absolute;
  top: 7px;
  left: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-b);
  transition: translate 0.2s;
}
.switch[aria-checked='true']::after { translate: 28px 0; }

/* ---------- End screen ---------- */
.end {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  width: min(100%, 760px);
  margin-inline: auto;
  overflow: auto;
}
.end-tile {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(140px, 30vw, 220px);
  aspect-ratio: 1;
  border: 4px solid #fff;
  border-radius: 14%;
  box-shadow: 0 0 30px rgb(255 255 255 / 0.5);
  rotate: 10deg;
  animation: float 4s ease-in-out infinite alternate;
}
.end-tile svg { width: 100%; height: 100%; stroke-dasharray: 1 1.4; color: #c8c8ff; }
.end-dot {
  position: absolute;
  width: 18%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 24px 6px rgb(255 255 255 / 0.8);
}
@keyframes float { to { rotate: -6deg; translate: 0 -8px; } }
.end-title { margin: 0; text-align: center; font-size: clamp(18px, 5vw, 24px); line-height: 1.6; }
.scores {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  width: 100%;
  padding-block: 24px;
  border-block: 1px solid var(--line);
  text-align: center;
}
.score-label { display: block; color: rgb(255 255 255 / 0.75); font-size: 18px; }
.score-value { display: block; font-size: clamp(24px, 7vw, 34px); font-variant-numeric: tabular-nums; }
.score-icon { width: 64px; height: 64px; fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; }

/* ---------- Dialogs ---------- */
.sheet {
  width: min(100% - 32px, 640px);
  max-height: calc(100dvh - 32px);
  padding: 32px clamp(20px, 5vw, 40px);
  border: 0;
  border-radius: 16px;
  background: radial-gradient(120% 60% at 100% 0%, #3a3a3a, #0a0a0a 70%);
  color: #fff;
  line-height: 1.6;
  overscroll-behavior: contain;
}
.sheet::backdrop { background: rgb(0 0 0 / 0.6); backdrop-filter: blur(4px); }
.sheet h2 { margin: 24px 0 20px; font-size: clamp(28px, 8vw, 44px); line-height: 1.1; }
.sheet h2:first-of-type { margin-top: 8px; }
.sheet p { font-size: 16px; }
.close {
  position: sticky;
  top: 0;
  float: right;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #000;
}
.close svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; }
.legend { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-block: 20px; }
.legend-item { display: flex; align-items: center; gap: 16px; }
.cell.demo { --size: 52px; flex: none; }
.tools, .log { padding: 0; list-style: none; }
.tools li { padding: 2px 0; }
.log { font-size: 13px; }
.log li { display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 8px 0; border-top: 1px solid rgb(255 255 255 / 0.15); }
code { color: var(--cyan); word-break: break-all; }
.credit a { color: var(--cyan); }

/* ---------- Motion preferences ---------- */
@media (prefers-reduced-motion: reduce) {
  .app *,
  .app::before { animation: none !important; }
}
</style>
