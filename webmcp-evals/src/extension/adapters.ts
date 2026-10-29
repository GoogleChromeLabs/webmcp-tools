/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Page } from "puppeteer-core";
import { pollUntil } from "./asyncUtils.js";
import {
  type AgentPanelSnapshot,
  type AgentTurnItem,
  type ConfirmationDecision,
  type NormalizedAgentPanelSnapshot,
  type PendingConfirmation,
  type WindowAgentAutomationBridge,
  normalizeSnapshot,
} from "./contract.js";

/** How long webmcp-extension may take to hide its consent screen after accepting it. */
const CONSENT_DISMISS_TIMEOUT_MS = 10_000;
/** How long webmcp-extension may take to enable its send button after the prompt is typed. */
const SEND_BUTTON_TIMEOUT_MS = 15_000;
/** A bridge that lists `confirmations` must also be able to answer them. */
export const MISSING_RESOLVE_CONFIRMATION_MESSAGE =
  "The extension lists a tool permission prompt, but window.__AGENT_AUTOMATION__ has no resolveConfirmation(id, decision). Implement it, or run with --confirm-policy none to leave prompts for a human.";

/**
 * Drives one extension's side panel for the controller: through the
 * `window.__AGENT_AUTOMATION__` bridge, or through the built-in
 * GoogleChromeLabs/webmcp-extension DOM selectors.
 */
export interface AgentUiAdapter {
  /** Accepts a first-run consent screen. Only the webmcp-extension DOM path can do this. */
  completeOnboarding(panelPage: Page): Promise<void>;
  readSnapshot(panelPage: Page): Promise<NormalizedAgentPanelSnapshot>;
  submitPrompt(panelPage: Page, prompt: string, signal?: AbortSignal): Promise<void>;
  stopGeneration(panelPage: Page): Promise<boolean>;
  startNewChat(panelPage: Page): Promise<boolean>;
  resolveConfirmation(
    panelPage: Page,
    id: string,
    decision: ConfirmationDecision,
  ): Promise<boolean>;
}

/**
 * DOM selectors for the side panel of
 * [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension).
 * Other extensions should expose `window.__AGENT_AUTOMATION__` instead
 * (see `docs/extension-contract.md`).
 */
export const WEBMCP_EXTENSION_SELECTORS = {
  composer: "input.text-input__field",
  sendButton: 'button[aria-label="send"]',
  stopButton: 'button[aria-label="stop"]',
  messages: ".chat-card__messages",
  userBubble: ".user-bubble",
  aiResponse: ".ai-response",
  errorMessage: ".msg.error",
  errorBody: ".msg-body",
  // The "Keep going?" checkpoint card reuses these classes: allow answers
  // "Continue" and deny answers "Stop".
  permissionCard: ".tool-permission-card",
  permissionTitle: ".tool-permission-card__title",
  permissionToolName: ".tool-permission-card__tool-name",
  permissionToolDesc: ".tool-permission-card__tool-desc",
  permissionAllow: ".tool-permission-card__btn--allow",
  permissionAlways: ".tool-permission-card__btn--always",
  permissionDeny: ".tool-permission-card__btn--deny",
  newChat: 'button[aria-label="Start new chat"]',
  consent: ".consent-view",
  consentAccept: ".consent-view .consent__btn--primary",
  settingsView: ".settings-view",
  attachedTabDomain: ".attached-tab__meta",
  toolsChipLabel: ".actions-chip__label",
} as const;

type WebMcpExtensionSelectors = typeof WEBMCP_EXTENSION_SELECTORS;

export interface RawDomPanelSnapshot {
  readonly consentVisible: boolean;
  readonly settingsVisible: boolean;
  readonly composerVisible: boolean;
  readonly actionVariant: string | null;
  readonly attachedDomain: string | null;
  readonly toolsChipText: string | null;
  readonly items: readonly AgentTurnItem[];
  readonly confirmations: readonly PendingConfirmation[];
}

type InPageSnapshot =
  | { mode: "bridge"; snapshot: AgentPanelSnapshot }
  | { mode: "dom"; raw: RawDomPanelSnapshot };

interface InPageCardTracker {
  seq: number;
  cards: WeakMap<Element, { id: string; signature: string }>;
}

