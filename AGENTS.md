# AGENTS.md

WebMCP is a proposed web standard that exposes structured tools for AI agents on existing websites. This approach replaces "screen-scraping" with robust, high-performance page interaction and knowledge retrieval, enabling agentic browsers to know exactly how to interact with page features.

## Purpose and Contract

WebMCP bridges the gap between web applications and AI agents by providing an explicit contract for interaction, preventing the agent from having to guess the purpose of a button or the structure of a form.

This contract defines:

  * **Discovery:** A standard way for agents to query exactly which tools a page supports, such as `checkout` or `filter_results`.
  * **JSON Schemas:** Explicit definitions of inputs and expected outputs to reduce hallucination or misunderstanding.
  * **State:** A shared understanding of the current page context, so the agent knows what resources are available to act on in real time.

## Agent Role and Principles

The core goal of an AI agent is to pursue goals and complete multi-step tasks on behalf of users, utilizing reasoning, planning, and memory.

  * **Prioritization:** Agents must prioritize WebMCP tools over guessing page interaction.
  * **Flow Control:** Agents are responsible for managing the overall task flow and coordinating atomic, non-overlapping tools to achieve a higher-level result.
  * **Error Handling:** Agents should use descriptive error messages returned by tools (e.g., from validation in function code) to self-correct and retry with valid parameters.

## Operating Environment and Constraints

  * **Browsing Context:** Tool calls are handled in JavaScript, requiring an active browsing context (a browser tab or webview). Agents cannot call tools "headlessly" (without visible browser UI).
  * **Tool Discovery:** Agents query the page to discover exactly which tools it supports.
  * **Data Requirements:** Agents must adhere to the explicit definitions of inputs and expected outputs provided by tools via JSON Schemas.

## Interaction with Imperative Tools

Imperative tools are defined using standard JavaScript via methods like `navigator.modelContext.registerTool()` or `navigator.modelContext.provideContext()`.

| Step               | Agent Action                                           | Expected Behavior                                                                                                                                                                       |
| :----------------- | :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invocation**     | The agent calls the tool by its registered name.       | The agent must pass parameters that adhere to the tool's defined `inputSchema`.                                                                                                         |
| **Execution**      | The browser executes the tool’s `execute` function.    | The function must return *after* any corresponding UI updates have occurred. This synchronization allows the agent to use the updated UI state to verify execution and plan next steps. |
| **Error Recovery** | The agent receives output from the `execute` function. | Agents should use descriptive error messages to self-correct and retry with valid parameters.                                                                                           |

## Interaction with Declarative Tools

Declarative tools are standard HTML forms automatically transformed into WebMCP tools by adding attributes such as `toolname` and `tooldescription`.

| Step                     | Agent Action                                                                          | Expected Behavior                                                                                                                                                                                                                                        |
| :----------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invocation**           | The agent calls the tool by its registered name (using the `toolname` attribute).     | The browser automatically brings the associated form into focus and populates its fields based on the agent's parameters.                                                                                                                                |
| **Submission (Default)** | The agent waits for user input.                                                       | By default, the form remains visible, and the user must manually click the **Submit** button.                                                                                                                                                            |
| **Automatic Submission** | The agent invokes a tool where the `toolautosubmit` attribute is present on the form. | The submission proceeds automatically after field population.                                                                                                                                                                                            |
| **Event Signaling**      | The agent executes the tool.                                                          | The browser signals execution via the `toolactivated` event when fields are pre-filled. A `toolcancel` event is triggered if the operation is cancelled or the form is reset.                                                                            |
| **Result Handling**      | The agent expects the tool's output.                                                  | The results are either displayed in the current document or, if navigation is triggered, in the new document. If `preventDefault()` is called during submission, the `respondWith(Promise<any>)` method can return serialized data as the tool's output. |

