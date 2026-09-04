# FOCUS — Gauntlet Run Report

> **Thesis:** *Turn overwhelm into one clear next action.* The agent recommends; the human commands. No consequential plan is silently executed.

**Deployment target:** 2026 WebMCP Hackathon (deadline Sept 3, 2026).
**Location:** `webmcp-tools/demos/focus/` (W3C WebMCP demos monorepo).
**Verdict at close:** competition-ready, distinctive, and WebMCP-exposed end-to-end — verified live.

---

## 1. What shipped

**Product.** A WebMCP-native executive-function command center for cognitive overload. A single-page React 19 + Vite + Zustand app, dark and state-driven (no router). The hero is a **cognitive dependency map** that transforms when the agent finds the bottleneck, a **START HERE** plaque that hangs on the one lit task, a **EXECUTION SEQUENCE** thread, an **AGENT LOG**, and a full-screen **FOCUS BLOCK** overlay.

**The 11 WebMCP tools** (intent-level, three operation classes):

| Class | Tools | Gate |
|-------|-------|------|
| **Read** (free) | `get_workload_state`, `get_task_dependencies`, `get_available_time`, `assess_overload`, `identify_bottleneck` | none |
| **Proposal** (staged) | `propose_focus_block`, `restructure_plan`, `defer_task`, `override_plan` | human override |
| **Consequential** (gated) | `start_focus_block`, `complete_focus_block` | human approval |

Every mutation bumps `stateVersion`; tools import the Zustand store as a singleton and return structured `{status, stateVersion, stateDelta}`, with stale-state detection via `expectedStateVersion` → `STALE_STATE`.

**Stack:** React 19 · Vite 8 · Zustand 5 · `use-webmcp-tool` · shared `webmcp-polyfill` (via `document.modelContext.registerTool`).

---

## 2. The Gauntlet loop (design bar)

The gauntlet iterated on a blind A/B bar. That bar **was redirected mid-run** by the human — from "beat Linear's screenshot" to **"distinctive FOCUS identity, and don't blindly copy Linear."**

- **Round 0 — Baseline:** ours *loses* — sparse graph, truncated labels, no focal point.
- **Round 1 — Harsh critic (Opus, blind A/B):** reference wins; we win *information design*. Gaps: unbalanced composition, dead space, truncated labels, competing hotspots.
- **Round 2 — Builder passes + re-judge:** reference wins on polish, ours wins on substance. Confirmed biggest gap: graph illegibility, direction ambiguity, double-duty colors.
- **Round 3 — Fresh blind critic:** (A 9/10, B 6/10). Ours now *wins* information design + color-system + focal point. Remaining defeats = craft: unpopulated lower canvas, ambiguous arrows, repeated mock activity rows, awkward wraps.
- **USER REDIRECT → Identity pivot.** Loaded `frontend-design` skill; Linear demoted to "is it premium?" — not the source. Goal: a coherent, opinionated identity grounded in the single-next-action / focus / crosshair subject, avoiding AI-generic defaults *and* Linear's look.
- **Identity workflow (wm1zq28ye):** winner = **"The Spotlight"**, signature = **"The Lock."** Synthesized identity = **DARKROOM**.
- **Repaint workflow (wzxw5pf76), Opus Apply → Opus Critique → Refine.** Critique named 3 gaps: beam read as a muddy brown column; brass over-deployed; no-proposal state off-balance + clipped KEY. Main-agent refine pass fixed all three.
- **FINAL blind rescore (Opus, wf_2968f11f-58f):** `distinctive 9 · premium 8 · infoDesign 8 · restraint 8 · whichMorePremium = close · readsAsDistinctive = yes_distinctive`.
  - *Verbatim:* *"competition-ready on its own terms, and an opinionated one… the darkroom metaphor is legible and holding: a cone of light drops onto exactly one brightly-lit node inside a brass reticle… the core narrative is not just coherent but truthful… It is not flawless against a Linear-calibre bar… but these are polish- and discipline-level gaps, not identity gaps."*
  - ⇒ **PASS** on the redirected bar. **Close** (not a decisive W) on raw polish. Critic's 3 remaining gaps: number had no unit; agent-log clipped behind the plaque; brass did too much work.

