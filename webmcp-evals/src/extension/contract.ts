/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChromeReleaseChannel, Page } from "puppeteer-core";
import type { ConfirmPolicy, ExtensionConfigOptions } from "../types/config.js";

export type ConfirmationDecision = Exclude<ConfirmPolicy, "none">;

/** How tool permission prompts are answered when `--confirm-policy` is not set. */
export const DEFAULT_CONFIRM_POLICY: ConfirmPolicy = "allow-once";

/** The Chrome that webmcp-evals launches when `--chrome-channel` is not set. */
export const DEFAULT_CHROME_CHANNEL: ChromeReleaseChannel = "chrome-canary";

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

export type NormalizedAgentPanelSnapshot = Required<AgentPanelSnapshot>;

export interface AgentPanelStatus {
  /**
   * True while the agent is working (`actionVariant === "stop"`) or waiting on a
   * confirmation prompt (webmcp-extension hides its stop button while a prompt is shown).
   */
  readonly busy: boolean;
  readonly pendingConfirmations: readonly PendingConfirmation[];
  /** Text of the latest error item after the last user item, if any. */
  readonly error: string | null;
  readonly raw: NormalizedAgentPanelSnapshot;
}

/**
 * Automation bridge a custom extension can expose as `window.__AGENT_AUTOMATION__`
 * on its side-panel page (`chrome-extension://<id>/...`). It is used when it is an
 * object with a `getSnapshot` function.
 * Documented in docs/extension-contract.md; keep both in sync.
 */
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

export interface HandledConfirmationRecord {
  readonly confirmation: PendingConfirmation;
  readonly decision: ConfirmationDecision;
}

export interface RunTurnOptions {
  /** How to answer tool permission prompts (`"none"` leaves them alone). */
  readonly onConfirmation?: ConfirmPolicy;
  /** Called each time a confirmation prompt is answered. */
  readonly onConfirmationHandled?: (record: HandledConfirmationRecord) => void;
  /** Overall turn timeout (default: `DEFAULT_TURN_TIMEOUT_MS`). */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface RunTurnResult {
  readonly responseText: string | null;
  readonly error: string | null;
}

export interface AgentExtensionController {
  readonly extensionId: string;
  readonly extensionName: string;

  /** `timeoutMs` limits page navigation and panel readiness, each on its own. */
  openWebApp(url: string, timeoutMs: number): Promise<Page>;
  closeCurrentWebApp(): Promise<void>;
  runTurn(prompt: string, options?: RunTurnOptions): Promise<RunTurnResult>;
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure Status & Snapshot Helpers
// ---------------------------------------------------------------------------

export function normalizeSnapshot(snapshot: AgentPanelSnapshot): NormalizedAgentPanelSnapshot {
  return {
    consentVisible: Boolean(snapshot.consentVisible),
    settingsVisible: Boolean(snapshot.settingsVisible),
    composerVisible: Boolean(snapshot.composerVisible),
    actionVariant: snapshot.actionVariant ? snapshot.actionVariant.toLowerCase() : null,
    attachedDomain: snapshot.attachedDomain ?? null,
    detectedToolCount:
      typeof snapshot.detectedToolCount === "number" && Number.isFinite(snapshot.detectedToolCount)
        ? snapshot.detectedToolCount
        : null,
    items: Array.isArray(snapshot.items) ? snapshot.items : [],
    confirmations: Array.isArray(snapshot.confirmations) ? snapshot.confirmations : [],
  };
}

export function matchesAttachedDomain(attachedDomain: string | null, targetUrl: URL): boolean {
  if (!attachedDomain) return false;
  const normalized = attachedDomain.trim().toLowerCase().replace(/\/+$/, "");
  return (
    normalized === targetUrl.hostname.toLowerCase() ||
    normalized === targetUrl.host.toLowerCase() ||
    normalized === targetUrl.origin.toLowerCase()
  );
}

/** How long a page that registers zero tools is given before readiness stops waiting for tools. */
export const ZERO_TOOL_GRACE_MS = 1_500;

export type PanelReadiness =
  | { readonly status: "ready" }
  | {
      readonly status: "wait";
      readonly reason: string;
      readonly action?: "accept-consent" | "focus-web-app" | "start-new-chat";
    }
  | { readonly status: "fail"; readonly reason: string };

export interface PanelReadinessContext {
  readonly targetUrl: URL;
  /** Tools registered on the web page itself, if known. */
  readonly pageToolCount: number | undefined;
  readonly waitedMs: number;
  readonly chatCleared: boolean;
  /** Only true when the harness installed the extension itself. */
  readonly canAcceptConsent: boolean;
}

/** Decides whether the extension panel is ready for the first prompt of a case. */
export function checkPanelReadiness(
  snap: NormalizedAgentPanelSnapshot,
  ctx: PanelReadinessContext,
): PanelReadiness {
  if (snap.consentVisible) {
    return ctx.canAcceptConsent
      ? { status: "wait", reason: "consent screen visible", action: "accept-consent" }
      : {
          status: "fail",
          reason:
            "The extension is showing a consent screen. Open its side panel once in this Chrome profile, accept it, and run again.",
        };
  }
  if (!matchesAttachedDomain(snap.attachedDomain, ctx.targetUrl)) {
    return {
      status: "wait",
      reason: `attached to "${snap.attachedDomain ?? "none"}", expected "${ctx.targetUrl.hostname}"`,
      action: "focus-web-app",
    };
  }
  if (snap.detectedToolCount === 0) {
    const pageHasNoTools = ctx.pageToolCount === 0 && ctx.waitedMs >= ZERO_TOOL_GRACE_MS;
    if (!pageHasNoTools) {
      return { status: "wait", reason: "the extension has detected 0 tools so far" };
    }
  }
  if (snap.items.length > 0 && !ctx.chatCleared) {
    return { status: "wait", reason: "clearing prior chat items", action: "start-new-chat" };
  }
  if (!snap.composerVisible) {
    return { status: "wait", reason: "composer input not visible" };
  }
  return { status: "ready" };
}

function itemsAfterLastUser(items: readonly AgentTurnItem[]): readonly AgentTurnItem[] {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "user") return items.slice(i + 1);
  }
  return items;
}

export function deriveAgentStatus(rawSnapshot: AgentPanelSnapshot): AgentPanelStatus {
  const snapshot = normalizeSnapshot(rawSnapshot);
  const errors = itemsAfterLastUser(snapshot.items).filter((item) => item.kind === "error");
  return {
    busy: snapshot.actionVariant === "stop" || snapshot.confirmations.length > 0,
    pendingConfirmations: snapshot.confirmations,
    error: errors.at(-1)?.text ?? null,
    raw: snapshot,
  };
}

export function extractFinalResponse(items: readonly AgentTurnItem[]): string | null {
  const parts = itemsAfterLastUser(items)
    .filter((item) => item.kind === "ai")
    .map((item) => item.text.trim())
    .filter((text) => text.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Describes how Chrome was reached for an `--extension` run, for reports and error messages. */
export function describeExtensionBrowser(
  config: Pick<ExtensionConfigOptions, "browserUrl" | "userDataDir"> & {
    chromeChannel?: ChromeReleaseChannel;
  },
): string {
  if (config.browserUrl) return `Attached (${config.browserUrl})`;
  if (config.userDataDir) return `Persistent profile (${config.userDataDir})`;
  return config.chromeChannel || DEFAULT_CHROME_CHANNEL;
}
