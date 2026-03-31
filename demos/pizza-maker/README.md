# WebMCP zaMaker! | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/pizza-maker

This project demonstrates a **WebMCP** implementation for an interactive pizza builder. It allows an AI agent to interact directly with the pizza creation process, such as adding toppings, changing styles, and adjusting sizes by registering custom tools.

## 🛠️ How It Works

Unlike declarative forms, this demo uses the `navigator.modelContext.registerTool` API in `script.js` to expose fine-grained control over the application state to an AI agent.

```javascript
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
      count: { type: 'integer', minimum: 1 },
    },
    required: ['topping'],
  },
  execute: ({ topping, count }) => {
    addTopping(topping, size, count);
    return `Added ${count} ${topping} topping(s)`;
  },
});
```

When an AI agent is active, it can:
- **Change Size**: Adjust the pizza size from Small to "Too Large".
- **Set Style**: Switch between Classic, Bianca, BBQ, Pesto, and Wales themes.
- **Manage Layers**: Add or remove sauce and cheese.
- **Add/Remove Toppings**: Place various emoji-based toppings on the pizza with realistic animations.
- **Share**: Generate a shareable URL that encodes the current pizza state.

## ✨ Visual Feedback

The UI includes a specific class `webmcp-supported` that hides the manual controls when a WebMCP-compatible environment is detected, allowing the AI agent to take full control of the "zaMaker" experience.
