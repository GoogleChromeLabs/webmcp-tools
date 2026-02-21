# PolicyCheck Trust Verification | WebMCP Imperative Demo

Live Demo: https://policycheck.tools/webmcp-demo

This demo introduces **user-installed third-party trust verification** as a WebMCP tool category. It shows how an AI agent shopping on behalf of a user can verify a seller's policies *before* completing a purchase, using the `check_seller_policy` tool alongside standard e-commerce tools.

## What It Demonstrates

A simulated e-commerce store (VoltGear Electronics) alongside a user-installed trust verification tool:

| Tool | Source | Type | Description |
|------|--------|------|-------------|
| `browse_products` | Seller's page | Seller | Browse the product catalog |
| `add_to_cart` | Seller's page | Seller | Add items to cart |
| `checkout` | Seller's page | Seller | Complete purchase |
| `check_seller_policy` | **User's PolicyCheck extension** | Trust Layer | Analyze seller policies for risk before purchase |

The `check_seller_policy` tool is the key addition. It calls [PolicyCheck](https://policycheck.tools) (a seller policy risk intelligence service) to return:

- **Risk score** (0-10) and **risk level** (low/medium/high/critical)
- **Buyer protection rating** (A+ through F)
- **Detected risk factors** with severity levels (binding arbitration, no-refund clauses, liability caps, etc.)
- **Plain-language summary** for agent reasoning

## Architecture: User-Side vs Seller-Side

A critical design point: `check_seller_policy` is **not registered by the seller**. In production, it's provided by the user-installed [PolicyCheck Chrome extension](https://policycheck.tools), which injects the tool into any e-commerce page the user visits. The seller has no control over the analysis.

This demo co-locates all tools in one HTML page for simplicity, but the real-world architecture is:

- **Seller's page** registers: `browse_products`, `add_to_cart`, `checkout`
- **User's PolicyCheck extension** injects: `check_seller_policy`

The agent sees all tools via `listTools()` regardless of origin. PolicyCheck independently fetches and analyzes the seller's policies from its own servers — the seller cannot influence the risk assessment.

This separation is what makes the trust verification meaningful. If the seller controlled `check_seller_policy`, they could simply return "no risks found" for every query.

## Agent Workflow

Click **"Run Agent Purchase Flow"** to watch the agent:

1. **Discover tools** via `navigator.modelContextTesting.listTools()`
2. **Browse products** and find Wireless Headphones Pro ($249)
3. **Add to cart**
4. **Check seller policies** via `check_seller_policy` (the trust verification step)
5. **Make an informed decision** — chooses PayPal for buyer protection based on risk data
6. **Complete checkout** with risk-aware payment method

## How It Works

The demo uses the **imperative** WebMCP API:

```javascript
navigator.modelContext.registerTool({
  name: 'check_seller_policy',
  description: "Analyze a seller's policies to provide a risk assessment...",
  inputSchema: {
    type: 'object',
    properties: {
      seller_url: { type: 'string', description: 'The URL of the seller' },
      policy_text: { type: 'string', description: 'Raw policy text if available' }
    },
    required: ['seller_url']
  },
  annotations: { readOnlyHint: 'true' },
  async execute({ seller_url, policy_text }) {
    // Calls PolicyCheck API, falls back to mock data
  }
});
```

## Graceful Fallback

- **WebMCP enabled** (Chrome Canary 146+): Tools register via `navigator.modelContext` and execute through `navigator.modelContextTesting`
- **WebMCP not available**: Shows a dismissible overlay, then runs in mock mode with identical UI and workflow

## Why This Matters

Existing WebMCP demos show seller-provided tools. This demo introduces a new pattern: **user-installed third-party verification tools** that the agent can invoke on any site. The seller doesn't opt in — the user brings the verification tool with them via a browser extension.

This pattern generalizes beyond PolicyCheck. Any user-installed verification service (price comparison, review aggregation, counterfeit detection) could inject tools following this same pattern, giving agents independent information sources alongside seller-provided tools.

## Running Locally

No build step required. Open `index.html` in any browser.

For full WebMCP functionality:
1. Install Chrome Canary 146+
2. Enable `chrome://flags/#enable-webmcp-testing`
3. Open `index.html`

## License

Apache-2.0 (matching repository license)
