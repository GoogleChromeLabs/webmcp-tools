# FOCUS — Gauntlet Loop Progress

**Bar:** Linear's app (dark product UI) — blind A/B against our rendered screenshots.
**Goal:** FOCUS frontend wins the blind comparison on every piece.
**Constraint:** Only Opus subagents can view images (critics are Opus; code-only builders use default model).

---

## Round 0 — Baseline (pre-loop)

| Piece | Verdict | Biggest gap |
|-------|---------|-------------|
| Overall | **B (ours) loses** | Sparse, empty graph; small truncated labels; no focal point |

Captured: `linear-reference.png` (ref) · `focus-01…05` (ours) · `blind-a/b` pair.

## Round 1 — Harsh critic

- [x] Critic (Opus) blind A/B — **INVALID**: ref crop was blank (file:// blocked). Re-captured real Linear hero (`ref-hero.png`).
- [x] Re-captured `blind-a/b` with real reference
- [x] Re-run harsh critic on corrected pair → **VERDICT: A (ref) wins**. B (ours) wins **information design**.
      Biggest gap in B: unbalanced composition — bottom ~40% dead space, truncated node labels, competing saturated hotspots.
- [x] Builder → cognitive map composition + labels (build passes)
- [x] Main-agent visual verify — improvements confirmed (legible labels, arrowheads, KEY, focused-node hierarchy, less dead space)
      BUT builder-introduced regressions spotted: "Finish Management Chapte…" still truncates;
      long dashed bottleneck edge sweeps across graph into noisy oversized arrowhead;
      bottleneck stroke on old "Study for Quiz" competes with genuinely-focused node.
- [x] Blind re-judge (Opus) on new pair → **VERDICT: A wins on polish; B wins on substance**.
      Confirmed biggest gap: **graph illegible** — labels truncate, dependency direction unclear,
      graph disagrees with Execution Sequence, red/blue do triple duty, legend advertises unused green.
- [x] Builder #2 → graph legibility + directional edges + color discipline (code-only, default model)
- [x] Main-agent visual verify — **CONFIRMED FIXED**: full 2-line labels, no truncation; numbered spine
       along `orderedTaskIds` (structural agreement w/ Execution Sequence); neutral gray arrows, clean
       direction; red = deadline only (green legend entry deleted, KEY rebuilt truthful); context
       backdrop "9 more in context · 240m" fills dead space; focus-03 generalizes cleanly.
       ⚠️ REGRESSION SPOTTED (me): `focus-01` initial-load (no proposal yet) is an EMPTY map — just
       faint dots + "13 active in context", no spine, no focal point, side panel shows only
       "AGENT ACTIVITY". A judge opening FOCUS first sees an empty black panel. Needs fix before final.
- [x] Rebuilt blind pair (blind-a = ref-hero, blind-b = fresh focus-04) via `command cp`
- [x] Blind re-judge (fresh Opus critic) — **Round 3 VERDICT: A wins (A 9/10, B 6/10)**.
      B now WINS information design + color-system + focal point (structural agreement cofirmed "exact").
      Remaining defeats = pure craft, ranked by critic:
       1. Unpopulated lower canvas (biggest) — graph floats top third, bottom ~60% dead. Prescribe:
           vertically center + scale, render backlog as a real secondary constellation not faint dots.
       2. Arrow direction genuinely ambiguous (runner-up, "arguably more dangerous") — no confident arrowhead.
       3. AGENT ACTIVITY = repeated identical mock rows ("Bottleneck: Study for Quiz" ×3, "Overload: high" ×2).
       4. Awkward 2-line wraps + giant hero circle vs small label (nodes 1 & 4).
       5. Color leak — overload gray in feed vs red badge.  6. (low-conf) possible dup "Today 120m available".
- [x] **USER REDIRECT:** "use front end design and repaint and dont blindly copy linear" + "Ultracode still on, use Workflow."
      → PIVOT: the bar is now a DISTINCTIVE FOCUS identity (not "beat Linear's screenshot"). Loaded `frontend-design`
      skill. Linear demoted to just "is it premium?" not the design source. Goal = coherent, opinionated, own identity
      grounded in the single-next-action / focus / crosshair subject, avoiding AI-generic defaults AND Linear's look.
- [x] Builder #3 → DONE (2-state map fills canvas, solid directional arrowheads, change-driven ActivityRail,
      truthful KEY). Main-agent verified: base is sound (direction now clear, backlog = real labeled
      constellation, rail = distinct lines "Override → primary" / "Focus block proposed" / "Bottleneck identified").
      Still blue + right-shell — that's what Darkroom replaces.