export function parseToolCount(chipText: string | null | undefined): number | null {
  if (!chipText) return null;
  const match = /(\d+)\s*tools?\b/i.exec(chipText);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * Converts a raw DOM read into a snapshot. webmcp-extension only renders its
 * tools label once it has found tools on the page, so a missing label means
 * "0 tools so far" and panel readiness keeps waiting.
 */
export function normalizeDomSnapshot(raw: RawDomPanelSnapshot): NormalizedAgentPanelSnapshot {
  const chipText = raw.toolsChipText?.trim() ?? "";
  const detectedToolCount = !chipText
    ? 0
    : /^\d+$/.test(chipText)
      ? Number.parseInt(chipText, 10)
      : (parseToolCount(chipText) ?? 0);

  return normalizeSnapshot({
    consentVisible: raw.consentVisible,
    settingsVisible: raw.settingsVisible,
    composerVisible: raw.composerVisible,
    actionVariant: raw.actionVariant,
    attachedDomain: raw.attachedDomain,
    detectedToolCount,
    items: raw.items,
    confirmations: raw.confirmations,
  });
}

function toNormalizedSnapshot(outcome: InPageSnapshot): NormalizedAgentPanelSnapshot {
  return outcome.mode === "bridge"
    ? normalizeSnapshot(outcome.snapshot)
    : normalizeDomSnapshot(outcome.raw);
}

/** Buttons to try for a decision, in order. "Always allow" falls back to the one-time allow. */
export function confirmationButtonSelectors(decision: ConfirmationDecision): string[] {
  const sel = WEBMCP_EXTENSION_SELECTORS;
  if (decision === "always-allow") return [sel.permissionAlways, sel.permissionAllow];
  if (decision === "deny") return [sel.permissionDeny];
  return [sel.permissionAllow];
}

// ---------------------------------------------------------------------------
// In-page functions. Each one runs inside the panel page via `panelPage.evaluate`,
// so it must be self-contained (no imports or outer helpers).
// ---------------------------------------------------------------------------

/**
 * Reads the panel state: uses `window.__AGENT_AUTOMATION__` when it is an object
 * with a `getSnapshot` function, and reads the webmcp-extension DOM otherwise.
 */
async function inPageCollectSnapshot(sel: WebMcpExtensionSelectors): Promise<InPageSnapshot> {
  const candidate = (
    window as unknown as { __AGENT_AUTOMATION__?: Partial<WindowAgentAutomationBridge> | null }
  ).__AGENT_AUTOMATION__;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.getSnapshot === "function"
  ) {
    return { mode: "bridge", snapshot: await candidate.getSnapshot() };
  }

  const host = window as unknown as { __webmcpAgentAuto?: InPageCardTracker };
  const state: InPageCardTracker = (host.__webmcpAgentAuto ??= { seq: 0, cards: new WeakMap() });

  const roots: Array<Document | ShadowRoot> = [document];
  for (let i = 0; i < roots.length; i++) {
    for (const el of Array.from(roots[i].querySelectorAll("*"))) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
  }
  const queryAllDeep = (selector: string): Element[] =>
    roots.flatMap((root) => Array.from(root.querySelectorAll(selector)));

  const readText = (el: Element | null | undefined): string =>
    el ? ((el as HTMLElement).innerText ?? el.textContent ?? "").trim() : "";

  const isEnabled = (el: Element): boolean =>
    !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true";

  const items: AgentTurnItem[] = [];
  const container = queryAllDeep(sel.messages)[0];
  if (container) {
    const itemSelector = [sel.userBubble, sel.aiResponse, sel.errorMessage].join(", ");
    for (const el of Array.from(container.querySelectorAll(itemSelector))) {
      const parentMatch = el.parentElement?.closest(itemSelector);
      if (parentMatch && parentMatch !== container && container.contains(parentMatch)) {
        continue;
      }
      if (el.matches(sel.userBubble)) {
        items.push({ kind: "user", text: readText(el) });
      } else if (el.matches(sel.aiResponse)) {
        items.push({ kind: "ai", text: readText(el) });
      } else {
        items.push({ kind: "error", text: readText(el.querySelector(sel.errorBody) ?? el) });
      }
    }
  }

  const confirmations: PendingConfirmation[] = queryAllDeep(sel.permissionCard).map((card) => {
    const title = readText(card.querySelector(sel.permissionTitle)) || "Allow tool action";
    const toolName = readText(card.querySelector(sel.permissionToolName));
    // The description only matters so that a card reused for a new prompt gets a new id.
    const signature = `${title}\n${toolName}\n${readText(card.querySelector(sel.permissionToolDesc))}`;
    let entry = state.cards.get(card);
    if (!entry || entry.signature !== signature) {
      state.seq += 1;
      entry = { id: `perm-${state.seq}`, signature };
      state.cards.set(card, entry);
    }
    return {
      id: entry.id,
      title,
      toolName: toolName || null,
      canAlwaysAllow: Boolean(card.querySelector(sel.permissionAlways)),
    };
  });

  const stopBtn = queryAllDeep(sel.stopButton).find(isEnabled);
  const sendBtn = queryAllDeep(sel.sendButton).find(isEnabled);
  const domainEl = queryAllDeep(sel.attachedTabDomain)[0];
  const chipEl = queryAllDeep(sel.toolsChipLabel)[0];

  return {
    mode: "dom",
    raw: {
      consentVisible: queryAllDeep(sel.consent).length > 0,
      settingsVisible: queryAllDeep(sel.settingsView).length > 0,
      composerVisible: queryAllDeep(sel.composer).length > 0,
      actionVariant: stopBtn ? "stop" : sendBtn ? "send" : null,
      attachedDomain: domainEl ? readText(domainEl) : null,
      toolsChipText: chipEl ? readText(chipEl) : null,
      items,
      confirmations,
    },
  };
}

