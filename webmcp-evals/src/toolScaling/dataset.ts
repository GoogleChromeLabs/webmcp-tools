/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BenchmarkIntent,
  BenchmarkTool,
  DistractorType,
  ScalingTrialSpec,
  SchemaStyle,
} from "./types.js";

export const PINNED_COMMIT_SHA = "f3faa835f3fdeab42e41b055209d6954b192f653";
export const MVP_N_GRID = [1, 5, 10, 20, 40, 50, 100] as const;
export const MICRO_PILOT_N_GRID = [1, 5, 40, 100, 128, 150] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EVALS_ROOT = resolve(__dirname, "..", "..");

/** Mulberry32 deterministic 32-bit PRNG. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle returning a new array. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  const rand = createRng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Primary target tools matching `examples/commerce/shopping/schema.json`
 * (5 tools with crisp, unambiguous boundaries).
 */
export function loadTargetShoppingTools(): BenchmarkTool[] {
  const relPath = "examples/commerce/shopping/schema.json";
  const raw = JSON.parse(readFileSync(resolve(EVALS_ROOT, relPath), "utf-8")) as {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: object | null;
      outputSchema?: object | null;
    }>;
  };
  return raw.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema ?? null,
    provenance: {
      sourceType: "real-example",
      sourcePath: relPath,
      commitSha: PINNED_COMMIT_SHA,
    },
  }));
}

/**
 * Loads non-shopping real WebMCP tool schemas from bundled `examples/`
 * so orthogonal distractors include real Chrome-authored schemas.
 */
export function loadRealOrthogonalExampleTools(): BenchmarkTool[] {
  const sources = [
    "examples/healthcare/schema.json",
    "examples/pizza-maker/schema.json",
    "examples/real-estate/schema.json",
    "examples/travel/schema.json",
    "examples/events/schema.json",
    "examples/address-form/schema.json",
  ];
  const out: BenchmarkTool[] = [];
  const seenNames = new Set<string>();
  for (const relPath of sources) {
    const raw = JSON.parse(readFileSync(resolve(EVALS_ROOT, relPath), "utf-8")) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: object | null;
        outputSchema?: object | null;
      }>;
    };
    for (const t of raw.tools) {
      if (seenNames.has(t.name)) continue;
      seenNames.add(t.name);
      out.push({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema ?? null,
        provenance: {
          sourceType: "real-example",
          sourcePath: relPath,
          commitSha: PINNED_COMMIT_SHA,
        },
      });
    }
  }
  return out;
}

/**
 * Generates deterministic synthetic orthogonal distractors (non-shopping domains)
 * sized to Chrome WebMCP recommended guidelines (names <= 30 chars, param desc <= 150).
 */
export function buildSyntheticOrthogonalTools(count: number): BenchmarkTool[] {
  const domains = [
    ["weather", "forecast", "city", "City name for weather check"],
    ["calendar", "schedule", "eventDate", "ISO date for calendar"],
    ["music", "playback", "trackId", "Audio track identifier"],
    ["transit", "route", "station", "Metro station name"],
    ["finance", "ledger", "accountId", "Ledger account ID"],
    ["fitness", "workout", "sessionId", "Workout session ID"],
    ["library", "borrow", "isbn", "Book ISBN identifier"],
    ["parking", "reserve", "lotCode", "Parking lot code"],
    ["notes", "archive", "noteId", "Note record ID"],
    ["timer", "alarm", "minutes", "Timer duration in minutes"],
    ["device", "thermostat", "roomName", "Room name for HVAC"],
    ["mail", "digest", "folder", "Mailbox folder name"],
  ] as const;

  const tools: BenchmarkTool[] = [];
  for (let i = 0; i < count; i++) {
    const [dom, verb, param, paramDesc] = domains[i % domains.length];
    const idx = Math.floor(i / domains.length) + 1;
    const name = `${dom}_${verb}_${idx}`.slice(0, 30);
    tools.push({
      name,
      description: `Handles ${dom} ${verb} task #${idx} outside retail shopping.`,
      inputSchema: {
        type: "object",
        properties: {
          [param]: {
            type: "string",
            description: paramDesc.slice(0, 150),
          },
        },
        required: [param],
      },
      outputSchema: null,
      provenance: {
        sourceType: "synthetic",
        sourcePath: "src/toolScaling/dataset.ts#buildSyntheticOrthogonalTools",
      },
    });
  }
  return tools;
}

