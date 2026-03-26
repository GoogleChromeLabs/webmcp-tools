# AgentPay x402 — WebMCP Payment Demo

🚀 **Live Demo:** https://googlechromelabs.github.io/webmcp-tools/demos/x402-payment/

A production-ready WebMCP demo showing an AI agent making **x402 micropayments** through `navigator.modelContext`. When a paid API returns HTTP 402, the AgentPay wallet automatically signs a payment on **Base** and retries — all inside the browser.

## What It Demonstrates

- **Both registration patterns:** declarative (`toolname` / `tooldescription` HTML attributes) AND imperative (`navigator.modelContext.registerTool()`)
- **x402 payment flow:** GET → 402 Payment Required → sign payment → retry → 200 OK
- **Non-custodial wallet UX:** balance, session spend limits, real-time payment log
- **Three WebMCP tools:**
  - `fetch_paid_api` — Fetches a URL; handles HTTP 402 automatically
  - `check_wallet_balance` — Wallet balance + session spend limits
  - `get_payment_history` — Recent x402 payments made in this session

## Example Prompts

Use these with Claude, ChatGPT, or any MCP-compatible AI agent:

> **"Buy premium market data from this API using x402 payment"**

> "Check my wallet balance and spend limits"

> "Show me my payment history for this session"

> "Fetch https://api.agentpay.demo/news/crypto paying up to $0.05"

## How It Works

### 1. Declarative Tool (HTML)

The fetch form is tagged with WebMCP attributes. The browser exposes this as a structured tool to any connected AI agent:

```html
<form
  id="fetchForm"
  toolname="fetch_paid_api"
  tooldescription="Fetch a URL that may require an x402 micropayment..."
>
  <input name="url" toolparamdescription="The URL to fetch..." />
  <input name="max_payment_usdc" toolparamdescription="Max USDC to pay..." />
</form>
```

### 2. Imperative Tools (JavaScript)

Additional tools registered via `navigator.modelContext.registerTool()`:

```js
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: 'check_wallet_balance',
    description: 'Returns the current AgentPay wallet balance in USDC...',
    inputSchema: { type: 'object', properties: {} },
    execute: () => JSON.stringify({ balance_usdc: 12.47, ... }),
  });
}
```

### 3. x402 Payment Flow

```
Agent → fetch_paid_api(url, max_payment_usdc)
  → GET /api/endpoint → 402 Payment Required
  → AgentPay wallet signs payment on Base
  → GET /api/endpoint + Payment-Authorization header
  → 200 OK + data returned to agent
```

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| [`agentpay-mcp`](https://www.npmjs.com/package/agentpay-mcp) | 4.0.0 | x402 payment MCP server |
| [`agentwallet-sdk`](https://www.npmjs.com/package/agentwallet-sdk) | 6.0.4 | Non-custodial agent wallet |
| [`webmcp-sdk`](https://github.com/up2itnow0822/webmcp-sdk) | 0.5.7 | WebMCP developer toolkit |
| WebMCP API | Chrome 146+ | `navigator.modelContext` |
| Base | Mainnet | L2 blockchain for payments |

## Running Locally

This is a **static HTML demo** — no build step required.

```bash
# Serve locally (any static server works)
npx serve demos/x402-payment

# Or with Python
python3 -m http.server --directory demos/x402-payment 8080
```

Then open `http://localhost:8080` in **Chrome 146+** with WebMCP enabled:

1. Go to `chrome://flags`
2. Search for **"WebMCP"**
3. Enable **"WebMCP for testing"**
4. Restart Chrome

Install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd) extension to inspect the registered tools.

## Architecture Notes

The demo runs fully client-side — the x402 API server is simulated in JavaScript to make it self-contained. In a real deployment:

- The API server would implement the [x402 spec](https://x402.org) and return `402 Payment Required` with payment requirements in the `X-Payment-Requires` header
- `agentpay-mcp` handles payment signing, broadcasting to Base, and polling for confirmation
- The wallet is a non-custodial ERC-4337 smart contract wallet — the NFT holder is the sole authorized signer

## x402 Protocol

x402 is an open protocol for **HTTP micropayments** using blockchain. A server returns:

```http
HTTP/1.1 402 Payment Required
X-Payment-Requires: {"currency":"USDC","network":"base","amount":"0.001","recipient":"0x..."}
```

The client signs a payment, attaches it as a header, and retries:

```http
GET /api/endpoint
Payment-Authorization: {"signature":"0x...","tx_hash":"0x..."}
```

x402 — Patent Pending. Spec: https://x402.org

---

*Built by [AgentPay](https://www.npmjs.com/package/agentpay-mcp) · x402 Protocol (Patent Pending) · Runs on Base*
