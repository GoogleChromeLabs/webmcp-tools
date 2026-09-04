# FOCUS — Demo Video Script

**Target:** Under 3 minutes  
**Format:** Screen recording with voiceover

---

## Scene 1: The Problem (0:00–0:20)

**Visual:** Browser showing the FOCUS app — 13 tasks in the dependency graph, OVERLOAD HIGH badge, 120m available

**Voiceover:**
> "When you have 11 tasks across school and life, 4 deadlines, dependencies chaining tasks together, and only 2 hours — cognitive overload doesn't just feel overwhelming. It's paralyzing. You don't know where to start."

**[Split screen: FOCUS on left, ChatGPT on right]**

> "So you open ChatGPT and say: 'I'm overwhelmed, help.'"

---

## Scene 2: Agent Discovers Tools (0:20–0:35)

**Visual:** ChatGPT response showing "I found 11 WebMCP tools in FOCUS. Let me assess your workload."

**Voiceover:**
> "ChatGPT discovers the FOCUS WebMCP tools. It says: 'I can inspect your live workload. Let me look.'"

**Visual (DevTools overlay showing tool activity):**
```
→ get_workload_state
→ assess_overload
→ identify_bottleneck
```

**Voiceover:**
> "The agent calls into the app — not by scraping HTML, but through intent-level tools: get workload, assess overload, identify bottleneck. These are typed, structured tools exposed directly by FOCUS through WebMCP."

---

## Scene 3: The Plan Appears (0:35–1:00)

**Visual:** Back to the FOCUS UI. The dependency graph animates — one node highlights blue, pulsing. All other nodes dim. The START HERE card appears.

**Voiceover:**
> "The app transforms. The agent identified that 'Finish Management Chapter 7' blocks five downstream tasks including today's quiz. The bottleneck node pulses blue. Everything else fades. The START HERE intervention says: 'Start here. 25 minutes. Blocks 5 tasks.'"

**Zoom in on START HERE card**

**Voiceover:**
> "The agent proposed a focus block. But this isn't a command — it's a proposal. The human still commands."

---

## Scene 4: The Override Loop (1:00–1:25)

**Visual:** User clicks OVERRIDE button. The override picker shows other tasks.

**Voiceover:**
> "But the user disagrees. 'No — the quiz is at 8 AM, I have to do that first.' They click OVERRIDE and select 'Study for Quiz.'"

**Visual:** Panel shows "PLAN UPDATED" banner. Before/after comparison: "Finish Ch7 → Study for Quiz"

**Voiceover:**
> "The agent recomputes the plan. The dependency graph reorders. The timeline updates. 'Plan Updated' — before and after, side by side. This is negotiation: the agent proposes, the human overrides, the agent adapts."

---

## Scene 5: Approval Gate (1:25–1:40)

**Visual:** User clicks APPROVE.

**Voiceover:**
> "The human approves. But notice — the agent cannot start a focus block alone. If it tried, it would get back: HUMAN_APPROVAL_REQUIRED."

**DevTools overlay showing agent calling `start_focus_block` → error response**

**Voiceover:**
> "This is the safety model. Consequential actions require a physical UI click. The agent proposes. The human commands."

---

## Scene 6: Focus Mode (1:40–2:00)

**Visual:** Full-screen Focus Mode overlay. Big countdown timer. "One task. Nothing else."

**Voiceover:**
> "Focus Mode takes over the full screen. One task. A 45-minute countdown. A progress bar. Pause if you need to. Complete or abandon when you're done. No distractions."

**Visual:** Timer ticking down, then user clicks COMPLETE

**Voiceover:**
> "The human completes the block. The app registers the result. State version incremented. The loop is ready to start again."

---

## Scene 7: The Architecture (2:00–2:30)

**Visual:** Quick code tour — registerTools.js, focusStore.js

**Voiceover:**
> "The architecture: 11 WebMCP tools registered via the standard polyfill. Three operation classes — read tools with no gate, proposal tools with human override, consequential tools requiring physical approval. A zustand store with stateVersion tracking, so the agent can detect stale state and re-read before acting."

**Visual:** Quick flash of STALE_STATE error response, showing structured error with code/message/versions

**Voiceover:**
> "Every mutation returns structured deltas and state versions. The agent can't silently overwrite — stale state gets a typed error: go back and re-read."

---

## Scene 8: What It Makes Possible (2:30–2:50)

**Voiceover:**
> "Before WebMCP, this required DOM scraping, backend bridges, or serialized state. Now a browser app exposes its semantic model directly to an AI agent. The agent sees tasks, dependencies, deadlines, overload, proposals — not as pixels, but as typed data structures. The human stays in command. The agent does the analysis. Together, they negotiate a plan."

**Visual:** Split screen fades — FOCUS app centered

**Voiceover:**
> "FOCUS turns overwhelm into one clear next action. That's what human-agent collaboration actually looks like."

---

## End Screen (2:50–3:00)

**Text overlay:**
- FOCUS — Cognitive Command Center
- Built with WebMCP for the 2026 WebMCP Hackathon

**Voiceover:**
> "FOCUS. Built with WebMCP."

---

## Production Notes

- Record in 1080p at 60fps
- Voiceover: calm, deliberate pace — don't rush
- Cuts between scenes should be clean transitions (300ms fade)
- DevTools overlays: use Chrome DevTools console, not terminal
- For the agent perspective, show ChatGPT or a Claude desktop session
- If Claude desktop can't connect to localhost, use simulated agent text in a clean mockup