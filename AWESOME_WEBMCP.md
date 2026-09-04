# Awesome WebMCP

A curated list of awesome WebMCP demos, libraries, and tools.

## Contents

- [Demos](#demos)
- [Libraries & Tools](#libraries--tools)
- [Contributing](#contributing)

## Demos

- [Explainer mini-site](https://googlechromelabs.github.io/webmcp-tools/demos/explainer/) - A side-by-side demo of how AI agents interact with a web page today (site scraping) and a future where the page declares WebMCP structured tools.
- [Le Petit Bistro](https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/) - A restaurant reservation system that demonstrates how an AI agent can interact with a web-based booking form using declarative tool definitions.
  - **Example Prompt:** "Can you book a table for John Doe for 2 people at Le Petit Bistro next Friday, at 7 PM on the Terrace? His number is 123-456-7890. It's for a birthday celebration."
- [React Flight Search](https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/) - A React-based flight search application that showcases how a web application can expose structured tools to an AI agent, allowing it to programmatically interact with the UI.
  - **Example Prompt:** "Search flights from LON to NYC leaving next Monday and returning after a week for 2 passengers."
- [WebMCP zaMaker!](https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/) - An interactive pizza builder demonstrating imperative tool registration, allowing AI models to make custom pizzas.
  - **Example Prompt:** "Make me a large BBQ pizza with sauce, pineapple and extra bacon."
- [Mystery Doors](https://googlechromelabs.github.io/webmcp-tools/demos/doors/) - A simple multi-page demo showcasing WebMCP capabilities using both declarative and imperative approaches.
  - **Example Prompt:** "Explore the rooms"
- [WebMCP Maze](https://googlechromelabs.github.io/webmcp-tools/demos/webmcp-maze/) - A maze escape game where the player navigates entirely by prompting an AI agent in the browser — no keyboard or mouse input.
  - **Example Prompts:** "Start a new game", then "Solve the maze"
- [CineFlow](https://googlechromelabs.github.io/webmcp-tools/demos/ticket-booking/) - A movie ticket purchase flow where AI agents can update location, query movies by genre, and select showtimes to start a checkout process.
  - **Example Prompt:** "Find two tickets for a horror movie in Montpelier tonight"
- [Order Tracking](https://googlechromelabs.github.io/webmcp-tools/demos/order-tracking/) - A simulated e-commerce order tracking and returns system allowing an AI agent to query order history and initiate returns via declarative tools.
  - **Example Prompt:** "Where is my order from last week? If it’s delivered, I need to start a return."
- [Open for Agents Storefront](https://demo.openforagents.com/) - A live WordPress and WooCommerce demonstration of owner-reviewed product-discovery tools, alongside an optional site Assistant that uses reviewed capabilities. [WordPress.org plugin](https://wordpress.org/plugins/open-for-agents-ai-toolkit-with-mcp/) | [Project explanation](https://www.openforagents.com/why-agent-ready)
  - **Example Prompt:** "Find an in-stock mug."
- [sms-florin](https://flo-voice1.com/esim) - eSIM and virtual phone number store where WebMCP tools sit directly on the live Stripe checkout, so an agent completes a real purchase through the same flow a human uses, not a separate sandboxed demo. [Integration source](https://github.com/flovoice53-tech/sms-florin-webmcp-demo)
  - **Example Prompt:** "Find me a US eSIM plan and buy it."
- [L'Atelier Hotel Chain](https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain/) - A high-fidelity hotel booking application designed to showcase the power of WebMCP. This demo illustrates how AI agents can interact with a modern web application through both imperative and declarative tools.
  - **Example Prompt:** "Find a hotel in Paris with a Spa."
- [WebMCP Sports](https://googlechromelabs.github.io/webmcp-tools/demos/sport-shop-angular/) - A modern e-commerce storefront for high-performance sports equipment, built with Angular and Vanilla CSS.
  - **Example Prompt:** "Find training balls and add them to cart."
- [Shoe store](https://andreinwald.github.io/webmcp-demo/) | [Code](https://github.com/andreinwald/webmcp-demo) - online store built with React, with all core functionality MCP-ready.
  - **Example Prompt:** "Suggest the 3 best pairs of soccer shoes (foot size 45) available on this site. Add (one of suggestions) to cart and complete purchase."
- [Flight booking](https://webmcp-flight-demo.netlify.app/) / [Flight booking (declarative)](https://webmcp-flight-demo.netlify.app/declarative.html) - Find the best flights for your journey.
  - **Example Prompt:** "I want to book a flight from New York to Los Angeles for two people on next Thursday."
- [Animal Viewer](https://65s6dw.csb.app/) - A simple codesandbox demo page that shows either a dog or a cat image.
  - **Example Prompt:** "Show me a dog on this page"
- [React Chess](https://matipojo.github.io/WebMCP-React-Chess) - A chess game that exposes WebMCP tools (`get-board-state`, `make-move`, `get-possible-moves`, `restart-game`, `promote-pawn`) so an AI agent can play chess through `document.modelContext`.
  - **Example Prompt:** "Let's play chess. You play white. Make your opening move."
- **Moving Beyond Screen Scraping**: A hands-on example of using WebMCP to create an agentic first experience with 10x fewer tokens
  - [Article](https://medium.com/data-science-collective/moving-beyond-screen-scraping-creating-an-agent-native-web-app-with-webmcp-4818552e1e11) | [Code](https://github.com/hugozanini/air-bird-booking-web-mcp)
- [AI Audit](https://audit.wordlift.io/) - Audit any website's readiness for the agentic web. Exposes a `run-audit` tool via `document.modelContext` that lets an AI agent programmatically trigger a full AI readiness analysis (score 0–100) covering site files, SEO, structured data, content, and more.
  - **Example Prompt:** "Run an AI readiness audit on https://example.com"
- [Blackjack Agents](https://webmcp-blackjack.heejae.dev/) - Blackjack game with multiple AI agents (player, opponent, dealer) all using WebMCP tools. Each agent autonomously observes its hand, decides to hit or stand, and repeats until done — driven by tool descriptions alone.
  - [Code](https://github.com/happyhj/webmcp-blackjack)
  - **Example Prompt:** "Play my turn"
- [WebMCP Bridge](https://h3manth.com/ai/webmcp/) - A bridge that connects any remote MCP server to Chrome's WebMCP API (`document.modelContext`), letting browser-based AI agents discover and invoke tools from existing MCP servers.
  - **Example Prompt:** "Search for TC39 proposals related to decorators"
- [WebMCP × Excalidraw x WebAI](https://shidh.in/demo/webmcp-excalidraw/) - A Web app that converts natural language descriptions into Excalidraw diagrams through a 3-tool WebMCP pipeline (generate_mermaid → validate_mermaid → render_excalidraw), with optional on-device generation using Chrome's built-in AI.
  - **Example Prompt**: "Create a flowchart showing the user login flow with error handling"
- [WebMCP Flow](https://webmcp-flow.vercel.app/) - An AI-controllable architecture diagram builder that lets an AI agent create nodes, connect them with edges, and apply auto-layout in real time via WebMCP tools.
  - [Code](https://github.com/ttimur-dev/webmcp-flow)
  - **Example Prompt:** "Draw a typical web application architecture with authentication: browser client, API Gateway, Auth Service, User Service, PostgreSQL, Redis. Connect them with edges labeled by protocol and apply auto layout."
- [The Morning Ritual (Imperative)](https://googlechromelabs.github.io/webmcp-tools/demos/coffee-shop/) - A premium coffee boutique demo showcasing agentic reordering, technical spec analysis, and catalog navigation.
  - **Example Prompt:** "Will the espresso machine fit under a 15-inch cabinet?"
- [UrbanEstates](https://googlechromelabs.github.io/webmcp-tools/demos/real-estate-map/) - A real-estate map application that demonstrates imperative tool registration, allowing an AI agent to interact with property filters and map views.
  - **Example Prompt:** "Find me an apartment in Austin", then "Find me an apartment with AC under $1,000,000."
- [Luxe Leather](https://googlechromelabs.github.io/webmcp-tools/demos/leather-bag/) - A premium e-commerce site for hand-crafted leather goods built with Angular and WebMCP. This demo showcases how an AI agent can interact with a web application to search products, check policies, and manage a shopping cart using declarative tools.
  - **Example Prompt:** "Find a handmade leather bag, check if they have a 30-day return policy, and if yes, add the brown one to my cart"
- [WebMCP Smart Home](https://googlechromelabs.github.io/webmcp-tools/demos/smart-home/) - A sleek, interactive dashboard where an AI agent can dynamically reconfigure home control components (e.g., front door cameras, thermostats, smart lights, energy distribution) based on user intents.
  - **Example Prompt:** "Someone is at the door. Show me."
- [webmcp.cool](https://webmcp.cool/) - A live, curated directory of WebMCP-enabled websites with a JSON API for agent-side discovery. Also registers its own WebMCP tools so agents can interact with the registry directly.
  - **Example Prompt:** "List my site `https://example.com` in the WebMCP directory."
- [WebMCP Page Agent](https://googlechromelabs.github.io/webmcp-tools/demos/page-agent/) - A Gemini-powered meta-demo that lets you control any WebMCP-enabled website using simple natural language commands.
  - **Example Prompt:** "Make me a large BBQ pizza with sauce, pineapple and extra bacon."
- [JSON-stat WebMCP Explorer](https://jsonstat.com/webmcp/) - A JSON-stat viewer that lets you fetch a dataset from an official statistical office (like Eurostat), view and filter its data as a list or a cross-tabulation and download them as CSV using a web interface or natural language.
  - **Example Prompt:** "Load dataset https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsi_emp_a?lang=en&lastTimePeriod=3&indic_em=ACT&age=Y15-64&unit=THS_PER and select the data for Germany and Ireland and the last period available. Display a cross-tabulation with sex as rows and countries as columns and download a CSV file with this info."
- [Stacktree](https://stacktr.ee/) - Private hosting for the HTML that AI agents generate. Registers `stacktree_publish_html` via `document.modelContext`, so a browser agent can hand over a complete HTML document and get back a live, shareable URL with no account or sign-in. Anonymous sites are unlisted and the response includes a claim URL to keep the page permanently in a free account.
  - **Example Prompt:** "Build a simple one-page site for a coffee shop called Crema and publish it so I can share the link."
- [admintoolkit.io](https://admintoolkit.io/) - A suite of 24 read-only infrastructure diagnostics exposed through WebMCP, covering DNS, email security, TLS, HTTP, IP networking, hardware data, and agentic web standards.
  - **Example Prompt:** "Check the DNSSEC records for example.com."
- [image2svg](https://botmonster.com/image2svg/) - A free image to SVG converter with WebMCP tools, so an AI agent can convert images right on the page. The blog at botmonster.com also has WebMCP tools to search posts and share pages.
  - **Example Prompt:** "Convert this logo to an SVG"
- [**Wordup**](https://github.com/GoogleChromeLabs/web-ai-demos/tree/main/wordup) ([live](https://snugug.github.io/demos/wordup/)): A casual word guessing game using the Prompt API to generate words and can be driven entirely through WebMCP.
  - **Example Prompt:** "Start a new game."
- [BRITECITY IT Health Scanner](https://britecity.com/it-health-check) - A real-world MSP (managed IT services) site using both declarative and imperative WebMCP. Agents can run a free IT security scan on any domain (`run_it_health_scan`), read structured results (`get_it_health_scan_results`), browse services (`get_britecity_services`), or book a consultation via declarative form tools.
  - **Example Prompt:** "Run an IT security scan on acme.com and tell me the results"
- [Cadence](https://cadence-webmcp.ashrafahmed1232.workers.dev/) | [Code](https://github.com/AshrafAhmed9/cadence) - An issue tracker where an agent is a real teammate on the board: registered tools change live with selection and filters via `useScopedTools`, agent edits land on the same undo stack as the human's, and per-agent permission grants filter which tools even get registered.
  - **Example Prompt:** "Triage my backlog and merge any duplicate bug reports you find."
- [Consequence](https://consequence-webmcp.ashrafahmed1232.workers.dev/) | [Code](https://github.com/AshrafAhmed9/consequence) - A high-stakes application form where every field declares who's allowed to fill it. Calling `answer_question` on an attestation field refuses with a structured error instead of failing quietly, enforced in the same reducer the UI itself uses.
  - **Example Prompt:** "Fill out this application for me and sign the final attestation." (watch it refuse the signature)
- [Relay](https://relay-webmcp.ashrafahmed1232.workers.dev/) | [Code](https://github.com/AshrafAhmed9/relay) - A dispatch console with enforced UI/tool parity: a build-time script asserts every mutating tool has a matching UI action and vice versa, so there's no capability that exists only behind a mouse.
  - **Example Prompt:** "Fix the scheduling conflict and find any jobs that don't have a driver yet."

## Libraries & Tools

- [webmcp-types](https://www.npmjs.com/package/webmcp-types) - TypeScript type definitions for WebMCP.
- [WebMCP - Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) *(by Google)* - A Chrome Extension to let web developers inspect web pages to verify if WebMCP tools are correctly exposed, visualize the input schema, and debug connection issues directly within the browser.
- [use-webmcp-tool](https://www.npmjs.com/package/use-webmcp-tool) *(by Google)* - React hook for registering WebMCP tools (`document.modelContext`) with lifecycle-managed registration.
- [simple-webmcp](https://github.com/emingure/simple-webmcp) - Turns existing JS/TS functions into WebMCP tools with `webmcp(fn)`, keeping them callable while supporting schema patching, React lifecycle helpers, execution hooks for approvals and analytics, and an in-memory development polyfill for testing.
- [Latch](https://github.com/r0bertini/latch) - A one-line `<script>` that detects a page's existing search, cart, and form handlers and registers them as WebMCP tools, with feature detection and no framework dependency. MIT licensed; running live at [latch.tools](https://latch.tools).
- [webmcpify](https://github.com/TueJon/webmcpify) - An agent skill that integrates WebMCP into an existing web app end to end: it inventories the app, proposes a tool manifest for approval, integrates the tools, then verifies each one in a real browser and heals failures.
- [@web-ai-sdk/webmcp](https://github.com/obetomuniz/web-ai-sdk/tree/main/packages/webmcp) - Zero-dependency, framework-agnostic TypeScript adapter for registering WebMCP tools, with lifecycle-safe cleanup, async registration support, duplicate-name handling, feature detection, and an optional React hook.
- [WebMCP Today](https://webmcp.today/) - Open-source package registry for discovering site-specific WebMCP packages and installing them with per-site install commands. [Source](https://github.com/robertn702/webmcp-today).
- [WebMCP Agent Skill](https://github.com/webmaxru/web-ai-agent-skills/tree/main/skills/webmcp) - An MIT-licensed agent skill for implementing and debugging browser WebMCP integrations, including imperative and declarative tools, lifecycle cleanup, cancellation, compatibility checks, and validation.
- [MCP Webcomic Site Server](https://github.com/nearestnabors/mcp-webcomic-site-server) - A template and tutorial for making a webcomic archive visible to AI agents across three surfaces: a static 11ty website, an MCP server, and WebMCP browser tools. Registers tools like `get_current_page`, `get_transcript`, `prev_page`/`next_page`, and `search_comics` via `navigator.modelContext.registerTool()`.
- [WebMCP Kit](https://github.com/nekuda-ai/webmcp-kit) - A plugin for coding agents with an interactive visual Explorer that maps a site's user journeys to proposed WebMCP tools for review and approval, then implements and verifies them in a real browser.
- [WindTunnel](https://github.com/nekuda-ai/WindTunnel) - An open-source benchmark comparing WebMCP with other browser-agent interfaces across task success, execution time, token usage, and cost.
- [webmcp-kit](https://www.npmjs.com/package/@ashraf009/webmcp-kit) ([code](https://github.com/AshrafAhmed9/webmcp-kit)) - A small typed WebMCP library: `defineTool`/`registerTools` with full JSON-Schema-to-TS inference, React hooks (`useWebMCPTool`, `useScopedTools` for dynamic tool sets tied to component state), `withConfirmation` for consequential actions, and a subscribable activity log. Used by Cadence, Consequence, and Relay above.

## Contributing

Contributions are welcome! Please read the [contribution guidelines](CONTRIBUTING.md) first.
