pull_date: 2026-07-21
source: https://developer.chrome.com/docs/ai/webmcp

# WebMCP

[WebMCP](https://github.com/webmachinelearning/webmcp?tab=readme-ov-file) is a
proposed web standard to help you build and expose structured tools for AI
[agents](https://web.dev/articles/ai-agents). WebMCP provides JavaScript and
annotates HTML form elements so that agents know exactly how to interact with
page features, to support a user's experience. This can significantly improve
the performance and reliability of agent actuation.

Key Term: _Actuation_ is the act of an agent simulating manual mouse clicks and
text input, as though it were the human user engaging with your website. These
can be single tasks, such as clicking a link or inputting content into a form,
or complex tasks, such as completing a purchase.

AI agents are a newer technology. They can help human users better complete
tasks which are highly complex and technical. WebMCP offers higher accuracy for
agentic task completion, and it can be added as a progressive enhancement.

<table class="full-width" id="availability">
  <tr>
    <th>Explainer</th>
    <th>Web</th>
    <th>Extensions</th>
    <th>Chrome Status</th>
    <th>Intent</th>
  </tr>
  <tr>
  {% include "_includes/partials/ai/_webmcp.html" %}
  </tr>
</table>

## Why WebMCP?

WebMCP can help you bridge the gap between web applications and agents,
improving efficiency, reliability, and task completion, by providing rules for
interaction. Instead of an agent reviewing the element, such as a button or a
field, to understand its purpose, the website declares the element's purpose,
so it's used correctly

This is more reliable than actuation, which may have numerous steps and leaves
each step open to interpretation by the agent.

Websites can share explicit purpose, such as search or purchasing, by defining
a `tool`. Tools execute on your webpage visibly, so users gain trust
that tasks are completed as expected. This also keeps your brand and
human-centered design choices intact.

WebMCP supports:

- **Discovery**: A standard way for pages to register tools with agents, such
  as `checkout` or `filter_results`.
- [**JSON Schemas**](https://json-schema.org/understanding-json-schema/reference): Explicit definitions of inputs and expected outputs, to reduce hallucination or misunderstanding.
- **State**: A shared understanding of the current page context, so the agent knows what resources are available to act on in real time.

Our goal is to build APIs that any browser with agentic capabilities can
implement and benefit from, so your users can more easily complete tasks. You
can follow along this process on
[GitHub](https://github.com/webmachinelearning/webmcp).

### Use cases

There are many ways you could use WebMCP on the web. For example:

- **Help your customers get support**. If you provide a software to customers, you may have a complex support flow to address many different questions. You can use WebMCP to help an agent more quickly navigate to the right form and fill in fields with user-provided information.
- **Improve travel booking**. Help agents book complex, multi-city and multi-passenger trips with fewer steps.

Some actions may be sensitive, such as making a purchase. You can include a
command to request user interaction with a confirmation dialog.

In a practical sense, your tools could accomplish the following tasks:

- **Fill in structured forms**: Build a `submit_application` tool to help agents map data collected from the conversation with the user to form fields correctly. For example, you can differentiate if a field requires a full name versus a separate first and last name.
- **Support agent interactions in human-first interfaces**: Certain fields are
  designed for human users, but may not be understood by agents. You could build
  a `date_pick` tool that allows for a complex date and time selection in a
  reservation or event booking.
- **Quicker application debugging**: You can build a `run_diagnostics` tool on a
  developer settings page, so an agent can trigger fixes that are otherwise
  hidden behind nested menus.

Is your use case missing? Or do you have an idea you're excited to share for
WebMCP? Join the [early preview program](http://goo.gle/chrome-ai-dev-preview-join)
and share your feedback.

## Get started

Join the <a href="https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241">WebMCP origin trial</a>
from Chrome 149. Learn more about how to
[get started with origin trials](/docs/web-platform/origin-trials).

### Local WebMCP

WebMCP is available as a Chrome flag for local development:

1. Open Chrome and navigate to `chrome://flags/#enable-webmcp-testing`
2. Set the flag to **Enabled**.
3. Relaunch Chrome to apply the changes.

## Use WebMCP APIs

There are two APIs you can use to set up your website tools:

- [Imperative API](/docs/ai/webmcp/imperative-api): Define different types of
  tools with standard JavaScript, such as form input, navigation tools, state
  management, or other functions.
- [Declarative API](/docs/ai/webmcp/declarative-api): Add annotations to a standard
  HTML forms to create a WebMCP tool.

Note: Angular has [experimental support for WebMCP](https://angular.dev/ai/webmcp).

### Limitations

While WebMCP aims to make complex tasks simpler for agents and humans, there are
some limitations:

- **Browsing context required**: As tool calls are handled in JavaScript,
  a browser tab or a webview must be opened to provide a visible interface and
  browser context. In other words, there is no support for agents or assistive
  tools to call tools in a headless state.
- **More overhead for complex interfaces**: If your site is highly complex, you
  likely need to refactor or add JavaScript to handle application and interface state.
- **Tool discoverability**: Clients and browsers must visit a site directly to
  know if it has callable tools.

### Security and permissions

WebMCP APIs are gated by both origin isolation requirements and permissions
policy.

#### Origin isolation

WebMCP is only available in [origin-isolated](https://web.dev/articles/origin-agent-cluster#limitations)
documents. This ensures that the document's origin remains stable throughout
the tool's lifetime.

If a document has `document.domain` enabled (for example, by using the
`Origin-Agent-Cluster: ?0` HTTP header), WebMCP APIs are disabled.

#### Permissions policy

Both APIs are gated by the `tools`
[Permissions Policy](/docs/privacy-security/permissions-policy).
The policy defaults to `self`, which allows tool registration in top-level and
same-origin contexts, and disables it for cross-origin iframes.

To allow WebMCP tools in a cross-origin iframe, add the `allow="tools"`
attribute to the iframe.

## Demo

Examples of demos covering both imperative and declarative implementations are
available:

- [WebMCP zaMaker](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/pizza-maker)
  uses the WebMCP Imperative API.
- [Travel demo (React)](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch)
  uses the WebMCP Imperative API.
- [Le Petit Bistro demo](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro)
  uses the WebMCP Declarative API.

You can also review and explore the demo source code on
[GitHub](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos).

## Imitate agent chat with the inspector extension

[Install the Model Context Tool Inspector Extension](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
to experiment with an agent and see how WebMCP tools work in live demos or your
own applications. Use natural language prompts to determine if the agent
interacts with WebMCP tools as expected.

With the extension, you can:

- See which tools are registered on a page, by monitoring the WebMCP API.
- Manually call tools and execute functions.
- Verify your JSON Schema is correctly defined and that the browser can parse
  data as the tool expects.
- View structured output or error messages returned by your tool to ensure
  they're written clearly and formatted correctly, so an agent can understand it.

Talk to the agent using natural language, to see if it can correctly identify
and invoke the appropriate WebMCP tools. Your prompts are sent by default to the
`gemini-3-flash-preview` model.

Note: This is separate from the
[Gemini in Chrome](https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/) features.

## Engage and share feedback

WebMCP is under active discussion and subject to change in the future. If you
try these APIs and have feedback, we'd love to hear it.

- [Read the WebMCP explainer](https://github.com/webmachinelearning/webmcp?tab=readme-ov-file),
  raise questions and participate in discussion.
- Join the <a href="https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241">WebMCP origin trial</a>
- Read [WebMCP best practices](/docs/ai/webmcp/best-practices).
- Review the implementation for Chrome on
  [Chrome Status](https://chromestatus.com/feature/5117755740913664).
- Read our [WebMCP tool security guidance](/docs/ai/webmcp/secure-tools) and
  [best practices](/docs/ai/webmcp/best-practices).
- [Join the early preview program](http://goo.gle/chrome-ai-dev-preview-join)
  for an early look at new APIs and access to our mailing list.
- If you have feedback on Chrome's implementation, file a
  [Chromium bug](https://crbug.com/new?component=2021259).
