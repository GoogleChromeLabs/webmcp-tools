import test from 'node:test';
import assert from 'node:assert/strict';
import { topologicalSort } from '../src/store/dependencyEngine.js';

// Test 1: linear chain (prereq precedes dependent)
test('linear chain', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: ['b'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.order, ['a', 'b', 'c']);
  assert.deepStrictEqual(result.cycles, []);
});

// Test 2: branching (one parent -> two dependents, both after parent)
test('branching', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: ['a'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.cycles, []);
  assert.strictEqual(result.order.indexOf('a'), 0); // a comes first
  assert.ok(result.order.indexOf('b') > result.order.indexOf('a'));
  assert.ok(result.order.indexOf('c') > result.order.indexOf('a'));
});

// Test 3: multiple parents (node with two prereqs appears after both)
test('multiple parents', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: [] },
    { id: 'c', dependencies: ['a', 'b'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.cycles, []);
  assert.ok(result.order.indexOf('c') > result.order.indexOf('a'));
  assert.ok(result.order.indexOf('c') > result.order.indexOf('b'));
});

// Test 4: disconnected components preserved in output
test('disconnected components', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: [] },
    { id: 'd', dependencies: ['c'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.cycles, []);
  assert.strictEqual(result.order.length, 4);
  assert.ok(result.order.indexOf('b') > result.order.indexOf('a'));
  assert.ok(result.order.indexOf('d') > result.order.indexOf('c'));
});

// Test 5: cycle detection (A->B, B->A)
test('cycle detection A <-> B', () => {
  const tasks = [
    { id: 'a', dependencies: ['b'] },
    { id: 'b', dependencies: ['a'] },
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order.length, 0);
  assert.strictEqual(result.cycles.length, 1);
  assert.ok(result.cycles[0].includes('a'));
  assert.ok(result.cycles[0].includes('b'));
});

// Test 6: self-cycle
test('self-cycle', () => {
  const tasks = [
    { id: 'a', dependencies: ['a'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.order, []);
  assert.strictEqual(result.cycles.length, 1);
  assert.deepStrictEqual(result.cycles[0], ['a']);
});

// Test 7: invalid dependency reference ignored
test('invalid dependency reference ignored', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: ['a', 'nonexistent'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.cycles, []);
  assert.strictEqual(result.order.indexOf('a') < result.order.indexOf('b'), true);
});

// Test 8: determinism
test('determinism', () => {
  const tasks = [
    { id: 'a', dependencies: [], priority: 'high' },
    { id: 'b', dependencies: [], priority: 'medium' },
    { id: 'c', dependencies: [], priority: 'low' },
  ];
  const result1 = topologicalSort(tasks);
  const result2 = topologicalSort(tasks);
  assert.deepStrictEqual(result1, result2);
});

// Test 9: empty input
test('empty input', () => {
  const result = topologicalSort([]);
  assert.deepStrictEqual(result.order, []);
  assert.deepStrictEqual(result.cycles, []);
});

// Test 10: single node
test('single node', () => {
  const tasks = [{ id: 'a', dependencies: [] }];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.order, ['a']);
  assert.deepStrictEqual(result.cycles, []);
});

// Additional test: node whose dependency is in a cycle
// Under real Tarjan SCC, c merely DEPENDS on the cycle (a <-> b) — it is not
// itself a cycle member, so it must NOT appear in cycles.
test('node depending on cycle member', () => {
  const tasks = [
    { id: 'a', dependencies: ['b'] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: ['a'] },
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order.length, 0);
  assert.strictEqual(result.cycles.length, 1);
  assert.deepStrictEqual(result.cycles[0], ['a', 'b']);
  assert.ok(!result.cycles[0].includes('c'), 'c depends on the cycle but is not in it');
});

// Additional test: two disjoint cycles are detected as separate SCCs
test('two disjoint cycles are separate SCCs', () => {
  const tasks = [
    { id: 'a', dependencies: ['b'] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: ['d'] },
    { id: 'd', dependencies: ['c'] },
    { id: 'e', dependencies: ['a'] }, // depends on cycle 1, not a member
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order.length, 0);
  assert.strictEqual(result.cycles.length, 2);
  assert.deepStrictEqual(result.cycles[0], ['a', 'b']);
  assert.deepStrictEqual(result.cycles[1], ['c', 'd']);
  assert.ok(!result.cycles[0].includes('e'));
});

// Additional test: longer cycle
test('longer cycle', () => {
  const tasks = [
    { id: 'a', dependencies: ['c'] },
    { id: 'b', dependencies: ['a'] },
    { id: 'c', dependencies: ['b'] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.order, []);
  assert.strictEqual(result.cycles.length, 1);
  assert.ok(result.cycles[0].includes('a'));
  assert.ok(result.cycles[0].includes('b'));
  assert.ok(result.cycles[0].includes('c'));
});

// Additional test: dueAt ordering
test('dueAt ordering', () => {
  const tasks = [
    { id: 'a', dependencies: [], dueAt: '2026-12-01' },
    { id: 'b', dependencies: [], dueAt: '2026-10-01' },
    { id: 'c', dependencies: [], dueAt: '2026-11-01' },
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order[0], 'b');
  assert.strictEqual(result.order[1], 'c');
  assert.strictEqual(result.order[2], 'a');
});

// Additional test: null dueAt comes last
test('null dueAt comes last', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: [], dueAt: '2026-10-01' },
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order[0], 'b');
  assert.strictEqual(result.order[1], 'a');
});

// Additional test: priority ordering
test('priority ordering', () => {
  const tasks = [
    { id: 'a', dependencies: [], priority: 'medium' },
    { id: 'b', dependencies: [], priority: 'high' },
    { id: 'c', dependencies: [], priority: 'critical' },
    { id: 'd', dependencies: [], priority: 'low' },
  ];
  const result = topologicalSort(tasks);
  assert.strictEqual(result.order[0], 'c');
  assert.strictEqual(result.order[1], 'b');
  assert.strictEqual(result.order[2], 'a');
  assert.strictEqual(result.order[3], 'd');
});

// Additional test: lexicographic tie-breaker
test('lexicographic tie-breaker', () => {
  const tasks = [
    { id: 'z', dependencies: [] },
    { id: 'a', dependencies: [] },
    { id: 'm', dependencies: [] },
  ];
  const result = topologicalSort(tasks);
  assert.deepStrictEqual(result.order, ['a', 'm', 'z']);
});
