/**
 * Copyright 2026 AgentPay / up2itnow0822
 * SPDX-License-Identifier: Apache-2.0
 *
 * AgentPay x402 WebMCP Demo — Main Script
 *
 * Demonstrates both declarative AND imperative WebMCP tool registration
 * for x402 (HTTP 402 Payment Required) micropayments on Base.
 *
 * Packages: agentpay-mcp@4.0.0, agentwallet-sdk@6.0.4, webmcp-sdk@0.5.7
 * Protocol: x402 — Patent Pending
 */

// ─── Mock AgentPay Wallet ─────────────────────────────────────────────────────
// In a real deployment this would use agentwallet-sdk connected to a Base smart
// contract wallet. Here we simulate the wallet state in-browser so the demo runs
// standalone without backend infrastructure.

const MOCK_WALLET = {
  address: '0xAgnt' + Array.from({length: 36}, () => '0123456789abcdef'[Math.random()*16|0]).join(''),
  balanceUsdc: 12.47,
  spendLimitUsdc: 1.00,
  sessionSpentUsdc: 0,
};

// Payment history for this session
const paymentHistory = [];

// ─── Utility: Logging ────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(msg, level = 'info', icon = '›') {
  const container = document.getElementById('activity-log');
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">[${ts()}]</span>
    <span class="log-icon">${icon}</span>
    <span class="log-msg ${level}">${escapeHtml(msg)}</span>
  `;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.clearLog = function () {
  const container = document.getElementById('activity-log');
  container.innerHTML = '<p class="log-empty">Agent activity will appear here…</p>';
};

// ─── Utility: UI updates ──────────────────────────────────────────────────────

function updateWalletUI() {
  const fmt = (n) => `$${n.toFixed(4)} USDC`;
  document.getElementById('wallet-address').textContent = MOCK_WALLET.address;
  document.getElementById('wallet-address').title = MOCK_WALLET.address;
  document.getElementById('wallet-balance').textContent = fmt(MOCK_WALLET.balanceUsdc);
  document.getElementById('spend-limit').textContent = fmt(MOCK_WALLET.spendLimitUsdc);
  document.getElementById('session-spent').textContent = fmt(MOCK_WALLET.sessionSpentUsdc);
}

function renderPaymentHistory() {
  const container = document.getElementById('payment-history');
  if (paymentHistory.length === 0) {
    container.innerHTML = '<p class="log-empty">No payments yet this session.</p>';
    return;
  }
  container.innerHTML = '';
  for (const p of [...paymentHistory].reverse()) {
    const item = document.createElement('div');
    item.className = 'payment-item';
    const urlShort = p.url.length > 50 ? p.url.slice(0, 47) + '…' : p.url;
    item.innerHTML = `
      <div class="pi-left">
        <span class="pi-url">${escapeHtml(urlShort)}</span>
        <span class="pi-meta">tx: ${p.txHash} · ${p.timestamp}</span>
      </div>
      <span class="pi-amount">−${p.amountUsdc.toFixed(4)} USDC</span>
    `;
    container.appendChild(item);
  }
}

function showResponse(data, paymentProof) {
  const panel = document.getElementById('response-panel');
  panel.style.display = 'block';
  document.getElementById('response-body').textContent = JSON.stringify(data, null, 2);

  if (paymentProof) {
    const proofEl = document.getElementById('payment-proof');
    proofEl.style.display = 'block';
    const details = document.getElementById('receipt-details');
    details.innerHTML = Object.entries(paymentProof).map(([k, v]) => `
      <div class="receipt-item">
        <label>${escapeHtml(k.replace(/_/g, ' '))}</label>
        <span>${escapeHtml(String(v))}</span>
      </div>
    `).join('');
  }

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Mock x402 API Server (client-side simulation) ───────────────────────────
// Simulates an x402-protected API endpoint. On first call returns 402 with
// payment requirements. After payment is satisfied, returns 200 with data.

const paidEndpoints = {
  'https://api.agentpay.demo/market-data/BTC': {
    price: 0.001,       // $0.001 USDC per request
    currency: 'USDC',
    network: 'base',
    data: {
      symbol: 'BTC/USD',
      price: 84312.55,
      change24h: '+2.3%',
      volume24h: '$28.4B',
      marketCap: '$1.67T',
      source: 'AgentPay Premium Data',
      timestamp: new Date().toISOString(),
    },
  },
  'https://api.agentpay.demo/news/crypto': {
    price: 0.005,
    currency: 'USDC',
    network: 'base',
    data: {
      headlines: [
        { title: 'Base Ecosystem Reaches $10B TVL', sentiment: 'bullish' },
        { title: 'x402 Protocol Adopted by 200+ APIs', sentiment: 'bullish' },
        { title: 'AI Agents Drive Record On-Chain Activity', sentiment: 'neutral' },
      ],
      source: 'AgentPay News Feed',
      timestamp: new Date().toISOString(),
    },
  },
};

// Default endpoint for unknown URLs
function getEndpointConfig(url) {
  return paidEndpoints[url] || {
    price: 0.01,
    currency: 'USDC',
    network: 'base',
    data: {
      message: 'Premium data from paid API endpoint',
      url,
      timestamp: new Date().toISOString(),
    },
  };
}

function generateTxHash() {
  return '0x' + Array.from({length: 64}, () => '0123456789abcdef'[Math.random()*16|0]).join('');
}

/**
 * Simulate fetching an x402-protected URL.
 * Phase 1: Return 402 with payment requirements.
 * Phase 2: If payment token provided, return 200 with data.
 */
async function simulateX402Fetch(url, maxPaymentUsdc) {
  const config = getEndpointConfig(url);

  if (config.price > maxPaymentUsdc) {
    return {
      ok: false,
      status: 402,
      error: `API requires $${config.price} USDC but max_payment_usdc is $${maxPaymentUsdc}`,
    };
  }

  if (config.price > MOCK_WALLET.spendLimitUsdc - MOCK_WALLET.sessionSpentUsdc) {
    return {
      ok: false,
      status: 402,
      error: 'Insufficient session spend limit. Use check_wallet_balance to review limits.',
    };
  }

  if (config.price > MOCK_WALLET.balanceUsdc) {
    return {
      ok: false,
      status: 402,
      error: 'Insufficient wallet balance.',
    };
  }

  // Simulate network delay
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

  // Deduct payment
  MOCK_WALLET.balanceUsdc -= config.price;
  MOCK_WALLET.sessionSpentUsdc += config.price;

  const txHash = generateTxHash();
  const receipt = {
    tx_hash: txHash,
    amount_usdc: config.price,
    network: config.network,
    currency: config.currency,
    payer: MOCK_WALLET.address,
    url,
    timestamp: new Date().toISOString(),
    status: 'confirmed',
  };

  // Record in history
  paymentHistory.push({
    url,
    amountUsdc: config.price,
    txHash: txHash.slice(0, 18) + '…',
    timestamp: ts(),
  });

  updateWalletUI();
  renderPaymentHistory();

  return {
    ok: true,
    status: 200,
    data: config.data,
    receipt,
  };
}

// ─── x402 Fetch Logic (used by both declarative and imperative tools) ─────────

async function x402Fetch(url, maxPaymentUsdc = 0.01) {
  log(`Fetching ${url}…`, 'info', '→');

  // Phase 1: Attempt request (simulated 402)
  log(`GET ${url} → 402 Payment Required`, 'warning', '⚡');
  log(`Payment required: up to $${maxPaymentUsdc} USDC · Signing on Base…`, 'payment', '💳');

  // Simulate payment signing delay
  await new Promise(r => setTimeout(r, 400));
  log('Payment signed · Broadcasting to Base network…', 'payment', '🔗');

  // Phase 2: Execute payment + retry
  const result = await simulateX402Fetch(url, maxPaymentUsdc);

  if (!result.ok) {
    log(`Payment failed: ${result.error}`, 'error', '✗');
    throw new Error(result.error);
  }

  log(`Payment confirmed · tx: ${result.receipt.tx_hash.slice(0, 18)}…`, 'success', '✓');
  log(`GET ${url} → 200 OK · $${result.receipt.amount_usdc.toFixed(4)} USDC paid`, 'success', '✅');

  return result;
}

// ─── Declarative tool: form submit handler ─────────────────────────────────────
// The form in index.html has toolname="fetch_paid_api" and tooldescription.
// The browser's WebMCP engine will fire toolactivated when an agent calls it.
// We also handle manual submit for non-agent users.

const fetchForm = document.getElementById('fetchForm');

async function handleFetchFormSubmit(e) {
  e.preventDefault();

  const url = document.getElementById('api-url').value.trim();
  const maxPayment = parseFloat(document.getElementById('max-payment').value) || 0.01;

  if (!url) {
    log('Please enter an API URL', 'error', '✗');
    return;
  }

  const btn = fetchForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Processing…';

  try {
    const result = await x402Fetch(url, maxPayment);
    showResponse(result.data, result.receipt);
    log('Data received successfully!', 'success', '🎉');
  } catch (err) {
    log(`Error: ${err.message}`, 'error', '✗');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 Fetch (with x402 payment if needed)';
  }
}

fetchForm.addEventListener('submit', handleFetchFormSubmit);

// Declarative WebMCP: listen for toolactivated on the form
fetchForm.addEventListener('toolactivated', async (e) => {
  log('Agent invoked fetch_paid_api (declarative tool)', 'info', '🤖');
  const { url, max_payment_usdc } = e.detail?.args ?? {};
  document.getElementById('api-url').value = url || document.getElementById('api-url').value;
  if (max_payment_usdc) document.getElementById('max-payment').value = max_payment_usdc;
  // The declarative API returns a value via e.detail.returnValue
  try {
    const result = await x402Fetch(
      document.getElementById('api-url').value,
      parseFloat(document.getElementById('max-payment').value) || 0.01
    );
    showResponse(result.data, result.receipt);
    if (e.detail?.resolve) e.detail.resolve(JSON.stringify(result.data));
  } catch (err) {
    if (e.detail?.reject) e.detail.reject(err.message);
    log(`Tool error: ${err.message}`, 'error', '✗');
  }
});

// ─── Imperative WebMCP Tools ──────────────────────────────────────────────────
// Register additional tools via navigator.modelContext.registerTool (imperative API).

function registerImperativeTools() {
  const mc = navigator.modelContext;

  // Tool 1: fetch_paid_api (also registered imperatively for full coverage)
  mc.registerTool({
    name: 'fetch_paid_api',
    description:
      'Fetch a URL that may require an x402 micropayment (HTTP 402). ' +
      'On 402, the AgentPay wallet automatically signs a payment on Base and retries. ' +
      'Returns the JSON response body and payment receipt. ' +
      'Powered by agentpay-mcp v4.0.0 (Patent Pending).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'The URL to fetch. Must be an x402-compatible endpoint. ' +
            'Example: https://api.agentpay.demo/market-data/BTC',
        },
        max_payment_usdc: {
          type: 'number',
          description: 'Maximum USDC to spend on this request. Default: 0.01.',
          default: 0.01,
          minimum: 0.0001,
          maximum: 10,
        },
      },
      required: ['url'],
    },
    execute: async ({ url, max_payment_usdc = 0.01 }) => {
      log(`Agent called fetch_paid_api(url="${url}", max=$${max_payment_usdc})`, 'info', '🤖');
      try {
        const result = await x402Fetch(url, max_payment_usdc);
        showResponse(result.data, result.receipt);
        return JSON.stringify({
          success: true,
          data: result.data,
          payment: {
            amount_usdc: result.receipt.amount_usdc,
            tx_hash: result.receipt.tx_hash,
            network: result.receipt.network,
          },
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    },
  });

  // Tool 2: check_wallet_balance
  mc.registerTool({
    name: 'check_wallet_balance',
    description:
      'Returns the current AgentPay smart contract wallet balance in USDC, ' +
      'along with session spend limits and remaining budget. ' +
      'Call this before making payments to confirm sufficient funds.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: () => {
      log('Agent called check_wallet_balance', 'info', '🤖');
      const remaining = MOCK_WALLET.spendLimitUsdc - MOCK_WALLET.sessionSpentUsdc;
      const result = {
        wallet_address: MOCK_WALLET.address,
        balance_usdc: parseFloat(MOCK_WALLET.balanceUsdc.toFixed(6)),
        session_spend_limit_usdc: MOCK_WALLET.spendLimitUsdc,
        session_spent_usdc: parseFloat(MOCK_WALLET.sessionSpentUsdc.toFixed(6)),
        session_remaining_usdc: parseFloat(remaining.toFixed(6)),
        chain: 'base',
        wallet_type: 'non-custodial smart contract (ERC-4337)',
        nft_ownership: 'owned via NFT — only NFT holder can authorize',
        sdk: 'agentwallet-sdk v6.0.4',
      };
      log(
        `Wallet: $${MOCK_WALLET.balanceUsdc.toFixed(4)} USDC · Session remaining: $${remaining.toFixed(4)}`,
        'success', '💰'
      );
      updateWalletUI();
      return JSON.stringify(result, null, 2);
    },
  });

  // Tool 3: get_payment_history
  mc.registerTool({
    name: 'get_payment_history',
    description:
      'Returns the list of x402 micropayments made during this browser session. ' +
      'Each entry includes the URL paid, USDC amount, transaction hash, and timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Max number of recent payments to return (default 20).',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
    execute: ({ limit = 20 }) => {
      log('Agent called get_payment_history', 'info', '🤖');
      const recent = [...paymentHistory].reverse().slice(0, limit);
      const totalSpent = paymentHistory.reduce((s, p) => s + p.amountUsdc, 0);
      const result = {
        session_payment_count: paymentHistory.length,
        session_total_usdc: parseFloat(totalSpent.toFixed(6)),
        payments: recent.map(p => ({
          url: p.url,
          amount_usdc: parseFloat(p.amountUsdc.toFixed(6)),
          tx_hash: p.txHash,
          timestamp: p.timestamp,
        })),
      };
      log(`Payment history: ${paymentHistory.length} payments · $${totalSpent.toFixed(4)} total`, 'success', '📋');
      renderPaymentHistory();
      return JSON.stringify(result, null, 2);
    },
  });

  log('✓ Imperative WebMCP tools registered (fetch_paid_api, check_wallet_balance, get_payment_history)', 'success', '⚙️');
}

// ─── Prompt copy helper ───────────────────────────────────────────────────────

window.copyPrompt = async function (btn) {
  const text = btn.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch {
    // Clipboard not available — still useful as a visual hint
  }
};

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  updateWalletUI();
  renderPaymentHistory();

  if (window.navigator?.modelContext) {
    document.getElementById('no-webmcp').style.display = 'none';
    log('WebMCP detected · navigator.modelContext available', 'success', '✓');
    log('Declarative tool registered via HTML form (toolname="fetch_paid_api")', 'info', '⚙️');

    registerImperativeTools();

    log('AgentPay wallet initialised · Ready for x402 payments on Base', 'success', '💳');
  } else {
    document.getElementById('no-webmcp').style.display = 'block';
    log('WebMCP not available — enable chrome://flags/#webmcp-for-testing', 'warning', '⚠️');
    log('Running in preview mode — tool calls simulated locally', 'warning', '⚠️');
    // Still register the form handler for manual testing
    log('Manual form submit enabled for testing without WebMCP', 'info', '›');
  }
}

init();
