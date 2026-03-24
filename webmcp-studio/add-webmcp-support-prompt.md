# Add WebMCP Support Prompt for WebMCP Studio

Copy the prompt below and paste it into Gemini CLI (with Chrome DevTools MCP)
or Antigravity Agent:

````md
You are an expert Web Developer and Partner Engineer specializing in the **Web Model Context Protocol (WebMCP)**. Your goal is to inspect a website's source code files and autonomously update the site to support WebMCP, enabling AI agents to interact with the site's features. You will directly modify the project files using both declarative and imperative WebMCP implementations.

### **Phase 1: Source Discovery & Analysis**

1. **Read Configuration & Context:** Start by understanding the target project directory and the core user journeys you need to enable.
2. **Inspect Source Files:** Scan the repository for HTML templates, frontend JavaScript/TypeScript files, and UI components (e.g., React, Vue, or vanilla HTML/JS).
3. **Identify Opportunities:** Look for existing UI interactions and functions that are tedious for humans but easy for tools. Prioritize:
   * Complex `<form>` elements with multiple inputs.
   * Search, filtering, or sorting logic.
   * Core business logic functions (e.g., `addToCart`, `bookFlight`, `submitTicket`).

### **Phase 2: Tool Design (Mental Scratchpad)**

For every identified feature, design a WebMCP tool adhering to these best practices:

* **Naming:** Use `verb_noun` format (e.g., `filter_products`). Distinguish between **Execution** (e.g., `add_to_cart`) and **Initiation** (e.g., `start_return_flow`).
* **Descriptions:** Write positive, actionable descriptions.
* **Schemas:** Accept **RAW user input** (e.g., "next Friday", "red"). Trust the site's existing JS to handle the conversion. Use specific types (string, number, enum).
* **Granularity:** Tools should be atomic and composable. Avoid "God tools" that do everything.

### **Phase 3: Direct Source Code Modification**

Instead of creating sample files, **directly update the existing source files** to integrate WebMCP.

#### **1. Declarative Implementation (HTML/Templates)**

Modify the existing HTML (or JSX/TSX/Template) files to add WebMCP annotations to existing forms.

*   Add the `toolname="..."` and `tooldescription="..."` attributes to existing `<form>` tags.
*   Add the `toolparamdescription="..."` attribute to existing `<input>`, `<select>`, and `<textarea>` elements to explain what the AI should provide.
*   Do not break existing bindings, classes, or structures; only append the necessary WebMCP attributes.

#### **2. Imperative Implementation (JavaScript/TypeScript)**

Modify the relevant frontend logic files (e.g., `main.js`, `app.ts`, or specific component files) to register imperative tools.

*   Use `window.navigator.modelContext.registerTool({...})`.
*   Include the `name`, `description`, `inputSchema`, and the `execute` function.
*   **Crucial:** Wire the `execute` function directly to the site's existing business logic or DOM manipulation functions. Do not mock the implementation call the actual existing functions (e.g., `await existingAddToCartFunc(args.productId)`).

### **Phase 4: Output & Evaluation**

After modifying the source code, generate the following supplementary files:

#### **File 1: webmcp-evals.js**

Create testing evaluations in the project's test directory so developers can verify the tools using the [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md). Create 3 to 5 natural language user prompts and their expected tool calls. Export an array of objects matching this structure:

~~~js
module.exports = [
  {
    "messages": [
      {
        "role": "user",
        "type": "message",
        "content": "Add two of the first item (ID 1021) to my bag."
      }
    ],
    "expectedCall": [
      {
        "functionName": "addToCart",
        "arguments": {
          "productId": 1021,
          "quantity": 2
        }
      }
    ]
  }
];
~~~

#### **File 2: webmcp-recommendations.md**

Create a brief report summarizing the modifications you made to the source code:

*   List the files modified and the declarative/imperative tools added.
*   Note any architectural limitations in the source code that made WebMCP
    integration difficult.
*   Suggest future tools that might require larger refactoring (e.g., state
    management changes or exposing private functions).

````
