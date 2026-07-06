# WebMCP Sports | E-Commerce & On-Site AI Assistant Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/sport-shop-angular

An e-commerce storefront for sports equipment, built with Angular and WebMCP. This project demonstrates how an integrated **On-Site AI Assistant** and browser-level AI agents interact with an e-commerce site to search catalog items, check promotions and store policies, manage a shopping cart, and complete checkouts.

## 🌟 Key Features

- **On-Site AI Assistant (Gemini 3.1 Flash Lite)**: An embedded, slide-out agent drawer powered by Google GenAI (`@google/genai`). The assistant discovers and executes WebMCP tools directly in-browser (`document.modelContext`), featuring:
  - Real-time tool execution status indicators in the chat stream (e.g., ⚙️ Executing tool... / ✅ Executed).
  - Quick prompt presets (e.g., "Find basketball items under $50", "What promotions are available?").
  - Persistent Gemini API key management stored in `localStorage` with a masked input toggle.
  - Markdown response rendering for lists, tables, and product details.
- **WebMCP Tool Integration**:
  - **Application-wide (Global)**: Available on all pages for catalog navigation and store policies.
  - **Search Page (`/search`)**: Result querying, price range filtering, and direct cart additions.
  - **Cart Modal**: Cart inspection, delivery option updates (`ship` vs `pickup`), item removal, and checkout execution.
- **Search & Filtering**: Search flow with price refinement (Under $50, $50–$100, $100+), size filtering (adult vs child), and category browsing (Basketball, Soccer, Baseball, Running).
- **Store Rules & Promotions**:
  - Basketball 3-for-2 promo logic applied at checkout.
  - Local pickup eligibility validation (Soccer & Running gear only).
- **Cart & Checkout**: State management using Angular Signals with subtotal, discount, and total calculations.
- **Design System**: Built with HSL-based color tokens, Inter typography, and responsive drawer/modal layouts.

## 🤖 WebMCP Tools Reference

WebMCP Sports registers 13 in-browser tools categorized by scope:

### 🌐 Global / Application-wide Tools (`WebmcpService`)
- `view_product`: Navigates to a product detail page by `productId` or `productName`.
- `get_product_info`: Returns product metadata for a given `productId` or `productName`.
- `open_cart`: Opens the shopping cart modal.
- `search_product`: Navigates to the search page with optional `query`, `category` (`ALL`, `BASKETBALL`, `SOCCER`, `BASEBALL`, `RUNNING`), and `size` (`ALL`, `adult`, `child`).
- `get_store_promos_and_rules`: Returns active store promotions (e.g., Basketball 3-for-2) and local pickup eligibility rules.

### 🔍 Search Page Tools (`SearchComponent` at `/search`)
- `refine_search`: Filters visible search results by price range (`all`, `0-49.99`, `50-99.99`, `100+`).
- `add_search_result_to_cart`: Adds a product from current search results to cart by `index`, `productId`, or `productName`.
- `get_current_search_results`: Returns all currently filtered search results on the page.

### 🛒 Shopping Cart Tools (`CartModalComponent`)
- `get_cart`: Returns current cart items, delivery options, subtotal, applied discounts, and total price.
- `update_cart_delivery_option`: Updates delivery mode (`ship` or `pickup`) for a cart item, enforcing local pickup eligibility.
- `remove_from_cart`: Removes an item from the cart by `index`, `productId`, or `productName`.
- `start_checkout`: Initiates cart checkout and order processing.
- `confirm_order`: Confirms order completion on the checkout success screen.

## 🛠 Tech Stack

- **Framework**: Angular 22 (Signals & Standalone Components)
- **AI & Protocol**: Google GenAI SDK (`@google/genai`), WebMCP (`document.modelContext`)
- **Styling**: Vanilla CSS & TailwindCSS v4
- **Build Tool**: Angular CLI / Vite
- **Testing**: Vitest

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm (v10 or later)

### Installation

1. Navigate to the project directory:
   ```bash
   cd demos/sport-shop-angular
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development Server

Start a local development server at `http://localhost:4200/`:

```bash
npm start
```

### On-Site AI Assistant Setup

To use the embedded AI assistant in local development:
1. Open the app in your browser at `http://localhost:4200/`.
2. Click the AI Assistant FAB (floating button on bottom-left) or click the prompt bar on the Search / Product pages.
3. Enter your [Gemini API Key](https://aistudio.google.com/app/apikey). The key is stored locally in your browser's `localStorage`.

## 📂 Project Structure

- `src/app/pages`: Application views (Home, Search, Product Detail)
- `src/app/components`: UI modules (Header, Hero, Agent Drawer, AI Sidebar, Cart Modal, Product Cards)
- `src/app/services`: Core services:
  - `agent.service.ts`: Gemini 3.1 Flash Lite orchestration & in-browser WebMCP tool execution.
  - `webmcp.service.ts`: Global WebMCP tool registrations.
  - `cart.service.ts`: Cart state & promo calculation.
  - `product.service.ts`: Product catalog & search filtering.
  - `ui.service.ts`: UI modal and drawer state management.
- `src/app/models`: Data models (`Product`, `CartItem`)
- `src/app/pipes`: Markdown pipe for AI chat formatting
- `src/assets`: Local product image repository and assets

## 🧪 Testing

Run unit tests with Vitest:

```bash
npm test
```


