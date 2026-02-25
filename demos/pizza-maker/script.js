/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const pizza = document.getElementById('pizza-container');
const sizeText = document.getElementById('size-text');
let currentStyle = 'Classic';

const sizes = {
  Small: 0.8,
  Medium: 1.0,
  Large: 1.2,
  'Extra Large': 1.8,
};

const styles = {
  Classic: { crust: '#edb44e', sauce: '#d32f2f', cheese: '#ffd54f' },
  Bianca: { crust: '#e6c27b', sauce: '#fff3e0', cheese: '#fff9c4' },
  BBQ: { crust: '#d4a342', sauce: '#5d4037', cheese: '#ffab00' },
  Pesto: { crust: '#c5e1a5', sauce: '#388e3c', cheese: '#f1f8e9' },
};

function setPizzaStyle(styleName) {
  const style = styles[styleName];
  if (style) {
    currentStyle = styleName;
    document.documentElement.style.setProperty('--crust', style.crust);
    document.documentElement.style.setProperty('--sauce', style.sauce);
    document.documentElement.style.setProperty('--cheese', style.cheese);
  }
}

function changeSize(scale, name) {
  pizza.style.transform = `perspective(1000px) rotateX(25deg) scale(${scale})`;
  if (sizeText) sizeText.innerText = name;
}

function toggleLayer(layerId, action = 'toggle') {
  const layer = document.getElementById(layerId);
  if (action === 'add') {
    layer.style.display = 'block';
  } else if (action === 'remove') {
    layer.style.display = 'none';
  } else {
    layer.style.display = layer.style.display === 'block' ? 'none' : 'block';
  }
}

function addTopping(emoji, size = 'Medium', count = 5) {
  for (let i = 0; i < count; i++) {
    const topping = document.createElement('div');
    topping.className = 'topping';
    topping.innerHTML = `<span>${emoji}</span>`;
    const radius = 170;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = 165 + dist * Math.cos(angle);
    const y = 142 + dist * Math.sin(angle);
    topping.style.left = `${x}px`;
    topping.style.top = `${y}px`;

    const scale = sizes[size] || '1.0';
    topping.style.transform = `rotate(${Math.random() * 90 - 45}deg) scale(${scale})`;
    pizza.appendChild(topping);
  }
}

function removeLastTopping() {
  const toppings = document.querySelectorAll('.topping');
  if (toppings.length > 0) toppings[toppings.length - 1].remove();
}

function removeTopping(emoji, all = false) {
  const toppings = Array.from(document.querySelectorAll('.topping'));
  if (all) {
    let removed = false;
    toppings.forEach((t) => {
      if (t.innerText === emoji) {
        t.remove();
        removed = true;
      }
    });
    return removed;
  } else {
    for (let i = toppings.length - 1; i >= 0; i--) {
      if (toppings[i].innerText === emoji) {
        toppings[i].remove();
        return true;
      }
    }
  }
  return false;
}

function resetPizza() {
  document.querySelectorAll('.topping').forEach((t) => t.remove());
  document.getElementById('sauce-layer').style.display = 'none';
  document.getElementById('cheese-layer').style.display = 'none';
  changeSize(1.0, 'Medium');
  setPizzaStyle('Classic');
}

function getPizzaState() {
  const sauceVisible = document.getElementById('sauce-layer').style.display === 'block';
  const cheeseVisible = document.getElementById('cheese-layer').style.display === 'block';
  const toppings = Array.from(document.querySelectorAll('.topping span')).map(
    (s) => s.innerText,
  );

  return {
    size: sizeText.innerText,
    style: currentStyle,
    layers: { sauce: sauceVisible, cheese: cheeseVisible },
    toppings: toppings,
  };
}

function sharePizza() {
  const state = getPizzaState();
  const jsonString = JSON.stringify(state);
  // Correctly handle Unicode (emojis) with btoa
  const base64 = btoa(encodeURIComponent(jsonString));

  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  params.set('share', base64);
  url.search = params.toString();
  return url.toString();
}

function loadPizzaStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const base64 = params.get('share');
  if (!base64) return;

  try {
    const jsonString = decodeURIComponent(escape(atob(base64)));
    const state = JSON.parse(jsonString);

    if (state.size && sizes[state.size]) changeSize(sizes[state.size], state.size);
    if (state.style) setPizzaStyle(state.style);
    if (state.layers) {
      if (state.layers.sauce) toggleLayer('sauce-layer', 'add');
      if (state.layers.cheese) toggleLayer('cheese-layer', 'add');
    }
    if (state.toppings) {
      state.toppings.forEach((t) => addTopping(t));
    }
  } catch (e) {
    console.warn('Failed to load pizza state from URL', e);
  }
}

