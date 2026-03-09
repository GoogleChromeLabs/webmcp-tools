# Mystery Doors | WebMCP Declarative & Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/doors/

A simple multi-page demo showcasing WebMCP capabilities. 
It demonstrates both **declarative** (HTML attributes) and **imperative** (JavaScript API) ways to expose tools to an AI model.

## Features

- **The Hallway (`index.html`)**:
  - Uses **Declarative WebMCP** (`toolname`, `tooldescription`, `toolautosubmit` on `<form>` elements) to let the model "open" doors by navigating to other pages.

- **The Whispering Woods (`forest.html`)**:
  - Uses **Imperative WebMCP** (`navigator.modelContext.registerTool`) to create a "talk" tool.
  - Uses **Declarative WebMCP** (`toolname`, `tooldescription`, `toolautosubmit` on `<form>` element) to let the model "return to the hallway" by navigating to `index.html`.

- **The Coral Cove (`ocean.html`)**:
  - Uses **Imperative WebMCP** to register "dance" and "hide" tools.
  - Uses **Declarative WebMCP** (`toolname`, `tooldescription`, `toolautosubmit` on `<form>` element) to let the model "return to the hallway" by navigating to `index.html`.

- **The Wizard's Attic (`magic.html`)**:
  - Demonstrates state changes. The "Return to Hallway" tool is initially disabled.
  - The model must first use the "castLight" tool (Imperative) to illuminate the room, which then dynamically enables the declarative navigation tool to leave.

