# DESIGN.md — FOCUS Repaint (2026-09-03)

## Register
`product-app` — post-login executive-function surface. Not a marketing page. Density, scannability, and keyboard speed beat hero storytelling.

## Anchor
**Linear (task list + command palette density) · Todoist (quick-add + time boxing).** 
Trade-offs: Linear-calm gives tight 40px rows, mono durations, and a single brass accent; Todoist gives the ultra-fast "Type title → set time → Enter" add flow. Stripe Dashboard was considered for card metrics but rejected — too much card chrome for a list that needs to scan. Notion's board was considered but dropped for extra chrome.

Industry system: **Carbon / Primer** semantics for data-dense lists (role-based color, grid-native, mono for metrics) implemented in our own CSS — no shadcn present.

## Tokens (locked)

| Category | Value |
|---|---|
| **Color (OKLCH)** | `bg-primary: oklch(0.14 0.015 45)` ≈ `#131110` · `bg-secondary: oklch(0.19 0.02 50)` ≈ `#211C16` · `surface-raised: oklch(0.21 0.02 50)` · `fg-primary: oklch(0.95 0.02 85)` ≈ `#F3ECDF` · `fg-muted: oklch(0.62 0.02 70)` ≈ `#6B6455` · `border: oklch(0.95 0.02 85 / 0.11)` · `accent: oklch(0.76 0.13 80)` ≈ `#D9A94A` · `accent-warm: oklch(0.76 0.13 80 / 0.62)` · `danger: oklch(0.52 0.16 28)` ≈ `#B0492F` |
| **Tint rule** | Neutrals tinted 70-85 toward accent hue; reserve saturation for accent + danger only. |
| **Type — Display** | `Bricolage Grotesque` 600 (headings, focus title). Fallback: `Söhne`, `Geist`. Loaded 500/600 only. |
| **Type — Body** | `Schibsted Grotesk` 400/500 (list, prose). Fallback: `Geist Sans`. |
| **Type — Mono** | `IBM Plex Mono` 400/500/600 (time, durations, meta, badges). |
| **Weight contrast** | Display 600 vs Body 400 = 200 (paired with size contrast 34px vs 14px to hit ≥400 perceived). |
| **Spacing** | Base 4px, 6 steps: 4/8/12/16/24/32. Layout uses 8px grid (24/32 between sections), internals use 4px (4/8/12). 48/64 only for focus aperture. |
| **Radius** | 3px (cards, inputs), 9999 (pills/lamps). No middle radius — near-zero only. |
| **Motion** | 120ms (hover), 200ms (open/close), 320ms (focus aperture). `ease-out` for enter, `ease-in` for exit. Honour `prefers-reduced-motion`. |
| **A11y** | 4.5:1 normal, 3:1 large/UI, focus ring 2px `accent` at ≥3:1, touch ≥44px, `lang="en"`, skip-link, one `<h1>`. |

## Variant — Chosen
Linear-calm (tight list, not board). Rationale: task count (13 → grows) needs vertical scan, not card grid; time presets need to sit next to the list header, not in a floating map.

## Layout
- **Header (bezel)**: `FOCUS` + `TODAY` + `availableMinutes` + `time-select` (presets + custom + "Set default") · `OVERLOAD` lamp · `Companion`
- **Main (grid)**: `grid-template-columns: minmax(0, 1fr) 380px` on desktop; single column on mobile. Left = clean `TaskList` (add row + filter + rows). Right = sticky stack: `FocusCenter` (strongest hierarchy, but as a docked card, not an overlay) + `PlanTimeline` (capacity-aware) + `ActivityRail`.
- **Graph removal**: `CognitiveMap` SVG constellation removed — the "node thing" was decoration costing scan time. Dependency edges now surface as `Unlocks` + `Depends on` text in the list and focus card. Keeps WebMCP graph data (`get_task_dependencies` still works) without the physics.
- **Empty/All-done**: centered `all-clear` card in the list pane.

## Component anatomy (Gate 4) — 8 states each
- **Add Task row**: default (placeholder "Add a task…"), hover, focus (ring), active (typing), loading (saving… spinner + disabled), empty (validation: title required), error (inline "Title required" + `aria-invalid`), disabled (while focusing block active). Keyboard: `Enter` to add, `Esc` to clear.
- **Task row**: default, hover (subtle border), focus (row ring), active (pressed), loading (optimistic strike), empty (N/A), error (failed defer), disabled (completed/deferred). Keyboard: `Space` toggles complete, `Delete` defers, `Tab` orders rows.
- **Time selector**: default, hover, focus, active, loading (recomputing capacity skeleton), empty (no preset), error (NaN → "Enter a number"), disabled. Keyboard: presets are radio-like; custom input `Enter` to set, `Esc` to close.

## Experience contract (Gate 5)
- Honest feedback: add → optimistic row + `Saving…` → `Saved` live region; time change → skeleton on `fits/overflow` (200ms) then update; not silent.
- Forgiving input: validate on blur/submit, not every keystroke; specific inline errors ("Title required", "Enter minutes 1–480").
- Recoverable: complete is reversible via `Defer` undo; delete not used — defer only.
- Keyboard path: `Tab` through header → add input → rows → focus card `START` → `CHANGE PLAN`; `Esc` closes pickers; visible `:focus-visible` on all.
- Motion safety: `prefers-reduced-motion` disables aperture/ring animations.

## Reach (Gate 6 — product-app, so a11y only; SEO N/A)
- Landmarks: `<header>` (bezel), `<main>` (grid), `<aside>` (right stack) or `<section>` with `aria-label`.
- One `<h1>` = `FOCUS` (visually the logo, semantically the H1).
- Labels: every input has real `<label>` (visually hidden where needed, not placeholder).
- Alt: decorative lamp `aria-hidden`; no content images after graph removal.
- Live region: `role="status" aria-live="polite"` for add/complete/time-default feedback at load.
- `lang="en"` + skip-to-main as first focusable element.

## Compile-clean (Gate 7)
Project-scaffold: only deps in `package.json` (`react`, `react-dom`, `zustand`, `use-webmcp-tool`). No new imports. Typeface via existing Google Fonts. Motion via CSS only.

## Files to touch
- `src/App.jsx` — replace `map-canvas` + `focus-center-layer` overlay with `TaskList` + docked `FocusCenter` grid
- `src/components/TaskList/TaskList.jsx` — NEW
- `src/store/focusStore.js` — add `addTask`, `toggleTask`, `updateTask`, `defaultAvailableMinutes` + `setDefaultMinutes`, persist to `localStorage`
- `src/index.css` — retire graph/reticle/beam/bloom tokens; add `.task-list*`, tighten list density, keep focus tokens
- `src/components/CognitiveMap/` — delete or keep unused (remove import)
- `src/main.jsx` + `index.html` — add skip-link, ensure one H1
