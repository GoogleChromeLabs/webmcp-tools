# PROXX Lite

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/proxx-lite/

A simplified take on [PROXX](https://github.com/GoogleChromeLabs/proxx), built with Vue 3 and Vite. It is inspired by the original game but is not the same: there is no WebAssembly engine, no offline support, and no multiplayer. Clear every tile that doesn't hide a black hole.

## 🚀 Getting Started

```bash
npm ci
npm run dev
```

Open the local URL that Vite prints (`http://localhost:5173` by default).

## 🎮 Playing

- **Presets**: Easy (8×8, 10 black holes), Medium (16×16, 40), and Hard (24×24, 99), or any custom size up to 40×30.
- **Clear / Flag**: Use the switch in the bottom bar, or right-click to flag. Tap a revealed number to clear its neighbors when its flags match.
- **Best times**: Your best time for each board size is saved in `localStorage`.

## 📂 Project Structure

```
src/
  App.vue        UI: home, game, win/lose screens, and how-to-play dialog
  game.ts        Game state and rules: reveal, flag, chord
  main.ts        App entry point
```

---

_Note: This demo is not affiliated with the original PROXX game. It has no backend and only stores best times in your browser._
