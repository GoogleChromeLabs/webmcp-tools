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

  // Find strongly connected components (cycles) using Tarjan's algorithm
  // But we only care about nodes that weren't processed
  // Build subgraph of unprocessed nodes
  const unprocessedSet = new Set(unprocessedNodes);

  // For simple cycle detection, find nodes with remaining in-degree > 0
  // These are nodes participating in cycles
  const cycleGroups = [];
  const visitedForCycle = new Set();

  for (const startNode of unprocessedNodes) {
    if (visitedForCycle.has(startNode)) continue;

    // DFS to find all nodes in this cycle component
    const cycleGroup = [];
    const stack = [startNode];

    while (stack.length > 0) {
      const node = stack.pop();
      if (visitedForCycle.has(node)) continue;
      visitedForCycle.add(node);
      cycleGroup.push(node);

      // Add unprocessed neighbors
      const neighbors = edges.get(node) || [];
      for (const neighbor of neighbors) {
        if (unprocessedSet.has(neighbor) && !visitedForCycle.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    if (cycleGroup.length > 0) {
      cycleGroup.sort(); // Deterministic ordering within cycle group
      cycleGroups.push(cycleGroup);
    }
  }

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
