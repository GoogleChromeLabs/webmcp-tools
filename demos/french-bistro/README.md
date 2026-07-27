# Le Petit Bistro | WebMCP Declarative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/

This project demonstrates a **WebMCP** implementation for a restaurant reservation system. It allows an AI agent to interact directly with a web-based booking form, validating and submitting data on behalf of the user using declarative tool definitions.

It imports the [WebMCP Polyfill](../shared/webmcp-polyfill.js) so that WebMCP is fully simulated in browsers that do not support it yet natively.

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


### Variation

When visiting `index.html?crossdocument`, the form submission triggers a navigation to `result.html`. This can be used to demonstrate cross-document tool execution.

With `index.html?toolautosubmit` (or `index.html?crossdocument&toolautosubmit`), the `toolautosubmit` attribute is set on the form, which lets the agent submit the form on the user's behalf after filling it out, without requiring the user to check it manually before submitting. Otherwise when the agent finishes filling out the form, the browser brings the submit button into focus, and the agent should then tell the user to check the form contents, and submit it manually.

With `index.html?sharedworker`, the demo uses a `SharedWorker` to manage the in-page AI agent's state and message history. This is particularly useful for maintaining continuity across page navigations (e.g., when combined with `?crossdocument`). It is possible thanks to [`extendedLifetime: true`](https://developer.mozilla.org/docs/Web/API/SharedWorker/SharedWorker#extendedlifetime).

With `index.html?agentiframe`, the in-page AI agent lives in an `<iframe>`.

Testing WebMCP audit failures can be streamlined by using specific URL parameters to simulate common tool configuration issues:
- `index.html?notoolname` removes `toolname` form attribute
- `index.html?notooldescription` removes `tooldescription` form attribute.
- `index.html?notoolparamdescription` removes `toolparamdescription` attribute from elements
- `index.html?nolabelfor` removes `for` attribute from `<label>` elements
- `index.html?norequiredname` removes `name` attribute from required form-associated elements
