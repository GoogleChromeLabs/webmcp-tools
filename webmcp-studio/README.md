# **🤖 WebMCP Studio (Accelerate WebMCP deployments)**

**Automated Agentic Web integration.**

WebMCP Studio is a developer tool that uses either
[**Chrome DevTools MCP**](https://github.com/ChromeDevTools/chrome-devtools-mcp)
or [**Google Antigravity**](https://antigravity.google/) agents to browse your
website, identify functionality, and automatically write **Web Model Context
Protocol (WebMCP)** tools directly into your IDE.

## **🚀 Why use this?**

WebMCP Studio solves the "cold start" problem by deploying an autonomous agent
to visit your site. The agent "looks" at your UI: search bars, filters, forms
etc. And writes the JavaScript or HTML code needed to expose those features to
browser agents.

**WebMCP Studio helps you:**

1.  **Automate Discovery:** Input your URL, and an AI agent auto-browses your
    site to find the best tools to build.
2.  **Generate Production Code:** The agent writes valid, best-practice
    compliant WebMCP code (Imperative JS & Declarative HTML) and saves it to
    your project.
3.  **Edit in IDE:** No new UI to learn. Review, refine, and deploy the code
    directly from your favorite **AI-based IDEs.**

## **✨ Features**

*   [**Chrome DevTools MCP**](https://github.com/ChromeDevTools/chrome-devtools-mcp)
    **Integration:** connect with Chrome to analyze live websites.
*   [**Antigravity**](https://antigravity.google/) **Integration:** Spawns
    auto-browse agents to analyze live websites.
*   **Zero-Touch Generation:** Generates `registerTool()` calls and HTML
    annotations without manual input.
*   **Dual-Mode Output:** Provides both Imperative and Declarative
    implementation options.
*   **Test Case Generation:** Automatically creates a webmcp-evals.js file with
    test cases to verify the tools using the
    [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md).

## **🛠️ Tech stack**

*   **Orchestration:** Gemini CLI with
    [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
    ot [Google Antigravity](https://antigravity.google/) Platform
*   **Code Editing:** [Antigravity](https://antigravity.google/) IDE or your
    favorite **AI-based IDEs.**
*   **AI Model:** Gemini (powering the auto-browsing agents)

\##

## **📦 Getting started with Gemini CLI and Chrome DevTools MCP**

In this section we are going to show you how to configure your Gemini CLI environment to use [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp).

### **Prerequisites**

Install [Gemini CLI](https://geminicli.com/). If you are new to Gemini CLI , you
can follow this [quick start](https://geminicli.com/docs/get-started/) guide.

### **Usage**

1.  Install the Chrome DevTools MCP server using the Gemini CLI. Either one of
    the following:

Project wide:

```shell
# Either MCP only:
gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
# Or as a Gemini extension (MCP+Skills):
gemini extensions install --auto-update https://github.com/ChromeDevTools/chrome-devtools-mcp
```

Globally:

```shell
gemini mcp add -s user chrome-devtools npx chrome-devtools-mcp@latest
```

Alternatively, follow the
[MCP guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server)
and use the standard config from above.

1.  **Copy the [prompt.config](prompt.config)** in your project folder and
    update its content with your website URL, Category, User Persona,
    Instructions etc.
2.  **Copy or reference the prompt from [starter-prompt.md](starter-prompt.md) and paste it into
    Gemini CLI.**
3.  **Watch the Agent:** The AI agent will browse the site, mapping UI actions
    to potential tools.
4.  **Review output:** Once finished, open the *demos* folder. You will see new
    files created under a folder named with your website origin:
    1.  webmcp-tools.js (Imperative implementation)
    2.  webmcp-forms.html (Declarative implementation)
    3.  webmcp-evals.js (Example tests for evaluating each of the WebMCP tools
        using
        [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md))
    4.  webmcp-recommendations.md (a report with additional recommendations for
        your WebMCP implementations)
5.  **Test your WebMCP tools using Chrome DevTools:** \
    You can evaluate your tools by making temporary local edits of any web page
    using Chrome DevTools. Using a Chrome version with WebMCP support, open the
    website you want to test the WebMCP tools then follow the steps: In Chrome
    (:
    1.  **Imperative method:** Open theUse DevTools Console and copy paste the
        javascript code from `webmcp-tools.js` to write the `registerTool`
        function and plug to an existing function (copy paste the javascript
        code from `webmcp-tools.js`).
    2.  **Declarative method:** Go to DevTools \> Elements \> add `"toolname"`,
        `"tooldescription"` and `"toolautosubmit"` attributes to your forms.
6.  Then you can test the tool execution using the
    [Model Context Tool Inspector extension](https://github.com/beaufortfrancois/model-context-tool-inspector/tree/main).
    \
    Once the extension is installed, you can manually trigger the WebMCP tool
    execution or use the Gemini API and experiment with the natural language
    prompts.
7.  Sample evaluation tests should be available in `webmcp-evals.js`; you can
    assess your tools automatically by running the
    [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md).
    Follow the
    [runevals](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md#runevals--file-based-tool-schemas)
    section.
8.  **Refine:** Refine your implementations using the example prompts given in
    [refining-prompts.md](refining-prompts.md).

### **Support for other Agentic Solutions**

We have not tested the
[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
workflow outside of Gemini CLI but we encourage you to experiment a similar
approach using your favorite AI-based IDEs & Agents. As soon as they have
built-in support for MCP Servers, you should be able to obtain similar results.
E.g.:

*   [Windsurf Cascade](https://windsurf.com/cascade)
*   [Cursor](https://cursor.com/product)
*   [Cloud Code](https://claude.com/product/claude-code)

## **📦 Getting started with Google Antigravity**

### **Prerequisites**

You will need access to the Google [Antigravity](https://antigravity.google/)
platform.

### **Usage**

1.  Install [Antigravity](https://antigravity.google/), create a new workspace
    and Clone WebMCP GitHubrepository.
2.  Add
    [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
    Server
    *   Open the MCP store via the "..." dropdown at the top of the editor's
        agent panel.
    *   Click on "Manage MCP Servers"
    *   Click on "View raw config"
    *   Modify the mcp\_config.json with your custom MCP server configuration.

```
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

1.  **Copy the [prompt.config](prompt.config)** in your project folder and
    update its content with your website URL, Category, User Persona,
    Instructions etc.
2.  **Copy the prompt from [starter-prompt.md](starter-prompt.md) and paste it into
    [Antigravity](https://antigravity.google/) agent**
3.  **Watch the Agent:** The [Antigravity](https://antigravity.google/) agent
    will browse the site, mapping UI actions to potential tools.
4.  **Review output:** Once finished, open the *demos* folder. You will see new
    files created under a folder named with your website origin:
    *   webmcp-tools.js (Imperative implementation)
    *   webmcp-forms.html (Declarative implementation)
    *   webmcp-evals.js (Example tests for evaluating each of the WebMCP tools
        using
        [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md))
    *   webmcp-recommendations.md (a report with additional recommendations for
        your WebMCP implementations)
5.  **Test your WebMCP tools using Chrome DevTools:** \
    You can evaluate your tools by making temporary local edits of any web page
    using Chrome DevTools. Using a Chrome version with WebMCP support, open the
    website you want to test the WebMCP tools then follow the steps:
    *   **Imperative method:** Open the DevTools Console and copy paste the
        javascript code from `webmcp-tools.js` ().
    *   **Declarative method:** Go to DevTools \> Elements \> add `"toolname"`,
        `"tooldescription"` and `"toolautosubmit"` attributes to the forms.
6.  Then you can test the tool execution using the
    [Model Context Tool Inspector extension](https://github.com/beaufortfrancois/model-context-tool-inspector/tree/main).
    \
    Once the extension is installed, you can manually trigger the WebMCP tool
    execution or use the Gemini API and experiment with the natural language
    prompts.
7.  Sample evaluation tests should be available in `webmcp-evals.js`; you can
    assess your tools automatically by running the
    [WebMCP evals-cli](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md).
    Follow the
    [runevals](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/evals-cli/README.md#runevals--file-based-tool-schemas)
    section.
8.  **Refine:** Refine your implementations using the example prompts given in
    [refining-prompts.md](refining-prompts.md).

## **Project configuration**

The prompt configuration file is a critical part of guiding the AI agent. It
should contain key metadata about the website you want the agent to analyze.
Based on the project structure, here is a suggested [prompt.config](prompt.config)
file content:

Key Fields Explained:

*   **target\_url**: The URL of the website you want the agent to browse (e.g.,
    [http://localhost:3000](http://localhost:3000) or
    [https://your-production-site.com](https://your-production-site.com)).
*   **category**: Helps the agent understand the context of the site (e.g.,
    E-commerce, Travel, SaaS, News). This guides it to look for specific
    patterns like "Add to Cart" vs. "Book Flight".
*   **max\_steps**: Limits how many interactions the agent performs to prevent
    it from browsing endlessly. 20-30 steps is usually enough to cover main
    features.
*   **output\_language**: The language you want the tool descriptions to be
    written in (default to English as per WebMCP best practices).
*   **scope**: Defines which paths are allowed or excluded. Use `allowed_paths`
    to restrict browsing (e.g. use `["/*"]` to allow all paths) and
    `excluded_actions` to prevent specific behaviors (e.g. `["/login",
    "/signup"]`).
*   **user\_persona**: Describes the type of user the agent should simulate
    (e.g. "New user", "Returning user").
*   **instructions**: Specific guidance for the agent. You can ask it to focus
    on specific areas, like "Focus only on the checkout flow" or "Ignore the
    blog section."

You should replace the placeholder values (like
[https://example.com](https://example.com)) with your actual project details
before running the agent.

## **Persist your tools with Tampermonkey**

To facilitate testing the Imperative implementation without repasting code on
every reload, you can use the
[Tampermonkey Chrome Extension](https://www.tampermonkey.net/).

1.  Install the Tampermonkey extension.
2.  In your Chrome extension manager, find Tampermonkey and ensure "Allow user
    scripts" is enabled.
3.  On the extension menu click "Create a new script"
4.  Copy the content of `webmcp-tools.js` into the live editor.
5.  Update the script header to match your target website URL (e.g., `// @match
    https://your-website.com/*`).

```javascript
// ==UserScript==
// @name         webmcp-tools.js
// @description  add WebMCP tools for local testing
// @namespace    http://tampermonkey.net/
// @version      2026-02-12
// @match        https://your-website.com/*
// ==/UserScript==
```

1.  Save the script. Now your WebMCP tools will be automatically registered
    whenever you visit the site.

## **Modify your website to add WebMCP support**

After completing your experiments, you might want to add WebMCP support in your
website.

Open your website code folder into your favorite AI-based IDE (alternatively run
Gemini CLI or equivalent in your project folder).

Then use the suggested
[add-webmcp-support-prompt.md](add-webmcp-support-prompt.md) that
contains instructions to update your codebase.

If you had previously inspected your website using DevTools MCP Server and
generated some imperative and declarative WebMCP tools, you can also add those
files to your prompt as a reference.

## **Troubleshooting**

*   **Agent fails to find tools:** Ensure your website URL is publicly
    accessible. **Note:** For this initial version, please stick to
    public-facing pages; authenticated sessions (login walls) are not yet
    supported.
*   **Code generation errors:** Check the `webmcp-recommendations.md` file for
    any notes from the agent regarding ambiguity in your UI.
