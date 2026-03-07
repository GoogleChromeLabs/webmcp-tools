# Awesome WebMCP

A curated list of awesome WebMCP demos.

## Contents

- [Demos](#demos)
- [Contributing](#contributing)

## Demos

- [Le Petit Bistro](https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/) - A restaurant reservation system that demonstrates how an AI agent can interact with a web-based booking form using declarative tool definitions.
  - **Example Prompt:** "Can you book a table for John Doe for 2 people at Le Petit Bistro next Friday, at 7 PM on the Terrace? His number is 123-456-7890. It's for a birthday celebration."
- [React Flight Search](https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/) - A React-based flight search application that showcases how a web application can expose structured tools to an AI agent, allowing it to programmatically interact with the UI.
  - **Example Prompt:** "Search flights from LON to NYC leaving next Monday and returning after a week for 2 passengers."
- [WebMCP zaMaker!](https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/) - An interactive pizza builder demonstrating imperative tool registration, allowing AI models to make custom pizzas.
  - **Example Prompt:** "Make me a large BBQ pizza with sauce, pineapple and extra bacon."
- [Flight booking](https://webmcp-flight-demo.netlify.app/) / [Flight booking (declarative)](https://webmcp-flight-demo.netlify.app/declarative.html) - Find the best flights for your journey.
  - **Example Prompt:** "I want to book a flight from New York to Los Angeles for two people on next Thursday."
- [Animal Viewer](https://65s6dw.csb.app/) - A simple codesandbox demo page that shows either a dog or a cat image.
  - **Example Prompt:** "Show me a dog on this page"
- [React Chess](https://matipojo.github.io/WebMCP-React-Chess) - A chess game that exposes WebMCP tools (`get-board-state`, `make-move`, `get-possible-moves`, `restart-game`, `promote-pawn`) so an AI agent can play chess through `navigator.modelContext`.
  - **Example Prompt:** "Let's play chess. You play white. Make your opening move."
- **Moving Beyond Screen Scraping**: A hands-on example of using WebMCP to create an agentic first experience with 10x fewer tokens
  - [Article](https://medium.com/data-science-collective/moving-beyond-screen-scraping-creating-an-agent-native-web-app-with-webmcp-4818552e1e11) | [Code](https://github.com/hugozanini/air-bird-booking-web-mcp)
- [Blackjack Agents](https://webmcp-blackjack.heejae.dev/) - Blackjack game with multiple AI agents (player, opponent, dealer) all using WebMCP tools. Each agent autonomously observes its hand, decides to hit or stand, and repeats until done — driven by tool descriptions alone.
  - [Code](https://github.com/happyhj/webmcp-blackjack)
  - **Example Prompt:** "Play my turn"
- [WebMCP Bridge](https://h3manth.com/ai/webmcp/) - A bridge that connects any remote MCP server to Chrome's WebMCP API (`navigator.modelContext`), letting browser-based AI agents discover and invoke tools from existing MCP servers.
  - **Example Prompt:** "Search for TC39 proposals related to decorators"
- [WebMCP × Excalidraw x WebAI](https://shidh.in/demo/webmcp-excalidraw/) - A Web app that converts natural language descriptions into Excalidraw diagrams through a 3-tool WebMCP pipeline (generate_mermaid → validate_mermaid → render_excalidraw), with optional on-device generation using Chrome's built-in AI.
  - **Example Prompt**: "Create a flowchart showing the user login flow with error handling"
  
- [BRITECITY IT Health Scanner](https://britecity.com/it-health-check) - A real-world MSP (managed IT services) site using both declarative and imperative WebMCP. Agents can run a free IT security scan on any domain (`run_it_health_scan`), read structured results (`get_it_health_scan_results`), browse services (`get_britecity_services`), or book a consultation via declarative form tools.
  - **Example Prompt:** "Run an IT security scan on acme.com and tell me the results"

## Contributing

Contributions are welcome! Please read the [contribution guidelines](CONTRIBUTING.md) first.
