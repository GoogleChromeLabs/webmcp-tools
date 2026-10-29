<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Extension Automation Contract

`webmcp-evals` evaluates a website's WebMCP tools (`document.modelContext` and declarative `<form toolname>`) in `browser` (`evals.json`) and `simulate` (`simulations.json`) modes. By default, a built-in agent calls the tools. With `--extension`, `webmcp-evals` evaluates the same tools **against a Chrome extension agent** (Manifest V3), such as [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) or a custom side-panel agent. This shows how your tool names, descriptions, schemas, annotations, and page state work with a browser agent. Extension authors can also use this mode to test their agent on WebMCP pages.

This document describes what happens during an extension run and what a custom extension must expose. To set up Chrome and run the commands, see [Evaluating Tools Against a Browser Extension Agent](../README.md#evaluating-tools-against-a-browser-extension-agent---extension).

---

## 1. How It Works

- **The side panel**: `webmcp-evals` drives the extension's side-panel page (`chrome-extension://<id>/<panel path>`). It sends prompts, starts new chats, and answers tool permission prompts there. It keeps the target web page as the **active tab**, because side-panel extensions work with the active tab.
- **The web page**: `webmcp-evals` does not run the tools itself. It records each tool call that the extension makes on the web page (imperative `document.modelContext` tools and declarative `<form toolname>` tools), with the outputs, the calls of each turn, and related `console.error` and page errors.

> [!IMPORTANT]
> Chrome's WebMCP API (`document.modelContext`) is available only on web origins (`https://` and `http://localhost`), not on `chrome-extension://` pages. That is why `webmcp-evals` drives the extension's side panel instead of registering WebMCP tools on the extension page.

---

## 2. Finding the Extension

`--extension` accepts any of:

1. **32-character Chrome extension ID** (for example `abcdefghijklmnopabcdefghijklmnop` from `chrome://extensions`).
2. **Extension `manifest.json` `name`** (case-insensitive exact match, or a substring that matches only one extension).
3. **Path to an unpacked extension directory** that contains `manifest.json`. When `webmcp-evals` launches Chrome, it installs the directory. With `--browser-url`, it looks for an installed extension with the same manifest name.

An ID or a name needs a Chrome profile where the extension is already installed and set up: pass `--user-data-dir` or `--browser-url`. Reports show the resolved extension name and ID, not only the text you passed to `--extension`. In `browser`, an errored case also shows its reason.

The side-panel page is found in this order:

1. `--extension-panel-path <path>` (if provided),
2. `manifest.json` → `side_panel.default_path`,
3. `sidepanel/index.html`.

If Chrome cannot open the side panel, `webmcp-evals` opens this page in a background tab instead and prints a warning. The web page stays the active tab.

---

## 3. What Happens in Each Case

### Tabs and Site Data

Extensions are turned off in incognito browser contexts, so each case opens the target URL in a new foreground tab in the default browser context. Before the page loads:

- If `webmcp-evals` launched Chrome itself (`--user-data-dir`, or an unpacked `--extension ./dir`), it clears site data (cookies, storage, caches) for the target URL's origin.
- If it is attached to your Chrome with `--browser-url`, it does **not** clear site data. Logged-in sessions survive, but state can carry over from one case to the next. It also leaves Chrome open when it finishes.
- Extension storage (`chrome.storage.local`) is never cleared, so the extension keeps its settings.

### Consent Screen

`webmcp-evals` accepts a first-run consent screen automatically only when it installed an unpacked extension itself (`--extension ./dir`), and only for `GoogleChromeLabs/webmcp-extension`: the `window.__AGENT_AUTOMATION__` bridge has no way to accept one. In every other case, open the side panel once in the profile you use (`--user-data-dir` or `--browser-url`) and accept the consent screen yourself. Otherwise every case fails with an error that says so.

### Panel Readiness

Before it sends the first prompt, `webmcp-evals` waits until the side panel:

1. is attached to the target tab (`attachedDomain` matches the target URL),
2. shows the page's tools (`detectedToolCount` is at least 1, or `null`; for `GoogleChromeLabs/webmcp-extension`, its tools label must show them). If the page registers zero tools, the run continues after about 1.5 s so it can report "0 tools",
3. starts from a new chat: if older items are shown, `webmcp-evals` calls `startNewChat()` (or clicks "Start new chat") until it returns `true`, and
4. shows the prompt box (`composerVisible`).

### Timeouts

| Option                                          | Default  | What it limits                                                                          |
| :---------------------------------------------- | :------- | :-------------------------------------------------------------------------------------- |
| `--timeout`                                     | `30000`  | Page navigation, panel readiness, and setup tool calls. It does not limit turn length.  |
| `--turn-timeout` (`browser` only)               | `120000` | One extension turn.                                                                     |
| `maxDurationMs` / `--max-duration` (`simulate`) | `300000` | The conversation, including extension turns (not the page load, setup calls, or judge). |

In `simulate`, `--timeout` also limits the judge request.

### Tool Permission Prompts (`--confirm-policy`)

| Policy                 | What `webmcp-evals` does                                                                         |
| :--------------------- | :----------------------------------------------------------------------------------------------- |
| `allow-once` (default) | Clicks the one-time allow button.                                                                |
| `always-allow`         | Clicks the extension's "always allow" button, or the one-time allow when that button is missing. |
| `deny`                 | Clicks deny.                                                                                     |
| `none`                 | Leaves prompts for a human to answer, up to the turn timeout.                                    |

### Prompts and Conversation History (`browser`)

`webmcp-evals` sends each `evals.json` case to the extension as **one prompt**, because the extension keeps its own chat. A case with a single user message sends that message as it is. A case with more steps (earlier user messages, model replies, or tool calls) is handled like this:

- Earlier `functioncall` steps are run on the live page before the prompt is sent. If any of them fails, the case is reported as an error and the prompt is not sent. The report lists them under "World state before the conversation", as in `simulate`.
- Each `functionresponse` belongs to the oldest unanswered `functioncall` of the same tool, so parallel calls to one tool get their own responses. A `functioncall` whose recorded `functionresponse` was an error (for example in a validation-error recovery case) is not replayed on the live page; it only appears in the prompt context.
- Earlier steps are sent as context in the prompt, in this shape:

  ```text
  [Prior conversation context]
  ...earlier messages and tool steps...

  [Current user message]
  ...the last user message...
  ```

- If the case does not end with a user message (for example, it ends with a tool response), the current user message is `Continue and complete the user's request based on the tool result above.`
- A case with no message is reported as an error, and nothing is sent.

### Extension Error Messages

An `error` item after the last `user` item (for example "I couldn't generate a response") is the turn's error:

- If the turn already made tool calls, those calls are still scored, and the error text is added to the response (`browser`) or to the agent's message (`simulate`). In `simulate`, DOM assertions and the judge still run.
- If the turn made no tool calls, the case is reported as an error.

---

## 4. Built-in Support: `GoogleChromeLabs/webmcp-extension`

[`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) needs Chrome 155 or later, and it does not need a bridge. When the side-panel page has no `window.__AGENT_AUTOMATION__` bridge, `webmcp-evals` drives these side-panel elements (it also looks inside open Shadow DOM roots):

| Element Role            | [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) Selector |
| :---------------------- | :--------------------------------------------------------------------------------------------------- |
| Consent screen          | `.consent-view`                                                                                      |
| Consent accept button   | `.consent-view .consent__btn--primary`                                                               |
| Settings screen         | `.settings-view`                                                                                     |
| Prompt composer         | `input.text-input__field`                                                                            |
| Send button             | `button[aria-label="send"]`                                                                          |
| Stop button             | `button[aria-label="stop"]`                                                                          |
| New chat button         | `button[aria-label="Start new chat"]`                                                                |
| Attached domain badge   | `.attached-tab__meta`                                                                                |
| Detected tools label    | `.actions-chip__label` _(`webmcp-evals` waits until it shows the page's tools)_                      |
| Messages container      | `.chat-card__messages`                                                                               |
| User message item       | `.user-bubble`                                                                                       |
| Assistant response item | `.ai-response`                                                                                       |
| Error message item      | `.msg.error` (text in `.msg-body`)                                                                   |
| Permission card         | `.tool-permission-card`                                                                              |
| Permission card details | `.tool-permission-card__title`, `__tool-name`, and `__tool-desc` inside the card                     |
| Allow Once button       | `.tool-permission-card__btn--allow`                                                                  |
| Always Allow button     | `.tool-permission-card__btn--always`                                                                 |
| Deny button             | `.tool-permission-card__btn--deny`                                                                   |

Behavior specific to this extension:

- **One-line prompt box**: the composer is an `<input>`, so newlines in a prompt are replaced with spaces before typing.
- **"Keep going?" card**: after many tool calls, the extension shows a "Keep going?" card that looks like a permission prompt. `allow-once` and `always-allow` click "Continue", `deny` clicks "Stop" (which ends the agent's turn), and `none` leaves it.

---

## 5. Custom Extensions: `window.__AGENT_AUTOMATION__`

Any other Chrome extension agent, whatever UI framework it uses (React, Lit, Vue, Svelte, Shadow DOM, generated CSS class names), can work with `webmcp-evals --extension` by exposing `window.__AGENT_AUTOMATION__` on its side-panel page.

`webmcp-evals` uses the bridge when `window.__AGENT_AUTOMATION__` is an object with a `getSnapshot` function. Otherwise it uses the built-in support from section 4.

### TypeScript Interface

<!-- Keep in sync with the bridge types in src/extension/contract.ts. -->

```ts
export type ConfirmationDecision = "allow-once" | "always-allow" | "deny";

export interface PendingConfirmation {
  /** Must stay the same across getSnapshot() calls for the same prompt. */
  readonly id: string;
  readonly title: string;
  readonly toolName: string | null;
  /** True when the prompt offers an "always allow" choice. */
  readonly canAlwaysAllow: boolean;
}

export type AgentTurnItem =
  | { readonly kind: "user"; readonly text: string }
  | { readonly kind: "ai"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

export interface AgentPanelSnapshot {
  /** True while a first-run consent screen blocks the composer. */
  readonly consentVisible?: boolean;
  /** True while a settings view covers the composer. */
  readonly settingsVisible?: boolean;
  /** True when the prompt box can accept a prompt. */
  readonly composerVisible: boolean;
  /** "stop" while the agent is working; anything else ("send", "live", null) means idle. */
  readonly actionVariant: string | null;
  /** Hostname (or host) of the tab the extension is attached to, e.g. "localhost". */
  readonly attachedDomain: string | null;
  /** WebMCP tools the extension found on that tab, or null if it finds tools only while running a turn. */
  readonly detectedToolCount: number | null;
  /** The active tab's conversation, oldest first. */
  readonly items: readonly AgentTurnItem[];
  /** Tool permission prompts waiting for an answer. */
  readonly confirmations?: readonly PendingConfirmation[];
}

export interface WindowAgentAutomationBridge {
  getSnapshot(): AgentPanelSnapshot | Promise<AgentPanelSnapshot>;
  /** Submit a prompt for the active tab; getSnapshot().items must then include it as a user item. */
  sendPrompt(prompt: string): void | Promise<void>;
  /** Stop the current turn, if supported. */
  stopGeneration?(): boolean | Promise<boolean>;
  /** Clear the active tab's conversation. Return false if it could not; webmcp-evals asks again. */
  startNewChat(): boolean | Promise<boolean>;
  /**
   * Answer a pending tool permission prompt by `id`. Required if `getSnapshot()`
   * can list `confirmations` (unless runs use `--confirm-policy none`).
   */
  resolveConfirmation?(id: string, decision: ConfirmationDecision): boolean | Promise<boolean>;
}
```

### Behavior Rules

1. **`sendPrompt` adds a user item**: after `sendPrompt(prompt)`, `getSnapshot().items` must include the prompt as a `{ kind: "user", text }` item. Resolve once the prompt is accepted, not when the turn ends.
2. **`actionVariant` stays `"stop"` for the whole turn**: return `"stop"` from the moment `sendPrompt` starts until the final answer is done and all tool calls have returned, including the gaps between tool calls in a multi-step loop.
3. **Permission prompts go in `confirmations`**: while a tool waits for permission, list it in `confirmations` with an `id` that stays the same across `getSnapshot()` calls, and implement `resolveConfirmation(id, decision)` to answer it. Without `resolveConfirmation`, a listed prompt makes the turn fail with an error, unless the run uses `--confirm-policy none`. A non-empty list counts as busy even if `actionVariant` is not `"stop"`. Set `canAlwaysAllow` to `true` only when the prompt offers an "always allow" choice; otherwise `always-allow` falls back to `allow-once`.
4. **Failures are `error` items**: show model or network failures as `{ kind: "error", text }` items after the last user item.
5. **`attachedDomain` and `detectedToolCount`**: report the hostname (or host) of the attached tab and the number of tools found on it, so that the [panel readiness](#panel-readiness) checks pass. Return `null` for `detectedToolCount` if your extension finds tools only while running a turn.
6. **Consent**: set `consentVisible: true` while a first-run consent screen blocks the prompt box. `webmcp-evals` does not send prompts while it is shown, and the bridge has no way to accept it, so users accept it once in their Chrome profile.
7. **`startNewChat()` clears the active tab's chat**: return `true` once `items` is empty (`[]`), or `false` if it could not clear it. `webmcp-evals` asks again until the panel readiness timeout (`--timeout`).

### Turn Completion

1. After `sendPrompt`, `webmcp-evals` waits up to 10 s until a new `user` item appears **or** the agent reports busy.
2. The agent counts as busy while `actionVariant` is `"stop"` or `confirmations` is not empty. Pending confirmations are answered according to `--confirm-policy`.
3. A turn ends when the agent has been idle for 2,500 ms in a row. Idle time starts counting only after the agent was seen busy once, or 1,500 ms after the prompt was sent. So if `actionVariant` is idle for 2.5 s in the middle of a turn, the turn ends early.
4. The response is all `ai` items after the last `user` item, joined with blank lines. An `error` item after the last `user` item is the turn's error (see [Extension Error Messages](#extension-error-messages)).

### Example Implementation

```ts
// Inside your extension's side-panel entry point.
// Copy the TypeScript interface above into your extension so that
// WindowAgentAutomationBridge is defined here.
declare global {
  interface Window {
    __AGENT_AUTOMATION__?: WindowAgentAutomationBridge;
  }
}

window.__AGENT_AUTOMATION__ = {
  getSnapshot() {
    const session = agentController.getActiveTabSession();
    return {
      composerVisible: session.isReady,
      actionVariant: session.isRunning ? "stop" : "send",
      attachedDomain: session.tabHostname, // e.g. new URL(tab.url).hostname
      detectedToolCount: session.discoveredTools.length,
      items: session.messages.map((msg) => {
        if (msg.role === "user") return { kind: "user", text: msg.content };
        if (msg.role === "error") return { kind: "error", text: msg.content };
        return { kind: "ai", text: msg.content };
      }),
      confirmations: session.pendingApprovals.map((req) => ({
        id: req.requestId,
        title: req.title ?? "Allow tool execution",
        toolName: req.toolName,
        canAlwaysAllow: req.offersAlwaysAllow,
      })),
    };
  },
  async sendPrompt(prompt: string) {
    // Resolve when the prompt is accepted, not when the turn ends.
    await agentController.submitPrompt(prompt);
  },
  async startNewChat() {
    await agentController.clearActiveTabSession();
    return true;
  },
  async stopGeneration() {
    agentController.cancelActiveRun();
    return true;
  },
  async resolveConfirmation(id, decision) {
    return agentController.resolveApproval(id, decision);
  },
};
```
