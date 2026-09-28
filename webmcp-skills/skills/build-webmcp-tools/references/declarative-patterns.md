<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Declarative WebMCP Patterns (HTML Forms API)

This guide covers the WebMCP Declarative API, which transforms standard HTML `<form>` elements into AI-callable tools directly via markup attributes.

---

## 1. Markup Attributes & Audit Rules

The browser derives a standard JSON Schema tool definition directly from HTML forms annotated with WebMCP attributes:

| Attribute                  | Scope         | Requirement & Audit Behavior                                                                                                                                                                |
| :------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`toolname`**             | `<form>`      | **Mandatory paired with `tooldescription`**. Must be an action-oriented name (≤ 30 chars). Missing either attribute causes tool registration to fail and triggers a Lighthouse audit error. |
| **`tooldescription`**      | `<form>`      | **Mandatory paired with `toolname`**. Natural-language description (≤ 500 chars) explaining what the tool does and when to use it.                                                          |
| **`toolautosubmit`**       | `<form>`      | Optional. When present, allows the browser agent to submit the form immediately without waiting for the user to click submit.                                                               |
| **`toolparamdescription`** | Form controls | Optional. Custom description for an `<input>`, `<select>`, `<textarea>`, or `<fieldset>`.                                                                                                   |

### Field Name & Description Fallback Rules

1. **Unique `name` Attribute Required**: Every form field intended for tool input **must** have a unique `name`. Required fields lacking a `name` fail Lighthouse schema validity audits.
2. **Parameter Description Fallback Chain**:
   ```
   toolparamdescription attribute  -->  associated <label> text  -->  aria-description
   ```
   If none of these are present on an optional field, Lighthouse issues an audit warning. Always supply clear `<label>` elements or `toolparamdescription`.
3. **Select Options**: `<select>` dropdowns are automatically converted into JSON Schema `enum` arrays with `anyOf` pairings (`const` for value, `title` for option label text).

---

## 2. Complete Example: Declarative Booking Form

```html
<form
  toolname="reserve_restaurant_table"
  tooldescription="Reserves a dining table for a specified party size, date, and seating preference."
  action="/api/reservations"
  method="POST"
>
  <!-- Party size with explicit numeric bounds -->
  <label for="party_size">Number of Guests</label>
  <input
    type="number"
    id="party_size"
    name="party_size"
    min="1"
    max="12"
    toolparamdescription="Total number of dining guests (1 to 12)"
    required
  />

  <!-- Reservation date/time -->
  <label for="reservation_time">Date and Time</label>
  <input
    type="datetime-local"
    id="reservation_time"
    name="reservation_time"
    toolparamdescription="Desired reservation date and time"
    required
  />

  <!-- Grouped radio choices with fieldset parameter description -->
  <fieldset toolparamdescription="Preferred dining area location">
    <legend>Seating Preference</legend>
    <label><input type="radio" name="seating_area" value="indoor" checked /> Indoor Dining</label>
    <label><input type="radio" name="seating_area" value="patio" /> Outdoor Patio</label>
    <label><input type="radio" name="seating_area" value="bar" /> High-Top Bar</label>
  </fieldset>

  <!-- Special requests -->
  <label for="notes">Special Requests</label>
  <textarea
    id="notes"
    name="notes"
    toolparamdescription="Allergies, dietary restrictions, or celebration notes"
  ></textarea>

  <button type="submit">Confirm Reservation</button>
</form>
```

---

## 3. Handling Submissions & Returning Payloads to the Agent

When an AI agent invokes the declarative tool, the browser populates the form fields and triggers a standard `submit` event on the form.

The `SubmitEvent` includes two WebMCP properties:

- **`event.agentInvoked`** (`boolean`): `true` if an AI agent initiated the submit action; `false` if submitted manually by the user.
- **`event.respondWith(promise)`**: Intercepts the submit to return a structured JSON result (or validation error) back to the agent without triggering page navigation. **Must call `event.preventDefault()` first**.