type DomAction =
  | { kind: "fill-composer"; selector: string; value: string }
  | { kind: "click-enabled"; selector: string }
  | {
      kind: "resolve-confirmation";
      cardSelector: string;
      id: string;
      buttonSelectors: readonly string[];
    };

/**
 * Executes a DOM action (filling the composer, clicking an enabled button, or
 * answering a permission card) across the document and any open shadow roots.
 */
function inPageDomAction(action: DomAction): boolean {
  const roots: Array<Document | ShadowRoot> = [document];
  for (let i = 0; i < roots.length; i++) {
    for (const el of Array.from(roots[i].querySelectorAll("*"))) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
  }
  const queryAllDeep = <T extends Element = Element>(selector: string): T[] =>
    roots.flatMap((root) => Array.from(root.querySelectorAll<T>(selector)));
  const isEnabled = (el: Element): boolean =>
    !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true";

  if (action.kind === "fill-composer") {
    const input = queryAllDeep<HTMLInputElement>(action.selector)[0];
    if (!input) return false;
    input.focus();
    // An <input> drops newlines, which would glue the lines together.
    const singleLine = action.value.replace(/\s*[\r\n]+\s*/g, " ");
    // React ignores plain `.value` writes on controlled inputs; the native setter plus
    // an `input` event is what its onChange sees.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      singleLine,
    );
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  if (action.kind === "click-enabled") {
    const btn = queryAllDeep<HTMLButtonElement>(action.selector).find(isEnabled);
    if (!btn) return false;
    btn.click();
    return true;
  }

  const state = (window as unknown as { __webmcpAgentAuto?: InPageCardTracker }).__webmcpAgentAuto;
  if (!state) return false;
  const card = queryAllDeep(action.cardSelector).find(
    (candidate) => state.cards.get(candidate)?.id === action.id,
  );
  if (!card) return false;
  for (const selector of action.buttonSelectors) {
    const btn = card.querySelector<HTMLButtonElement>(selector);
    if (btn && isEnabled(btn)) {
      btn.click();
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

type BridgeHost = { __AGENT_AUTOMATION__?: WindowAgentAutomationBridge };

/**
 * Drives an extension's side panel: uses `window.__AGENT_AUTOMATION__` when the
 * panel exposes it and the built-in DOM selectors for
 * `GoogleChromeLabs/webmcp-extension` otherwise.
 */
export function createAutoDetectingExtensionAdapter(): AgentUiAdapter {
  const sel = WEBMCP_EXTENSION_SELECTORS;
  // Remembered from each panel page's latest snapshot so actions need no extra round trip.
  const modeByPage = new WeakMap<Page, InPageSnapshot["mode"]>();

  const collect = async (panelPage: Page): Promise<InPageSnapshot> => {
    const outcome = await panelPage.evaluate(inPageCollectSnapshot, sel);
    modeByPage.set(panelPage, outcome.mode);
    return outcome;
  };
  const readSnapshot = async (panelPage: Page): Promise<NormalizedAgentPanelSnapshot> =>
    toNormalizedSnapshot(await collect(panelPage));
  const isBridge = async (panelPage: Page): Promise<boolean> =>
    (modeByPage.get(panelPage) ?? (await collect(panelPage)).mode) === "bridge";
  const runDomAction = (panelPage: Page, action: DomAction): Promise<boolean> =>
    panelPage.evaluate(inPageDomAction, action);

  return {
    readSnapshot,

    async completeOnboarding(panelPage) {
      if (await isBridge(panelPage)) {
        throw new Error(
          "The extension shows a consent screen, and window.__AGENT_AUTOMATION__ has no way to accept it. Accept it once in a Chrome profile and pass that profile with --user-data-dir.",
        );
      }
      const clicked = await runDomAction(panelPage, {
        kind: "click-enabled",
        selector: sel.consentAccept,
      });
      if (!clicked) {
        throw new Error("Extension consent view is shown, but accept button was not found.");
      }
      await pollUntil(
        async () => {
          const snap = await readSnapshot(panelPage);
          return !snap.consentVisible ? true : undefined;
        },
        {
          timeoutMs: CONSENT_DISMISS_TIMEOUT_MS,
          intervalMs: 100,
          label: "consent screen dismissal",
        },
      );
    },

    async submitPrompt(panelPage, prompt, signal) {
      if (await isBridge(panelPage)) {
        await panelPage.evaluate(async (text) => {
          const bridge = (window as unknown as BridgeHost).__AGENT_AUTOMATION__;
          if (!bridge || typeof bridge !== "object") {
            throw new Error(
              "window.__AGENT_AUTOMATION__ is not defined on the extension panel page.",
            );
          }
          await bridge.sendPrompt(text);
        }, prompt);
        return;
      }

      const filled = await runDomAction(panelPage, {
        kind: "fill-composer",
        selector: sel.composer,
        value: prompt,
      });
      if (!filled) {
        throw new Error(
          `The webmcp-extension prompt box (${sel.composer}) was not found in the side panel. Other extensions must expose window.__AGENT_AUTOMATION__ (see docs/extension-contract.md).`,
        );
      }
      await pollUntil(
        async () => {
          const snap = await readSnapshot(panelPage);
          if (snap.actionVariant !== "send") return undefined;
          const clicked = await runDomAction(panelPage, {
            kind: "click-enabled",
            selector: sel.sendButton,
          });
          return clicked ? true : undefined;
        },
        { timeoutMs: SEND_BUTTON_TIMEOUT_MS, intervalMs: 50, signal, label: "send button enabled" },
      );
    },

    async stopGeneration(panelPage) {
      if (!(await isBridge(panelPage))) {
        return runDomAction(panelPage, {
          kind: "click-enabled",
          selector: sel.stopButton,
        });
      }
      return panelPage.evaluate(async () => {
        const b = (window as unknown as BridgeHost).__AGENT_AUTOMATION__;
        return b && typeof b === "object" && b.stopGeneration
          ? Boolean(await b.stopGeneration())
          : false;
      });
    },

    async startNewChat(panelPage) {
      if (!(await isBridge(panelPage))) {
        return runDomAction(panelPage, {
          kind: "click-enabled",
          selector: sel.newChat,
        });
      }
      return panelPage.evaluate(async () => {
        const b = (window as unknown as BridgeHost).__AGENT_AUTOMATION__;
        return b && typeof b === "object" ? Boolean(await b.startNewChat()) : false;
      });
    },

    async resolveConfirmation(panelPage, id, decision) {
      if (!(await isBridge(panelPage))) {
        return runDomAction(panelPage, {
          kind: "resolve-confirmation",
          cardSelector: sel.permissionCard,
          id,
          buttonSelectors: confirmationButtonSelectors(decision),
        });
      }
      const outcome = await panelPage.evaluate(
        async (cardId, dec) => {
          const b = (window as unknown as BridgeHost).__AGENT_AUTOMATION__;
          if (!b || typeof b !== "object" || typeof b.resolveConfirmation !== "function") {
            return "missing";
          }
          return (await b.resolveConfirmation(cardId, dec)) ? "resolved" : "unresolved";
        },
        id,
        decision,
      );
      if (outcome === "missing") {
        throw new Error(MISSING_RESOLVE_CONFIRMATION_MESSAGE);
      }
      return outcome === "resolved";
    },
  };
}
