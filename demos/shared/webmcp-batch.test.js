/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert';
import { resolveReferences, getNestedProperty, executeDeclarativeBatch, getSystemInstructions, getSystemInstruction } from './webmcp-batch.js';

test('getNestedProperty helper', () => {
  const obj = {
    a: 1,
    b: {
      c: 'hello',
      d: {
        e: true
      }
    }
  };

  assert.strictEqual(getNestedProperty(obj, 'a'), 1);
  assert.strictEqual(getNestedProperty(obj, 'b.c'), 'hello');
  assert.strictEqual(getNestedProperty(obj, 'b.d.e'), true);
  assert.strictEqual(getNestedProperty(obj, 'b.x'), undefined);
  assert.strictEqual(getNestedProperty(obj, 'y.z'), undefined);
  assert.strictEqual(getNestedProperty(null, 'a'), undefined);
});

test('resolveReferences basic and nested resolution', () => {
  const results = {
    step1: 'Medium',
    step2: {
      pizzaId: '12345',
      toppings: ['cheese', 'onion']
    }
  };

  // Basic string resolution
  assert.deepEqual(resolveReferences('$ref:step1', results), 'Medium');
  
  // Nested resolution
  assert.deepEqual(resolveReferences('$ref:step2.pizzaId', results), '12345');
  assert.deepEqual(resolveReferences('$ref:step2.toppings.1', results), 'onion');
  
  // Object resolution
  const inputObj = {
    size: '$ref:step1',
    toppings: ['$ref:step2.toppings.0', 'pepperoni'],
    extra: {
      id: '$ref:step2.pizzaId',
      staticVal: 'hello'
    }
  };

  const expectedObj = {
    size: 'Medium',
    toppings: ['cheese', 'pepperoni'],
    extra: {
      id: '12345',
      staticVal: 'hello'
    }
  };

  assert.deepEqual(resolveReferences(inputObj, results), expectedObj);
});

test('executeDeclarativeBatch execution and reference forwarding', async () => {
  const steps = [
    {
      id: 'stepA',
      tool: 'createPizza',
      args: { style: 'BBQ' }
    },
    {
      id: 'stepB',
      tool: 'addTopping',
      args: {
        pizza: '$ref:stepA.pizzaId',
        topping: '🍄'
      }
    }
  ];

  const db = {
    createdPizzas: []
  };

  const mockExecuteTool = async (tool, args) => {
    if (tool === 'createPizza') {
      const pizza = { pizzaId: 'pizza_999', style: args.style };
      db.createdPizzas.push(pizza);
      return pizza;
    }
    if (tool === 'addTopping') {
      return { status: 'success', pizzaId: args.pizza, topping: args.topping };
    }
    throw new Error(`Unknown tool: ${tool}`);
  };

  const outputs = await executeDeclarativeBatch(steps, mockExecuteTool);

  assert.strictEqual(outputs.length, 2);
  assert.strictEqual(outputs[0].success, true);
  assert.deepEqual(outputs[0].result, { pizzaId: 'pizza_999', style: 'BBQ' });
  
  assert.strictEqual(outputs[1].success, true);
  assert.deepEqual(outputs[1].args, { pizza: 'pizza_999', topping: '🍄' });
  assert.deepEqual(outputs[1].result, { status: 'success', pizzaId: 'pizza_999', topping: '🍄' });
});

test('executeDeclarativeBatch failure halts execution', async () => {
  const steps = [
    {
      id: 'step1',
      tool: 'succeed',
      args: {}
    },
    {
      id: 'step2',
      tool: 'fail',
      args: {}
    },
    {
      id: 'step3',
      tool: 'succeed',
      args: {}
    }
  ];

  let step3Called = false;
  const mockExecuteTool = async (tool, args) => {
    if (tool === 'succeed') {
      if (tool === 'step3') step3Called = true;
      return 'ok';
    }
    if (tool === 'fail') {
      throw new Error('Forced failure');
    }
  };

  const outputs = await executeDeclarativeBatch(steps, mockExecuteTool);

  assert.strictEqual(outputs.length, 2);
  assert.strictEqual(outputs[0].success, true);
  assert.strictEqual(outputs[1].success, false);
  assert.strictEqual(outputs[1].error, 'Forced failure');
  assert.strictEqual(step3Called, false);
});

test('getSystemInstructions formats tool schemas and filters execute_batch', () => {
  const tools = [
    {
      name: 'execute_batch',
      description: 'Execute batch',
      inputSchema: '{"type":"object"}'
    },
    {
      name: 'search',
      description: 'Search products',
      inputSchema: JSON.stringify({
        type: 'object',
        properties: { query: { type: 'string' } }
      })
    }
  ];

  const instructions = getSystemInstructions(tools);
  assert(Array.isArray(instructions));
  assert.strictEqual(getSystemInstruction, getSystemInstructions);

  const jsonBlockIndex = instructions.findIndex(line => line === '```json');
  assert(jsonBlockIndex !== -1);
  const jsonContent = instructions[jsonBlockIndex + 1];
  const parsedTools = JSON.parse(jsonContent);

  assert.strictEqual(parsedTools.length, 1);
  assert.strictEqual(parsedTools[0].name, 'search');
  assert.strictEqual(parsedTools[0].description, 'Search products');
  assert.deepEqual(parsedTools[0].inputSchema, {
    type: 'object',
    properties: { query: { type: 'string' } }
  });
});