```javascript
const reservationForm = document.querySelector('form[toolname="reserve_restaurant_table"]');

reservationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.target);
  const partySize = parseInt(formData.get("party_size"), 10);
  const reservationTime = formData.get("reservation_time");

  // 1. Validate inputs (collect structured field errors matching demos/french-bistro)
  const validationErrors = [];
  if (!partySize || partySize < 1) {
    validationErrors.push({
      field: "party_size",
      value: formData.get("party_size"),
      message: "Party size must be at least 1 guest.",
    });
  }
  if (!reservationTime) {
    validationErrors.push({
      field: "reservation_time",
      value: formData.get("reservation_time"),
      message: "Reservation date and time is required.",
    });
  }

  if (validationErrors.length > 0) {
    if (event.agentInvoked) {
      // Return structured validation errors directly to the model so the agent can self-correct specific fields
      event.respondWith(Promise.resolve(validationErrors));
    }
    return;
  }

  // 2. Perform API reservation call
  const submissionPromise = fetch("/api/reservations", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(formData)),
    headers: { "Content-Type": "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Reservation failed.");
      }
      return res.json();
    })
    .then((data) => {
      // Update UI state visually
      document.querySelector("#confirmation-banner").textContent =
        `Reserved for ${partySize} guests on ${reservationTime}. Confirmation: ${data.confirmationCode}`;

      // Return concise payload to agent under 1.5K character budget
      return `Reservation confirmed! Confirmation code: ${data.confirmationCode}.`;
    })
    .catch((err) => {
      // Re-throw actionable Error so submissionPromise rejects and signals an execution failure to the agent
      throw new Error(
        `Reservation failed: ${err.message}. Please verify availability with the user.`,
      );
    });

  // 3. Resolve to the agent
  if (event.agentInvoked) {
    event.respondWith(submissionPromise);
  }
});
```

> **Critical WebMCP Guidance: Resolving vs. Rejecting Errors**:
>
> - **Declarative forms (`<form>`)**: As implemented in official Chrome docs and GoogleChromeLabs reference demos (`demos/french-bistro`), field validation errors are returned as structured payloads (e.g. `[{ field, value, message }]`) via `event.respondWith(validationErrors)` so the model learns exactly which form fields need correction. Rejecting (`Promise.reject`) discards the field details into a generic `DOMException: UnknownError`. Reserve rejection only for fatal operational crashes.
> - **Native imperative tools (`registerTool`)**: In raw `execute()` callbacks, the W3C WebMCP spec discards rejection reasons and rejects `executeTool()` with `UnknownError`. Return structured error payloads (e.g. `{ error: "...", code: "..." }`) so the agent can read the failure and proceed.
> - **React tools (`useWebMCP`)**: In `use-webmcp-tool`, throw `new Error(...)`. The hook's `try/catch` catches the error and internally resolves `{ content: [...], isError: true }`, giving you the ergonomics of standard JavaScript exceptions while ensuring the agent receives the error text and error flag.

---

## 4. Window Lifecycle Events (`toolactivated` and `toolcancel`)

When an agent interacts with a declarative form, the browser dispatches lifecycle events to `window`. Listen to these events to adjust the UI dynamically (e.g., displaying an agent indicator or disabling conflicting controls):

```javascript
// Fired when the agent pre-fills the form fields
window.addEventListener("toolactivated", ({ toolName }) => {
  console.log(`Agent started interacting with tool: ${toolName}`);
  document.body.classList.add("agent-interacting");
  showLiveBanner(`AI assistant is filling in the ${toolName} form...`);
});

// Fired when the agent interaction is cancelled or form is reset
window.addEventListener("toolcancel", ({ toolName }) => {
  console.log(`Agent cancelled interaction with tool: ${toolName}`);
  document.body.classList.remove("agent-interacting");
  hideLiveBanner();
});
```

- Both events are non-cancelable and include `event.toolName`.

---

## 5. Visual Styling with CSS Pseudo-Classes

To keep the user in the loop, browser engines apply pseudo-classes when an agent is actively filling or submitting forms:

```css
/* Highlights the form currently being populated or inspected by an agent */
form:tool-form-active {
  outline: light-dark(#1a73e8, #8ab4f8) dashed 2px;
  outline-offset: 2px;
  background-color: rgba(26, 115, 232, 0.04);
}

/* Highlights the submit button when agent has filled fields and waits for user confirmation */
button:tool-submit-active,
input:tool-submit-active {
  outline: light-dark(#d93025, #f28b82) solid 2px;
  outline-offset: 2px;
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(217, 48, 37, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(217, 48, 37, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(217, 48, 37, 0);
  }
}
```

---

## 6. `toolautosubmit` Policy: Safe vs. Human-in-the-Loop

- **Include `toolautosubmit`**:
  - Read-only filters and catalog search queries.
  - Low-risk, non-destructive interactions (adding an item to a draft cart, updating display filters).
- **Omit `toolautosubmit` (Requires User Interaction)**:
  - Financial transactions (authorizing payment, submitting booking).
  - Account modifications (updating passwords, deleting profiles, clearing carts).
  - Sending messages or submitting official applications.
  - When omitted, the browser pre-fills fields, highlights the submit button with `:tool-submit-active`, and leaves final execution to the human user.
