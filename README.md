# Collection of WebMCP tools

This repository contains a suite of developer utilities and demos designed to support the adoption of the WebMCP API.

## Developer Utilities

- [**WebMCP - Model Context Tool Inspector**](https://github.com/beaufortfrancois/model-context-tool-inspector): A Chrome Extension to let web developers inspect web pages to verify if WebMCP tools are correctly exposed, visualize the input schema, and debug connection issues directly within the browser.
- [**WebMCP Evals**](evals-cli/): A CLI Tool to evaluate the tool-calling capabilities of LLMs by defining test cases and schemas to verify if an interactive agent correctly calls tools based on user inputs.

## Demos

- [**Travel WebMCP Demo (Imperative)**](demos/react-flightsearch/): A React-based flight search application designed to demonstrate WebMCP integration. This project showcases how a web application can expose structured tools to an AI agent or automation layer, allowing it to programmatically interact with the UI (searching flights, applying filters, reading results) via a standardized interface.
- [**Le Petit Bistro (Declarative)**](demos/french-bistro/): A WebMCP simple implementation for a restaurant reservation system. It allows an AI agent to interact directly with a web-based booking form, validating and submitting data on behalf of the user using declarative tool definitions.
- [**WebMCP zaMaker! (Imperative)**](demos/pizza-maker/): A demo where AI agents can control size, style, toppings, and layers to build the perfect pizza using imperative tools.
- [**Mystery Doors (Declarative & Imperative)**](demos/doors/): A simple multi-page demo showcasing WebMCP capabilities using both declarative and imperative approaches.
- [**WebMCP Maze (Imperative)**](demos/webmcp-maze/): A maze escape game where the player navigates entirely by prompting an AI agent in the browser — no keyboard or mouse input.
- [**CineFlow (Imperative)**](demos/ticket-booking/): A movie ticket purchase flow where AI agents can update location, query movies by genre, and select showtimes to start a checkout process.
- [**Order Tracking (Declarative)**](demos/order-tracking/): A simulated e-commerce order tracking and returns system allowing an AI agent to query order history and initiate product returns using declarative tools.
- [**L'Atelier Hotel Chain (Imperative & Declarative)**](demos/hotel-chain/): A high-fidelity hotel booking application designed to showcase the power of WebMCP. This demo illustrates how AI agents can interact with a modern web application through both imperative and declarative tools.
- [**WebMCP Sports (Imperative & Declarative)**](demos/sport-shop-angular/): A modern e-commerce storefront for high-performance sports equipment, built with Angular and Vanilla CSS.
- [**The Morning Ritual (Imperative)**](demos/coffee-shop/index.html): A premium coffee boutique demo showcasing agentic reordering, technical spec analysis, and catalog navigation.


- [**UrbanEstates (Imperative)**](demos/real-estate-map/): A real-estate map application that demonstrates imperative tool registration, allowing an AI agent to interact with property filters and map views.

Check out our curated list of WebMCP demos in the [Awesome WebMCP List](AWESOME_WEBMCP.md).

## Disclaimer

This is not an officially supported Google product. This project is not
eligible for the [Google Open Source Software Vulnerability Rewards
Program](https://bughunters.google.com/open-source-security).
