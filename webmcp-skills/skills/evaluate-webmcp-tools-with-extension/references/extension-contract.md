<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# WebMCP Extension Automation Contract Reference

Source of truth: [webmcp-evals/docs/extension-contract.md](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/webmcp-evals/docs/extension-contract.md). This file copies the parts that a custom extension needs, so that the skill also works offline. Keep the copies in sync.

## Side-Panel Path

`webmcp-evals` finds the extension's side-panel page in this order:

1. `--extension-panel-path <path>` (if provided),
2. `manifest.json` → `side_panel.default_path`,
3. `sidepanel/index.html`.

If Chrome cannot open the side panel, `webmcp-evals` opens this page in a background tab instead and prints a warning. The web page stays the active tab.

## Custom Extensions: `window.__AGENT_AUTOMATION__`

Any other Chrome extension agent, whatever UI framework it uses (React, Lit, Vue, Svelte, Shadow DOM, generated CSS class names), can work with `webmcp-evals --extension` by exposing `window.__AGENT_AUTOMATION__` on its side-panel page.

`webmcp-evals` uses the bridge when `window.__AGENT_AUTOMATION__` is an object with a `getSnapshot` function. Otherwise it uses its built-in support, which works only for [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension).

### TypeScript Interface

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
5. **`attachedDomain` and `detectedToolCount`**: report the hostname (or host) of the attached tab and the number of tools found on it, so that the [panel readiness](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/webmcp-evals/docs/extension-contract.md#panel-readiness) checks pass. Return `null` for `detectedToolCount` if your extension finds tools only while running a turn.
6. **Consent**: set `consentVisible: true` while a first-run consent screen blocks the prompt box. `webmcp-evals` does not send prompts while it is shown, and the bridge has no way to accept it, so users accept it once in their Chrome profile.
7. **`startNewChat()` clears the active tab's chat**: return `true` once `items` is empty (`[]`), or `false` if it could not clear it. `webmcp-evals` asks again until the panel readiness timeout (`--timeout`).

### Turn Completion

1. After `sendPrompt`, `webmcp-evals` waits up to 10 s until a new `user` item appears **or** the agent reports busy.
2. The agent counts as busy while `actionVariant` is `"stop"` or `confirmations` is not empty. Pending confirmations are answered according to `--confirm-policy`.
3. A turn ends when the agent has been idle for 2,500 ms in a row. Idle time starts counting only after the agent was seen busy once, or 1,500 ms after the prompt was sent. So if `actionVariant` is idle for 2.5 s in the middle of a turn, the turn ends early.
4. The response is all `ai` items after the last `user` item, joined with blank lines. An `error` item after the last `user` item is the turn's error (see [Extension Error Messages](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/webmcp-evals/docs/extension-contract.md#extension-error-messages)).

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