/**
 * Generates domain-adjacent distractors inside e-commerce/retail with
 * distinct, non-overlapping responsibilities so gold labels stay unambiguous.
 */
export function buildDomainAdjacentTools(count: number): BenchmarkTool[] {
  const templates: Array<{
    baseName: string;
    desc: string;
    param: string;
    paramType: "string" | "number";
    paramDesc: string;
  }> = [
    {
      baseName: "track_shipment",
      desc: "Track parcel carrier delivery status using an existing order tracking number.",
      param: "trackingNumber",
      paramType: "string",
      paramDesc: "Carrier tracking ID for an already shipped order.",
    },
    {
      baseName: "initiate_return",
      desc: "Start a post-delivery return or refund ticket for a delivered order ID.",
      param: "orderId",
      paramType: "string",
      paramDesc: "Delivered order identifier for return processing.",
    },
    {
      baseName: "apply_promo_code",
      desc: "Validate and apply an explicit promotional coupon code to checkout.",
      param: "couponCode",
      paramType: "string",
      paramDesc: "Alphanumeric promotional coupon code.",
    },
    {
      baseName: "save_to_wishlist",
      desc: "Bookmark a product into the user's saved wishlist without adding to cart.",
      param: "productId",
      paramType: "number",
      paramDesc: "Numeric product ID to save for later.",
    },
    {
      baseName: "remove_from_cart",
      desc: "Remove an item already inside the shopping cart by product ID.",
      param: "productId",
      paramType: "number",
      paramDesc: "Numeric product ID to remove from cart.",
    },
    {
      baseName: "check_store_pickup",
      desc: "Check physical retail store pickup availability by ZIP code.",
      param: "zipCode",
      paramType: "string",
      paramDesc: "5-digit postal ZIP code for store pickup.",
    },
    {
      baseName: "compare_gift_cards",
      desc: "List digital gift card denominations and expiration rules.",
      param: "currency",
      paramType: "string",
      paramDesc: "Three-letter currency code such as USD.",
    },
    {
      baseName: "update_billing_addr",
      desc: "Update saved credit card billing street address on the account.",
      param: "streetAddress",
      paramType: "string",
      paramDesc: "New street line for billing.",
    },
    {
      baseName: "view_past_orders",
      desc: "Retrieve historical completed orders placed in prior months.",
      param: "year",
      paramType: "number",
      paramDesc: "Four-digit calendar year of past orders.",
    },
    {
      baseName: "request_price_match",
      desc: "Submit a competitor URL for a post-purchase price-match credit.",
      param: "competitorUrl",
      paramType: "string",
      paramDesc: "Public competitor listing URL.",
    },
    {
      baseName: "subscribe_restock",
      desc: "Register an email alert for when an out-of-stock SKU returns.",
      param: "skuCode",
      paramType: "string",
      paramDesc: "Out-of-stock SKU code.",
    },
    {
      baseName: "filter_brand_outlet",
      desc: "Browse clearance outlet items strictly for refurbished warehouse stock.",
      param: "warehouseCode",
      paramType: "string",
      paramDesc: "Regional clearance warehouse code.",
    },
  ];

  const tools: BenchmarkTool[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = templates[i % templates.length];
    const round = Math.floor(i / templates.length) + 1;
    const suffix = round === 1 ? "" : `_${round}`;
    const name = `${tpl.baseName}${suffix}`.slice(0, 30);
    tools.push({
      name,
      description:
        round === 1
          ? tpl.desc
          : `${tpl.desc} (Legacy partition #${round}, do not use for live cart.)`,
      inputSchema: {
        type: "object",
        properties: {
          [tpl.param]: {
            type: tpl.paramType,
            description: tpl.paramDesc.slice(0, 150),
          },
        },
        required: [tpl.param],
      },
      outputSchema: null,
      provenance: {
        sourceType: "synthetic",
        sourcePath: "src/toolScaling/dataset.ts#buildDomainAdjacentTools",
      },
    });
  }
  return tools;
}

