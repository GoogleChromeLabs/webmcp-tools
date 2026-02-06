# Le Petit Bistro | WebMCP Declarative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro

This project demonstrates a **WebMCP** implementation for a restaurant reservation system. It allows an AI agent to interact directly with a web-based booking form, validating and submitting data on behalf of the user using declarative tool definitions.

## 🛠️ How It Works

The form in `index.html` is tagged with a `toolname` and a `tooldescription`. Each input field provides a `toolparamdescription` which acts as a prompt for the AI agent to know what data to collect.

```html
<form id="reservationForm" toolname="book_table_le_petit_bistro" tooldescription=...>
  <input name="name" toolparamdescription="Customer's full name (min 2 chars)" />
</form>
```

When the tool is activated by an AI agent:

1. **Validation**: The `script.js` listens for the `toolactivated` event to run pre-submission checks.
2. **Visual Cues**: CSS classes like `*:tool-form-active` and `*:tool-submit-active` provide visual feedback to the user that an agent is currently manipulating the form.
3. **Submission**: On submit, if errors exist, they are returned to the Agent as an array. If successful, the confirmation text from the modal is returned to the Agent.
