# The Morning Ritual | Coffee Shop WebMCP Demo

🚀 **Live Demo:** `https://googlechromelabs.github.io/webmcp-tools/demos/coffee-shop/`

A multi-page static site demo of **WebMCP** implementation for a specialty coffee shop. This project demonstrates how an AI agent can navigate a multi-page site, retrieve personal order history, and perform actions that are visually synchronized with the UI.

### 🛠️ How It Works

This demo uses the **Imperative WebMCP API** (`navigator.modelContext.registerTool`) to expose site-wide navigation and product-specific capabilities. 

* **UI Synchronization**: Tools are designed to provide immediate visual feedback. For example, reordering a product increments a cart counter and shows a toast notification, while requesting technical specs automatically scrolls the user to the relevant section and highlights it.
* **Multi-page Context**: Demonstrates how an agent can use a "Navigation" tool on the homepage to reach a product page where more specialized tools (like specifications) become available.

### 📦 Registered Tools

| Tool Name | Location | Description |
| :--- | :--- | :--- |
| `search_catalog` | `home.html` | Navigates the browser to a specific product detail page (The Alchemist, Dark Roast, or Precision Burr) based on a search query. |
| `get_order_history` | `order_history.html` | Retrieves a list of past purchases, including order IDs and product names. |
| `reorder_product` | `order_history.html` | Adds a previous order to the cart. Triggers a **cart counter increment** and a **toast notification**. |
| `get_product_specifications` | `the_alchemist.html` | Returns dimensions and capacities. Triggers a **smooth scroll** and **visual highlight** on the technical specs section. |

### ☕ Core User Journeys (CUJs)

These prompts can be used with an AI agent connected to this demo via WebMCP:

#### **Product Reorder**
> "I’m running low on my usual coffee beans. Can you reorder the same bag I bought last month?"
* **Trajectory**: Agent goes to Order History $\rightarrow$ Retrieves last month's bean ID $\rightarrow$ Calls `reorder_product` $\rightarrow$ User sees toast and updated cart.

#### **Technical Specifications**
> "Will this espresso machine fit under a 15-inch cabinet? Also, what is the water tank capacity?"
* **Trajectory**: Agent uses `search_catalog` to find The Alchemist $\rightarrow$ Calls `get_product_specifications` $\rightarrow$ User is scrolled to the specs section $\rightarrow$ Agent confirms the 12" height fits under 15" and reports the 2.0L capacity.