/**
 * Expands descriptions for the `N = 20` verbosity control while preserving
 * identical tool names and parameter schemas.
 */
export function applySchemaStyle(
  tools: readonly BenchmarkTool[],
  style: SchemaStyle,
): BenchmarkTool[] {
  if (style === "concise") return [...tools];
  return tools.map((t) => ({
    ...t,
    description: `${t.description} Detailed operational guidance: inspect all user constraints carefully, verify parameter formatting rules before invoking, and avoid invoking unrelated endpoints or assuming missing values when the prompt does not specify them.`,
  }));
}

/**
 * 20 human-reviewed intents: 16 positive (covering all 5 target shopping tools)
 * + 4 abstention cases (`expectedCall: null`), designed to avoid ambiguity with
 * domain-adjacent distractors.
 */
export const BENCHMARK_INTENTS: readonly BenchmarkIntent[] = [
  // 1-3: getProducts
  {
    id: "pos-01",
    name: "List all in-stock items",
    prompt: "What items do you currently have in stock in the shop?",
    expectedCall: { functionName: "getProducts", arguments: {} },
    category: "positive-direct",
  },
  {
    id: "pos-02",
    name: "Browse full catalog",
    prompt: "Show me the full list of products available right now.",
    expectedCall: { functionName: "getProducts", arguments: {} },
    category: "positive-direct",
  },
  {
    id: "pos-03",
    name: "Discover general inventory",
    prompt: "I just opened the store — can you fetch everything you sell?",
    expectedCall: { functionName: "getProducts", arguments: {} },
    category: "positive-nuanced",
  },
  // 4-7: filterByPreferences
  {
    id: "pos-04",
    name: "Filter red dress size US 6 under 200",
    prompt: "I am looking for a red dress in US size 6 under 200 dollars.",
    expectedCall: {
      functionName: "filterByPreferences",
      arguments: { color: "Red", size: "EU 38", maxPrice: 200 },
    },
    category: "positive-direct",
  },
  {
    id: "pos-05",
    name: "Filter midnight blue items",
    prompt: "Show me items in midnight blue.",
    expectedCall: {
      functionName: "filterByPreferences",
      arguments: { color: "Blue" },
    },
    category: "positive-nuanced",
  },
  {
    id: "pos-06",
    name: "Filter green apparel under 120",
    prompt: "Search for green clothing priced at most 120 dollars.",
    expectedCall: {
      functionName: "filterByPreferences",
      arguments: { color: "Green", maxPrice: 120 },
    },
    category: "positive-direct",
  },
  {
    id: "pos-07",
    name: "Filter crimson size US 10",
    prompt: "Find something in crimson shade for US size 10.",
    expectedCall: {
      functionName: "filterByPreferences",
      arguments: { color: "Red", size: "EU 42" },
    },
    category: "positive-nuanced",
  },
  // 8-10: addToCart
  {
    id: "pos-08",
    name: "Add two of product 1021",
    prompt: "Add two units of product ID 1021 to my shopping cart.",
    expectedCall: {
      functionName: "addToCart",
      arguments: { productId: 1021, quantity: 2 },
    },
    category: "positive-direct",
  },
  {
    id: "pos-09",
    name: "Add single product 2045",
    prompt: "Put product 2045 in my cart for checkout.",
    expectedCall: {
      functionName: "addToCart",
      arguments: { productId: 2045 },
    },
    category: "positive-direct",
  },
  {
    id: "pos-10",
    name: "Add three of product 3310",
    prompt: "I want to buy 3 of item 3310 — add them to my bag.",
    expectedCall: {
      functionName: "addToCart",
      arguments: { productId: 3310, quantity: 3 },
    },
    category: "positive-nuanced",
  },
  // 11-13: getProductReviews
  {
    id: "pos-11",
    name: "Reviews for product 1021",
    prompt: "What do customer reviews and star ratings say about product 1021?",
    expectedCall: {
      functionName: "getProductReviews",
      arguments: { productId: 1021 },
    },
    category: "positive-direct",
  },
  {
    id: "pos-12",
    name: "Quality sentiment for product 550",
    prompt: "Before I decide on product ID 550, check customer feedback and quality.",
    expectedCall: {
      functionName: "getProductReviews",
      arguments: { productId: 550 },
    },
    category: "positive-nuanced",
  },
  {
    id: "pos-13",
    name: "Ratings for product 882",
    prompt: "How highly rated is item ID 882 by buyers?",
    expectedCall: {
      functionName: "getProductReviews",
      arguments: { productId: 882 },
    },
    category: "positive-direct",
  },
  // 14-16: getShippingAndLoyaltyInfo
  {
    id: "pos-14",
    name: "Check loyalty points and shipping",
    prompt: "Do I have any loyalty points balance or free shipping eligibility?",
    expectedCall: { functionName: "getShippingAndLoyaltyInfo", arguments: {} },
    category: "positive-direct",
  },
  {
    id: "pos-15",
    name: "Check available promo codes for account",
    prompt: "Can you check my account benefits for available promo codes or shipping perks?",
    expectedCall: { functionName: "getShippingAndLoyaltyInfo", arguments: {} },
    category: "positive-nuanced",
  },
  {
    id: "pos-16",
    name: "Free shipping eligibility check",
    prompt: "Before I pay, check whether my account qualifies for free shipping.",
    expectedCall: { functionName: "getShippingAndLoyaltyInfo", arguments: {} },
    category: "positive-direct",
  },
  // 17-20: Abstention (expectedCall: null)
  {
    id: "abs-01",
    name: "Unsupported neon yellow color query",
    prompt: "Do you sell jackets in Neon Yellow? Answer directly if that color isn't supported.",
    expectedCall: null,
    category: "abstention",
  },
  {
    id: "abs-02",
    name: "Store return policy general question",
    prompt: "Explain in one sentence what online shopping means without calling any tool.",
    expectedCall: null,
    category: "abstention",
  },
  {
    id: "abs-03",
    name: "Off-domain quantum physics question",
    prompt: "What is the speed of light in vacuum in meters per second?",
    expectedCall: null,
    category: "abstention",
  },
  {
    id: "abs-04",
    name: "Greeting without tool request",
    prompt: "Hi there, thanks for the help today!",
    expectedCall: null,
    category: "abstention",
  },
];

