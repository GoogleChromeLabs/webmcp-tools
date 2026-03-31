# Order Tracking | WebMCP Declarative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/order-tracking

This project demonstrates a **WebMCP** implementation for a simulated e-commerce order tracking and returns system. It allows an AI agent to query a user's order history based on timeframes and initiate product returns on their behalf using declarative tool definitions.

## 🛠️ How It Works

This demo uses **Declarative WebMCP** (`toolname`, `tooldescription`, and `toolautosubmit` attributes on `<form>` elements) to expose its functionalities to an AI agent. 

```html
<form toolname="get_order_status"
      tooldescription="Retrieve the current shipping status and location for a user's orders within a given timeframe."
      toolautosubmit action="history.html" method="GET">
    <!-- <select> with toolparamdescription... -->
</form>
```

When the tool is activated by an AI agent, it can interact with the following features:

- **Get Order Status**: A declarative form on the main dashboard (`index.html`) that allows an agent to query orders by selecting a specific `timeframe`. Submitting it navigates to the `history.html` page.
- **Initiate Return**: On the order history page, delivered orders expose a second declarative form that allows the agent to start a return given an `order_id` and a `reason` for the return. Submitting it navigates to the `result.html` page.
- **Dynamic Context**: The `history.html` page dynamically updates its embedded JSON-LD (`<script type="application/ld+json">`) based on the query parameters, ensuring the AI model has the correct contextual text.