**The DARKROOM identity:** warm-charcoal room — Gesso `#131110` / Charcoal `#211C16` / Ash `#6B6455`; **one** brass accent, the Lamp `#D9A94A` (zero blue); Ivory `#F3ECDF` lit text; Clay `#B0492F` overload-only. Type: Bricolage Grotesque (display) / Schibsted Grotesk (body) / IBM Plex Mono (data). Signature: a **reticle "lock"** + a divergent **beam cone** onto the one lit node; the side card shell dissolves — the plaque hangs on the target, the sequence becomes the thread, the activity log drops to lower-left mono.

**Post-critic polish (main agent):** attached the unit ("129m available"), moved AGENT LOG to a clean bottom-right corner so the plaque never covers it (clean 4-corner grid), and receded spine-path arrows to neutral Ash so brass sits only on the Lock + beam + APPROVE. Verified by re-capture.

---

## 3. WebMCP exposure — verified end-to-end

The defining request: **"100% ensure WebMCP is exposed"** via a companion window that interfaces with FOCUS and takes an API key to test WebMCP. Shipped:

- **`companion.html` + `companion.js` + `companion.css`** — a true separate same-origin window ("test bench") opened from a top-bar **Companion** button. It enumerates the live `__webmcp_registered_tools` Map, shows a live state snapshot, runs any tool by delegating to the peer's `document.modelContext.executeTool`, and drives a real agentic loop.
- **`companionBridge.js`** (in the main window) — pushes a read-only `__focus_state` snapshot and exposes `__focus_exec(name, args)`; no serialization, straight `window.opener` reference.
- **`agentProxy.js`** — a Vite dev plugin at `/api/agent-loop`. Required because OpenAI-compatible providers (OpenAI, NVIDIA NIM…) don't send CORS headers, so an in-browser `fetch` is always blocked. The proxy forwards server-side (no CORS) with the caller's Authorization header. Dev-only; the key is never logged or stored.

**Verified outcomes (through the real running app):**
- Health check (live Playwright, both windows): **reachable ✓ · 0 console errors ✓ · 11 tools enumerated ✓ · linked ✓**.
- Companion enumerates the real tool surface: **11/11**, correctly grouped by operation class; link lamp reads **"linked to main window"**.
- Live state syncs from the store: overload `HIGH`, `120m`, `13/13 active`, version ticking.
- `get_workload_state` runs through the bridge and returns the actual task graph; `start_focus_block` returns **`HUMAN_APPROVAL_REQUIRED`** (gate intact).

**Agent loop, driven with an OpenRouter key (`openrouter/free`):** the model called `get_workload_state` → `assess_overload` → `identify_bottleneck`, then returned a single-sentence next action: *"…immediately begin working on the bottleneck by starting a focus block on 'Study for Quiz'."* **The decisive check held: the model recommended a focus block but did NOT call `start_focus_block`** — it stopped at the recommendation, so the human gate was never bypassed. State walked `v0 → v2` (read/assess only, no consequential mutation).

**Two engineering fixes surfaced during verification:**
1. **Cross-realm `instanceof Map` trap** — `window.opener.__webmcp_registered_tools` is a Map created in the main window's realm, so `instanceof Map` fails in the companion. Fixed with a shape test (`typeof map.values === 'function' && typeof map.get === 'function'`).
2. **CORS barrier** — the loop "finished" instantly because the browser blocked the upstream fetch. Diagnosed and solved with the same-origin proxy.

---

## 4. Known gaps / worth knowing

- `openrouter/free` **round-robins across free models** (Nemotron 3 Super → Nemotron 3.5 Lightning → dots-3-note-preview → poolside/laguna). Fine for a demo; final answer quality varies per turn. Use a pinned non-`free` slug for a deterministic run.
- The raw-polish verdict is **"close," not a decisive win** — rest is polish/discipline, not identity.
- `assess_overload` and `identify_bottleneck` bump `stateVersion` even though they're read-class; that's the store's existing behavior and was deliberately not redesigned (gauntlet constraint).

---

## 5. Scorecheck

| Criterion | Status |
|-----------|--------|
| WebMCP leverage | 11 intent-level tools across 3 gated classes; real live-state access, staleness handling, structured errors |
| Execution | Runs, builds, 0 console errors; full hero flow works via real tools |
| Potential impact | Executive-function/cognitive-overload problem is genuinely underserved |
| Creativity & ambition | Distinctive Darkroom identity + The Lock/beam signature; not a clone |

**Bottom line:** FOCUS is WebMCP-native, distinctive, and verified working end-to-end — including a live agent actually negotiating with the app through its exposed tools, with the human-approval gate intact.
