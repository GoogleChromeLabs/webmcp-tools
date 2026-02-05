# Collection of WebMCP tools

This repository contains a suite of developer utilities and demos designed to support the adoption of the WebMCP API.

## Developer Utilities

- A Chrome Extension to let web developers inspect web pages to verify if WebMCP tools are correctly exposed, visualize the input schema, and debug connection issues directly within the browser.
- A [CLI Tool](evals-cli/) to evaluate the tool-calling capabilities of LLMs by defining test cases and schemas to verify if an interactive agent correctly calls tools based on user inputs.

## Demos

- [**Travel WebMCP Demo (Imperative)**](demos/react-flightsearch/): A React-based flight search application designed to demonstrate WebMCP integration. This project showcases how a web application can expose structured tools to an AI agent or automation layer, allowing it to programmatically interact with the UI (searching flights, applying filters, reading results) via a standardized interface.
- [**Le Petit Bistro (Declarative)**](demos/french-bistro/): A WebMCP simple implementation for a restaurant reservation system. It allows an AI agent to interact directly with a web-based booking form, validating and submitting data on behalf of the user using declarative tool definitions.

## Disclaimer

This is not an officially supported Google product. This project is not
eligible for the [Google Open Source Software Vulnerability Rewards
Program](https://bughunters.google.com/open-source-security).
