# LUXE LEATHER | WebMCP E-commerce Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/leather-bag/

A premium, modern e-commerce storefront for hand-crafted leather products, built with Angular and WebMCP (Web Model Context Protocol). This project demonstrates how an AI agent can interact with an e-commerce site to search products, check policies, and manage a shopping cart using both **declarative** and **imperative** tool definitions.

## 🌟 Key Features

- **WebMCP Tools**:
  - **Application-wide Tools (Available on all pages)**:
    - `check_return_policy` (Imperative): Access site-wide return and guarantee policy.
    - `search_store` (Imperative): Search the Luxe Leather store catalog for products matching a query.
    - `view_product` (Imperative): Navigate to the detailed product page for a specific leather item by its slug.
  - **Product Page Specific Tools (Available on `/product/:id` route)**:
    - `add_to_cart` (Declarative via Signal Form): Add items to the shopping cart with chosen variations (color and quantity).
  - **Search Page Specific Tools (Available on `/search` route)**:
    - `filter_results` (Imperative): Filter search results on the page by colors, finishes, and maximum price.
    - `get_search_results` (Imperative): Return the list of products matching current search query and filters.
    - `add_search_result_to_cart` (Imperative): Add a product from search results to the cart by name/keywords or index.
- **Premium Design System**: Features the "Artisanal Archive" aesthetic with curated color palettes and elegant typography.
- **Actionable Filters**: Dynamic price slider, color swatches, and finish checkboxes on the search page.
- **Cart Management**: A dedicated Cart Page with quantity controls and order summary calculation.

## 🛠 Tech Stack

- **Framework**: Angular 22 (Standalone Components)
- **Protocol**: WebMCP (Declarative tools via HTML forms and Imperative tools via Angular providers)
- **Styling**: Vanilla CSS (BEM-like)
- **Build Tool**: Angular CLI / Vite

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm (v10 or later)

### Installation

1. Navigate to the project directory:
   ```bash
   cd demos/leather-bag
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

## 📂 Project Structure

- `src/app/pages`: Core views (Home, Search, Product, Cart)
- `src/app/layout`: Shared layout components (Header, Footer)
- `src/app/services`: Business logic (Cart service, Product discovery)
- `public/assets`: Product images and data files

## 🧪 Testing

Run unit tests with Vitest:

```bash
npm test
```