- [x] Identity Workflow wm1zq28ye → DONE. Winner "The Spotlight" (sig "The Lock"); **synthesized identity = DARKROOM**:
      warm-charcoal room (Gesso #131110 / Charcoal #211C16 / Ash #6B6455), ONE brass accent Lamp #D9A94A (zero blue),
      Ivory #F3ECDF lit text, Clay #B0492F overload-only; type Bricolage Grotesque (display) / Schibsted Grotesk (body)
      / IBM Plex Mono (data); signature = reticle "lock" + beam cone on the ONE lit node; dissolve the right-side card
      shell (plaque hangs on the target; sequence becomes the thread; activity log → lower-left mono). One risk =
      the no-proposal state can read empty — guarded (constellation stays 18-30% Ash, radial drift, legible KEY/log).
- [x] Darkroom repaint workflow wzxw5pf76 → Opus Apply → Opus Critique → Refine (DONE). Opus critique named the gaps:
      (1) beam cone reads as a muddy brown column not a shaft of light (top fixable item);
      (2) brass over-deployed ~14 surfaces; (3) no-proposal state off-balance / clipped KEY.
- [x] Main-agent verify of repainted render — identity is genuinely a NON-Linear Darkroom: warm-charcoal, zero blue,
      The Lock (node 01 gold reticle + beam), plaque hung on target, mono EXECUTION SEQUENCE + AGENT LOG, truthful KEY.
      Confirmed the 3 critiques were real in the render.
- [x] Refine pass (main agent, image-capable): fixed all 3. (a) Beam now a TRUE divergent cone from a defined
      top-of-frame aperture — narrow at the gate, warm-white (not gold) core, luminous at source diffusing down,
      crisp cone edges + gate → reads as a lamp illuminating the node, NOT a smear. (b) Reclaimed brass: spine step
      badges 01-04 pushed to Ash, so the one gold sits on the Lock reticle + beam gate + dependency path + APPROVE.
      (c) No-proposal state rebalanced: 13-task constellation centred, "13 active · 375m" anchored, and the KEY is now
      TRUTHFUL (only states actually present — no phantom "focus"/"in plan"). Re-captured + verified myself.
- [x] **FINAL rescore — blind critic wf_2968f11f-58f (Opus) on rebuilt blind pair.** VERDICT:
      **distinctive 9 · premium 8 · infoDesign 8 · restraint 8 · whichMorePremium = "close" · readsAsDistinctive = "yes_distinctive".**
      Overall (verbatim): "competition-ready on its own terms, and an opinionated one… the darkroom metaphor is legible and
      holding: a cone of light drops onto exactly one brightly-lit node inside a brass reticle… the core narrative is not just
      coherent but truthful… It is not flawless against a Linear-calibre bar… but these are polish- and discipline-level gaps,
      not identity gaps — the piece is distinctive, craft-forward, and faithful to its own premise."
      ⇒ PASS on the redirected bar (distinctive FOCUS identity, NOT a Linear clone). Close (not a decisive W) on raw polish.
      Critic's 3 remaining gaps (all polish/discipline, cheap): (1) "129 available" had no unit; (2) agent-log v3 clipped
      mid-word behind the plaque; (3) brass did a bit too much work (path arrow among it).
- [x] Post-critic polish (main agent) — fixed all 3: (1) "129m available" — unit attached to the bright number;
      (2) moved AGENT LOG to the bottom-right corner so the plaque (hung on the leftmost lit node) never covers it →
      clean 4-corner grid (brand / sequence / KEY / agent feed), and the override line now reads in full;
      (3) receded the spine-path arrows to neutral Ash, so brass sits only on the Lock + beam cone + APPROVE.
      Re-captured + verified myself: hero is balanced, dignified, single-accent, and the log is fully legible.

---

*Live — updated each round.*
