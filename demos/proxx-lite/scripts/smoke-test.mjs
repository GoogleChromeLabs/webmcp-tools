/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Smoke test: mocks document.modelContext, loads webmcp.ts via Vite SSR, and plays through the tools.
import { createServer } from 'vite'
import { effectScope } from 'vue'

const tools = new Map()
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
})
const mod = await server.ssrLoadModule('/src/webmcp.ts')
// Same module instance as the tools use, so findHint() sees the live board.
const { findHint } = await server.ssrLoadModule('/src/game.ts')
const document = {
  modelContext: {
    registerTool: (t, { signal }) => {
      tools.set(t.name, t)
      signal.addEventListener('abort', () => tools.delete(t.name))
    },
  },
}
const scope = effectScope()
const { isRegistered } = scope.run(() => mod.useProxxTools({ document }))
console.log('Registered:', isRegistered.value, [...tools.keys()])

const call = async (name, args = {}) => JSON.parse((await tools.get(name).execute(args)).content[0].text)

await call('proxx_new_game', { difficulty: 'easy' })
let r = await call('proxx_reveal_cell', { row: 4, col: 4 })
console.log(r.result.message, '\n' + r.state.board)

// Let the simple solver play through the tools as far as it can.
for (let i = 0; i < 200; i++) {
  const hint = findHint()
  if (!hint) break
  const { row, col, action } = hint
  r = action === 'flag'
    ? await call('proxx_flag_cell', { row, col, flagged: true })
    : await call('proxx_reveal_cell', { row, col })
  if (r.state.status !== 'playing') break
}
console.log('Status:', r.state.status, 'flags:', r.state.flagsPlaced, '\n' + r.state.board)
console.log('Invalid:', (await call('proxx_reveal_cell', { row: 99, col: 0 })).result.message)
console.log('Bad type:', (await call('proxx_reveal_cell', { row: 'a', col: 0 })).result.message)
console.log('Bad game:', (await call('proxx_new_game', { rows: 3, cols: 3, blackHoles: 9 })).result.message)
scope.stop()
console.log('After dispose, tools left:', tools.size)
await server.close()
