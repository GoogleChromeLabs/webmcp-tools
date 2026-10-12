// Companion bridge — runs in the MAIN FOCUS window.
//
// The WebMCP companion is a *separate* same-origin browser window (opened via
// window.open('/companion.html')). A new window gets a fresh JS context, so it
// cannot import the zustand store directly. This bridge gives the companion a
// read-only live view of the store and a delegated execution path, both exposed
// on window.* so the peer window can reach them by reference (same origin =
// accessible, no serialization needed):
//
//   window.__focus_state           -> latest store snapshot (kept current)
//   window.__focus_exec(name,args) -> run a registered WebMCP tool via modelContext
//
// The registered tool map itself lives at window.__webmcp_registered_tools
// (populated by the polyfill as registerTools() runs), so the companion reads
// the ACTUAL exposed surface from there — the ground truth of "is WebMCP exposed".
import useFocusStore from '../store/focusStore.js';

export function installCompanionBridge() {
  const snapshot = () => {
    const s = useFocusStore.getState();
    return {
      stateVersion: s.stateVersion,
      overloadLevel: s.overloadLevel,
      availableMinutes: s.availableMinutes,
      bottleneckTaskId: s.bottleneckTaskId || null,
      currentProposal: s.currentProposal ?? null,
      activeFocusBlock: s.activeFocusBlock ?? null,
      taskCount: s.tasks?.length || 0,
      activeCount: (s.tasks || []).filter(t => t.status !== 'completed' && t.status !== 'deferred').length,
    };
  };

  const push = () => {
    window.__focus_state = snapshot();
  };

  push();
  const unsubscribe = useFocusStore.subscribe(push);

  // Convenience executor so the companion doesn't have to reach into the peer's
  // modelContext internals. Mirrors document.modelContext.executeTool.
  window.__focus_exec = (name, args) =>
    document.modelContext.executeTool({ name, execute: async () => {} }, args || {});

  return () => {
    unsubscribe();
    delete window.__focus_state;
    delete window.__focus_exec;
  };
}