export function assembleToolSet(
  n: number,
  distractorType: DistractorType,
  style: SchemaStyle,
  shuffleSeed: number,
  targetToolName: string | null,
): { tools: BenchmarkTool[]; targetPosition: number } {
  const shopping = loadTargetShoppingTools();
  let selected: BenchmarkTool[] = [];

  if (n === 1) {
    const match =
      (targetToolName ? shopping.find((t) => t.name === targetToolName) : undefined) ?? shopping[0];
    selected = [match];
  } else {
    // Always include all 5 target shopping tools when n >= 5 so target is present
    // alongside realistic sibling tools.
    selected = [...shopping];
    const needed = Math.max(0, n - selected.length);
    if (needed > 0) {
      if (distractorType === "orthogonal") {
        const realPool = loadRealOrthogonalExampleTools().filter(
          (t) => !selected.some((s) => s.name === t.name),
        );
        const fromReal = realPool.slice(0, needed);
        const remaining = needed - fromReal.length;
        const fromSynth = remaining > 0 ? buildSyntheticOrthogonalTools(remaining) : [];
        selected = [...selected, ...fromReal, ...fromSynth];
      } else if (distractorType === "domain-adjacent") {
        selected = [...selected, ...buildDomainAdjacentTools(needed)];
      }
    }
  }

  const styled = applySchemaStyle(selected.slice(0, n), style);
  const shuffled = shuffleWithSeed(styled, shuffleSeed);
  const targetPosition = targetToolName ? shuffled.findIndex((t) => t.name === targetToolName) : -1;
  return { tools: shuffled, targetPosition };
}

