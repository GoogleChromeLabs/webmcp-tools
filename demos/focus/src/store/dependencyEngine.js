/**
 * Topological sort engine for task dependency ordering.
 * Uses Kahn's algorithm with deterministic tie-breaking.
 *
 * @param {Array} tasks - Array of task objects with id and dependencies fields
 * @returns {{ order: string[], cycles: string[][] }} - Ordered task ids and any detected cycles
 */
export function topologicalSort(tasks) {
  // Handle empty input
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { order: [], cycles: [] };
  }

  // Build task map for valid task IDs
  const taskMap = new Map();
  for (const task of tasks) {
    if (task && task.id !== undefined && task.id !== null) {
      taskMap.set(task.id, task);
    }
  }

  // Build adjacency list and in-degree count
  // edge: depId -> [taskIds that depend on depId]
  const edges = new Map();
  const inDegree = new Map();

  // Initialize all valid task IDs
  for (const taskId of taskMap.keys()) {
    edges.set(taskId, []);
    inDegree.set(taskId, 0);
  }

  // Build edges and count in-degrees
  for (const task of tasks) {
    if (!task || task.id === undefined || task.id === null) continue;

    const taskId = task.id;
    const deps = task.dependencies || [];

    for (const depId of deps) {
      // Skip invalid references (depId not in taskMap)
      if (!taskMap.has(depId)) continue;

      // depId -> taskId edge (depId must come before taskId)
      edges.get(depId).push(taskId);
      inDegree.set(taskId, inDegree.get(taskId) + 1);
    }
  }

  // Priority ranking helper
  function getPriorityValue(priority) {
    switch (priority) {
      case 'critical': return 0;
      case 'high': return 1;
      case 'low': return 3;
      default: return 2; // medium is default
    }
  }

  // Comparator for deterministic tie-breaking
  function compareNodes(a, b, taskMap) {
    const ta = taskMap.get(a) || {};
    const tb = taskMap.get(b) || {};

    // 1. dueAt: earlier ISO string first, null/undefined/empty last
    const dueA = ta.dueAt;
    const dueB = tb.dueAt;

    const validDueA = (dueA != null && dueA !== '');
    const validDueB = (dueB != null && dueB !== '');

    if (validDueA && !validDueB) return -1;
    if (!validDueA && validDueB) return 1;
    if (validDueA && validDueB) {
      if (dueA < dueB) return -1;
      if (dueA > dueB) return 1;
    }

    // 2. lower priority rank first
    const priA = getPriorityValue(ta.priority);
    const priB = getPriorityValue(tb.priority);
    if (priA !== priB) return priA - priB;

    // 3. ascending lexicographic on id
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  // Initialize ready set with nodes having in-degree 0
  const ready = [];
  for (const [taskId, deg] of inDegree.entries()) {
    if (deg === 0) {
      ready.push(taskId);
    }
  }

  // Sort ready set deterministically
  ready.sort((a, b) => compareNodes(a, b, taskMap));

  const order = [];
  const processed = new Set();

  // Kahn's algorithm
  while (ready.length > 0) {
    // Take first (lowest priority according to tie-breaker)
    const current = ready.shift();
    order.push(current);
    processed.add(current);

    // Update in-degrees of dependents
    const dependents = edges.get(current) || [];
    for (const depId of dependents) {
      inDegree.set(depId, inDegree.get(depId) - 1);
      if (inDegree.get(depId) === 0) {
        // Insert in sorted position for determinism
        let inserted = false;
        for (let i = 0; i < ready.length; i++) {
          if (compareNodes(depId, ready[i], taskMap) < 0) {
            ready.splice(i, 0, depId);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          ready.push(depId);
        }
      }
    }
  }

  // Find unprocessed nodes (participating in or dependent on cycles)
  const cycles = [];
  const unprocessedNodes = [];

  for (const taskId of inDegree.keys()) {
    if (!processed.has(taskId)) {
      unprocessedNodes.push(taskId);
    }
  }

  // Find strongly connected components among the unprocessed nodes using a
  // real (iterative) Tarjan's algorithm. A cycle is any SCC with more than one
  // node, or a single node with a self-loop. Nodes that merely depend on a
  // cycle (Kahn already excluded them) are NOT cycle members.
  const unprocessedSet = new Set(unprocessedNodes);

  const indexOf = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const sccStack = [];
  let nextIndex = 0;
  const sccs = [];

  for (const startNode of unprocessedNodes) {
    if (indexOf.has(startNode)) continue;

    // Iterative Tarjan: an explicit frame stack replaces recursion. Each frame
    // tracks the node and how far it has advanced through its dependents.
    indexOf.set(startNode, nextIndex);
    lowlink.set(startNode, nextIndex);
    nextIndex += 1;
    sccStack.push(startNode);
    onStack.add(startNode);
    const callStack = [{ node: startNode, dependents: edges.get(startNode) || [], i: 0 }];

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];

      if (frame.i < frame.dependents.length) {
        const w = frame.dependents[frame.i];
        frame.i += 1;

        if (!unprocessedSet.has(w)) continue;

        if (!indexOf.has(w)) {
          // Tree edge — descend into w.
          indexOf.set(w, nextIndex);
          lowlink.set(w, nextIndex);
          nextIndex += 1;
          sccStack.push(w);
          onStack.add(w);
          callStack.push({ node: w, dependents: edges.get(w) || [], i: 0 });
        } else if (onStack.has(w)) {
          // Back/cross edge to a node still on the SCC stack.
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node), indexOf.get(w)));
        }
        // Edge to a visited node NOT on the stack points into a completed
        // SCC — it cannot form a cycle, so it is ignored.
      } else {
        // All dependents of frame.node examined — pop the frame.
        callStack.pop();
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1].node;
          lowlink.set(parent, Math.min(lowlink.get(parent), lowlink.get(frame.node)));
        }
        if (lowlink.get(frame.node) === indexOf.get(frame.node)) {
          // frame.node is the root of an SCC — pop it off the SCC stack.
          const scc = [];
          for (;;) {
            const w = sccStack.pop();
            onStack.delete(w);
            scc.push(w);
            if (w === frame.node) break;
          }
          sccs.push(scc);
        }
      }
    }
  }

  const cycleGroups = sccs
    .filter(
      (scc) =>
        scc.length > 1 || (edges.get(scc[0]) || []).includes(scc[0])
    )
    .map((scc) => [...scc].sort()); // Deterministic ordering within cycle group

  // Sort cycle groups deterministically (by first element)
  cycleGroups.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  return {
    order,
    cycles: cycleGroups
  };
}