// Load state on startup
loadPizzaStateFromURL();

if (window.navigator.modelContext) {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('showButtons')) {
    document.body.classList.add('webmcp-supported');
  }

  navigator.modelContext.registerTool({
    name: 'set_pizza_size',
    description: 'Set the size of the pizza',
    inputSchema: {
      type: 'object',
      properties: {
        size: { type: 'string', enum: ['Small', 'Medium', 'Large', 'Extra Large'] },
      },
      required: ['size'],
    },
    execute: ({ size }) => {
      if (sizes[size]) {
        changeSize(sizes[size], size);
        return `Changed pizza size to ${size}`;
      }
      return `Invalid size: ${size}`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'set_pizza_style',
    description: 'Set the style of the pizza (colors/theme)',
    inputSchema: {
      type: 'object',
      properties: {
        style: { type: 'string', enum: ['Classic', 'Bianca', 'BBQ', 'Pesto'] },
      },
      required: ['style'],
    },
    execute: ({ style }) => {
      if (styles[style]) {
        setPizzaStyle(style);
        return `Changed pizza style to ${style}`;
      }
      return `Invalid style: ${style}`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'toggle_layer',
    description: 'Control pizza layers (sauce, cheese). Use "add", "remove", or "toggle".',
    inputSchema: {
      type: 'object',
      properties: {
        layer: { type: 'string', enum: ['sauce-layer', 'cheese-layer'] },
        action: { type: 'string', enum: ['add', 'remove', 'toggle'] },
      },
      required: ['layer'],
    },
    execute: ({ layer, action }) => {
      toggleLayer(layer, action);
      return `Performed ${action || 'toggle'} on layer: ${layer}`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'add_topping',
    description: 'Add one or more toppings to the pizza',
    inputSchema: {
      type: 'object',
      properties: {
        topping: {
          type: 'string',
          enum: ['🍕', '🍄', '🌿', '🍍', '🫑', '🥓', '🧅', '🫒', '🌽', '🌶️'],
        },
        size: { type: 'string', enum: ['Small', 'Medium', 'Large', 'Extra Large'] },
        count: {
          type: 'integer',
          minimum: 1,
          description: 'Number of toppings to add',
        },
      },
      required: ['topping'],
    },
    execute: ({ topping, size, count }) => {
      addTopping(topping, size, count);
      return `Added ${count} ${topping} topping(s)`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'remove_topping',
    description: 'Remove a specific topping from the pizza',
    inputSchema: {
      type: 'object',
      properties: {
        topping: {
          type: 'string',
          enum: ['🍕', '🍄', '🌿', '🍍', '🫑', '🥓', '🧅', '🫒', '🌽', '🌶️'],
        },
        all: {
          type: 'boolean',
          description: 'Remove all toppings of this type',
        },
      },
      required: ['topping'],
    },
    execute: ({ topping, all }) => {
      const removed = removeTopping(topping, all);
      if (all) {
        return removed ? `Removed all ${topping} toppings` : `No ${topping} toppings found`;
      }
      return removed ? `Removed topping: ${topping}` : `Topping ${topping} not found`;
    },
  });

  navigator.modelContext.registerTool({
    name: 'manage_pizza',
    description: 'Manage pizza state',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['remove_last', 'reset'] },
      },
      required: ['action'],
    },
    execute: ({ action }) => {
      if (action === 'remove_last') {
        removeLastTopping();
        return 'Removed last topping';
      } else if (action === 'reset') {
        resetPizza();
        return 'Reset pizza';
      }
      return 'Unknown action';
    },
  });

  navigator.modelContext.registerTool({
    name: 'share_pizza',
    description: 'Get a shareable URL for the current pizza creation',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: () => {
      const url = sharePizza();
      return `Share URL: ${url}`;
    },
  });
}

// Expose functions to global scope for HTML onclick handlers
window.changeSize = changeSize;
window.setPizzaStyle = setPizzaStyle;
window.toggleLayer = toggleLayer;
window.addTopping = addTopping;
window.removeLastTopping = removeLastTopping;
window.resetPizza = resetPizza;
window.sharePizza = sharePizza;