export function buildMicroPilotTrials(): ScalingTrialSpec[] {
  const pilotIntent = BENCHMARK_INTENTS[3]; // pos-04: filterByPreferences
  return MICRO_PILOT_N_GRID.map((n, idx) => {
    const seed = 1000 + n * 17 + idx;
    const distractorType: DistractorType = n === 1 ? "none" : "orthogonal";
    const { tools, targetPosition } = assembleToolSet(
      n,
      distractorType,
      "concise",
      seed,
      pilotIntent.expectedCall?.functionName ?? null,
    );
    return {
      trialId: `pilot-n${n}-${pilotIntent.id}`,
      arm: "micro-pilot",
      n,
      distractorType,
      schemaStyle: "concise",
      drawIndex: 1,
      shuffleSeed: seed,
      intent: pilotIntent,
      targetPosition,
      tools,
    };
  });
}

export function buildMvpTrials(): ScalingTrialSpec[] {
  const trials: ScalingTrialSpec[] = [];

  for (const n of MVP_N_GRID) {
    const distractorTypes: DistractorType[] =
      n === 1 ? ["none"] : ["orthogonal", "domain-adjacent"];
    for (const distractorType of distractorTypes) {
      for (let drawIndex = 1; drawIndex <= 3; drawIndex++) {
        for (let i = 0; i < BENCHMARK_INTENTS.length; i++) {
          const intent = BENCHMARK_INTENTS[i];
          const seed =
            422000 +
            n * 1000 +
            (distractorType === "domain-adjacent" ? 500 : 0) +
            drawIndex * 100 +
            i;
          const { tools, targetPosition } = assembleToolSet(
            n,
            distractorType,
            "concise",
            seed,
            intent.expectedCall?.functionName ?? null,
          );
          trials.push({
            trialId: `nat-n${n}-${distractorType}-d${drawIndex}-${intent.id}`,
            arm: "natural-scaling",
            n,
            distractorType,
            schemaStyle: "concise",
            drawIndex,
            shuffleSeed: seed,
            intent,
            targetPosition,
            tools,
          });
        }
      }
    }
  }

  // Verbosity control at N = 20 (verbose only; concise reuses natural-scaling N=20)
  for (const distractorType of ["orthogonal", "domain-adjacent"] as const) {
    for (let drawIndex = 1; drawIndex <= 3; drawIndex++) {
      for (let i = 0; i < BENCHMARK_INTENTS.length; i++) {
        const intent = BENCHMARK_INTENTS[i];
        const seed =
          920000 + (distractorType === "domain-adjacent" ? 500 : 0) + drawIndex * 100 + i;
        const { tools, targetPosition } = assembleToolSet(
          20,
          distractorType,
          "verbose",
          seed,
          intent.expectedCall?.functionName ?? null,
        );
        trials.push({
          trialId: `verb-n20-${distractorType}-d${drawIndex}-${intent.id}`,
          arm: "verbosity-n20",
          n: 20,
          distractorType,
          schemaStyle: "verbose",
          drawIndex,
          shuffleSeed: seed,
          intent,
          targetPosition,
          tools,
        });
      }
    }
  }

  return trials;
}
