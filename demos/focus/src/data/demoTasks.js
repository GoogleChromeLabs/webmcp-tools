// Demo data — 13 tasks, deterministic and never stale.
//
// Deadlines are RELATIVE to a single load-time anchor, so the scenario reads the
// same ("due soon", "later today", "tomorrow", "no deadline") no matter when it
// is opened. Reset Demo rebuilds from the SAME anchor, so the state is
// byte-identical after every reset.
//
// Shape: ~13 tasks, ~375m of work, only 120m available (deliberately overloaded),
// multiple dependency chains, several meaningful deadlines, one obvious
// bottleneck (management-ch7 unlocks quiz-prep AND pack-backpack).

const MIN = 60 * 1000;

/** @param {Date} [now] anchor instant; all deadlines are offsets from it */
export function buildDemoTasks(now = new Date()) {
  const t = now.getTime();
  const at = (offsetMin) => new Date(t + offsetMin * MIN).toISOString();

  // Human-readable relative semantics, not hard-coded calendar dates.
  const due = {
    soon: at(90),        // < 2 hours from now
    laterToday: at(300), // ~5 hours from now
    tonight: at(360),    // this evening
    tomorrow: at(1440),  // next day
    in2d: at(2880),
    in3d: at(4320),
  };

  return [
    // School
    {
      id: "management-ch7", title: "Finish Management Chapter 7",
      priority: "high", status: "backlog", estimatedMinutes: 25,
      dueAt: due.tomorrow, dependencies: [], tags: ["school"],
    },
    {
      id: "quiz-prep", title: "Study for Quiz",
      priority: "critical", status: "backlog", estimatedMinutes: 45,
      dueAt: due.tonight, dependencies: ["management-ch7"], tags: ["school"],
    },
    {
      id: "complete-quiz", title: "Complete Quiz",
      priority: "critical", status: "backlog", estimatedMinutes: 30,
      dueAt: due.laterToday, dependencies: ["quiz-prep"], tags: ["school"],
    },
    {
      id: "project-intro", title: "Write Project Introduction",
      priority: "high", status: "backlog", estimatedMinutes: 40,
      dueAt: due.in2d, dependencies: [], tags: ["school"],
    },
    {
      id: "math-assignment", title: "Complete Math Assignment",
      priority: "medium", status: "backlog", estimatedMinutes: 35,
      dueAt: due.tomorrow, dependencies: ["complete-quiz"], tags: ["school"],
    },
    {
      id: "read-article", title: "Read Research Article",
      priority: "medium", status: "backlog", estimatedMinutes: 20,
      dueAt: null, dependencies: [], tags: ["school"],
    },
    {
      id: "presentation-prep", title: "Prepare Presentation",
      priority: "high", status: "backlog", estimatedMinutes: 50,
      dueAt: due.in3d, dependencies: ["project-intro"], tags: ["school"],
    },
    {
      id: "email-teacher", title: "Email Teacher About Extension",
      priority: "medium", status: "backlog", estimatedMinutes: 10,
      dueAt: due.soon, dependencies: [], tags: ["school"],
    },
    // Life
    {
      id: "clean-room", title: "Clean Room",
      priority: "low", status: "backlog", estimatedMinutes: 30,
      dueAt: null, dependencies: [], tags: ["life"],
    },
    {
      id: "laundry", title: "Do Laundry",
      priority: "low", status: "backlog", estimatedMinutes: 45,
      dueAt: null, dependencies: ["clean-room"], tags: ["life"],
    },
    {
      id: "workout", title: "Workout",
      priority: "medium", status: "backlog", estimatedMinutes: 20,
      dueAt: null, dependencies: [], tags: ["life"],
    },
    {
      id: "shower", title: "Shower",
      priority: "medium", status: "backlog", estimatedMinutes: 15,
      dueAt: null, dependencies: ["workout"], tags: ["life"],
    },
    {
      id: "pack-backpack", title: "Pack Backpack",
      priority: "medium", status: "backlog", estimatedMinutes: 10,
      dueAt: due.tonight, dependencies: ["management-ch7", "clean-room"], tags: ["life"],
    },
  ];
}

// Fixed for the process → Reset Demo reproduces the exact same timestamps.
export const DEMO_ANCHOR = new Date();

export const TASKS = buildDemoTasks(DEMO_ANCHOR);

export const DEMO_CONTEXT = {
  availableMinutes: 120,
  overloadLevel: "high",
};