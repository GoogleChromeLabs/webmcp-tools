/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { Browser } from "puppeteer-core";
import type {
  AgentExtensionController,
  AgentTurnItem,
  WindowAgentAutomationBridge,
} from "../extension/contract.js";
import {
  attachAutoDismissDialogHandler,
  connectExtensionController,
  resolveDefaultHeadless,
  validateExtensionOptions,
} from "../extension/controller.js";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const PANEL_URL = `chrome-extension://${EXTENSION_ID}/sidepanel/index.html`;
const APP_URL = "http://localhost:5173/";
/** Plenty of time: the fake Chrome answers at once. */
const OPEN_TIMEOUT_MS = 2_000;

/** What the fake extension's side panel shows, and how it reacts to the controller. */
interface FakeExtension {
  items: AgentTurnItem[];
  busy: boolean;
  /** What `startNewChat()` returns. The chat is only cleared when it returns `true`. */
  startNewChatResult: boolean;
  newChatRequests: number;
  /** Stop attempts that fail first, like a stop button that appears a moment late. */
  stopFailuresLeft: number;
  stopCalls: number;
  stopped: boolean;
  onSendPrompt?: () => void;
}

function fakeExtension(overrides: Partial<FakeExtension> = {}): FakeExtension {
  return {
    items: [],
    busy: false,
    startNewChatResult: true,
    newChatRequests: 0,
    stopFailuresLeft: 0,
    stopCalls: 0,
    stopped: false,
    ...overrides,
  };
}

type TargetType = "page" | "other" | "service_worker";

class FakeTarget {
  readonly #type: TargetType;
  readonly #url: string;
  readonly page: FakePage | null;

  constructor(type: TargetType, url: string, page: FakePage | null = null) {
    this.#type = type;
    this.#url = url;
    this.page = page;
  }

  type(): TargetType {
    return this.#type;
  }

  /** A page's target follows the page's current URL. */
  url(): string {
    return this.page?.url() ?? this.#url;
  }

  async asPage(): Promise<FakePage | null> {
    return this.page;
  }

  /** An awake service worker answers `chrome.runtime.getManifest()` during discovery. */
  async worker(): Promise<{ evaluate(): Promise<unknown> } | null> {
    if (this.#type !== "service_worker") return null;
    return {
      evaluate: async () => ({
        name: "Fake Agent",
        side_panel: { default_path: "sidepanel/index.html" },
      }),
    };
  }
}

class FakePage {
  /** "helper" is the Tier 2 tab that opens the side panel; "panel" is the panel page. */
  role: "tab" | "helper" | "panel" = "tab";
  closed = false;
  readonly webmcp = { tools: () => [{ name: "addTopping" }] };
  readonly mouse: { click(): Promise<void> };
  readonly #browser: FakeBrowser;
  readonly #target: FakeTarget;
  readonly #background: boolean;
  #currentUrl: string;
  #helperEvaluations = 0;

  constructor(
    browser: FakeBrowser,
    url: string,
    options: { targetType?: TargetType; background?: boolean } = {},
  ) {
    this.#browser = browser;
    this.#currentUrl = url;
    this.#background = options.background ?? false;
    this.#target = new FakeTarget(options.targetType ?? "page", url, this);
    browser.addTarget(this.#target);
    this.mouse = {
      // In the helper tab, the click calls chrome.sidePanel.open(), and Chrome adds the panel.
      click: async () => {
        if (this.role === "helper") browser.openSidePanel();
      },
    };
  }

  url(): string {
    return this.#currentUrl;
  }

  target(): FakeTarget {
    return this.#target;
  }

  on(): void {}

  async bringToFront(): Promise<void> {
    this.#browser.activePage = this;
  }

  async goto(url: string): Promise<{ ok(): boolean }> {
    this.#currentUrl = url;
    if (url === PANEL_URL) {
      // In a background tab the panel page is Tier 3; in the front it is the Tier 2 helper.
      this.role = this.#background ? "panel" : "helper";
      if (this.role === "helper") this.#browser.helperTabsOpened++;
    }
    return { ok: () => true };
  }

  isClosed(): boolean {
    return this.closed;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.#browser.removeTarget(this.#target);
    if (this.#browser.activePage === this) this.#browser.activePage = null;
  }

  async setViewport(): Promise<void> {}

  async createCDPSession(): Promise<{
    send(method: string, params: { origin: string }): Promise<void>;
    detach(): Promise<void>;
  }> {
    this.#browser.cdpSessions++;
    return {
      send: async (method, params) => {
        this.#browser.cdpCommands.push(`${method} ${params.origin}`);
      },
      detach: async () => {},
    };
  }

  async evaluate(fn: (...args: unknown[]) => unknown, ...args: unknown[]): Promise<unknown> {
    if (this.role === "helper") {
      // 1st call sets up the full-page button (null: no problem). 2nd waits for sidePanel.open().
      this.#helperEvaluations++;
      return this.#helperEvaluations === 1 ? null : undefined;
    }
    if (this.role === "panel") {
      // The adapter's in-page functions read `window.__AGENT_AUTOMATION__`.
      (globalThis as Record<string, unknown>).window = {
        __AGENT_AUTOMATION__: this.#browser.bridge,
      };
      return await fn(...args);
    }
    return undefined;
  }
}

/** A Chrome reached over --browser-url (or launched, with the `launchBrowser` seam). */
class FakeBrowser {
  activePage: FakePage | null = null;
  helperTabsOpened = 0;
  sidePanelsOpened = 0;
  cdpSessions = 0;
  readonly cdpCommands: string[] = [];
  disconnected = false;
  closed = false;
  readonly bridge: WindowAgentAutomationBridge;
  #targets: FakeTarget[] = [];

  constructor(extension: FakeExtension) {
    this.bridge = fakeBridge(this, extension);
    // The extension's service worker is awake, so discovery finds it from its target.
    this.addTarget(
      new FakeTarget("service_worker", `chrome-extension://${EXTENSION_ID}/background.js`),
    );
    // The tab that was already open.
    this.activePage = new FakePage(this, "about:blank");
  }

  addTarget(target: FakeTarget): void {
    this.#targets.push(target);
  }

  removeTarget(target: FakeTarget): void {
    this.#targets = this.#targets.filter((t) => t !== target);
  }

  targets(): FakeTarget[] {
    return [...this.#targets];
  }

  async pages(): Promise<FakePage[]> {
    return this.#targets.flatMap((t) => (t.type() === "page" && t.page ? [t.page] : []));
  }

  async newPage(options?: { background?: boolean }): Promise<FakePage> {
    return new FakePage(this, "about:blank", { background: options?.background ?? false });
  }

  async extensions(): Promise<never> {
    throw new Error("Extensions are only listed over a pipe.");
  }

  async waitForTarget(
    predicate: (target: FakeTarget) => boolean,
    options: { timeout: number },
  ): Promise<FakeTarget> {
    const deadline = Date.now() + options.timeout;
    for (;;) {
      const found = this.#targets.find(predicate);
      if (found) return found;
      if (Date.now() >= deadline) {
        throw new Error(`Waiting for target failed: timeout ${options.timeout}ms exceeded`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** `chrome.sidePanel.open()`: Chrome adds the side panel as an "other" target. */
  openSidePanel(): void {
    this.sidePanelsOpened++;
    new FakePage(this, PANEL_URL, { targetType: "other" }).role = "panel";
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** The extension attaches to the active tab, but only to web pages. */
function attachedHostname(url: string | undefined): string | null {
  return url?.startsWith("http") ? new URL(url).hostname : null;
}

function fakeBridge(browser: FakeBrowser, extension: FakeExtension): WindowAgentAutomationBridge {
  return {
    getSnapshot: () => ({
      composerVisible: true,
      actionVariant: extension.busy ? "stop" : "send",
      attachedDomain: attachedHostname(browser.activePage?.url()),
      detectedToolCount: 1,
      items: extension.items,
    }),
    sendPrompt: (prompt) => {
      extension.items = [...extension.items, { kind: "user", text: prompt }];
      extension.busy = true;
      extension.onSendPrompt?.();
    },
    stopGeneration: () => {
      extension.stopCalls++;
      if (extension.stopFailuresLeft > 0) {
        extension.stopFailuresLeft--;
        return false;
      }
      extension.busy = false;
      extension.stopped = true;
      return true;
    },
    startNewChat: () => {
      extension.newChatRequests++;
      if (extension.startNewChatResult) extension.items = [];
      return extension.startNewChatResult;
    },
  };
}

/** Connects the real controller to the fake Chrome, as with --browser-url. */
function attachTo(browser: FakeBrowser): Promise<AgentExtensionController> {
  return connectExtensionController(
    { extension: EXTENSION_ID, browserUrl: "http://127.0.0.1:9222" },
    { connectBrowser: async () => browser as unknown as Browser },
  );
}

describe("connectExtensionController with a fake Chrome", () => {
  const globals = globalThis as Record<string, unknown>;
  const hadWindow = "window" in globals;
  const originalWindow = globals.window;

  afterEach(() => {
    // The fake panel page sets a global `window` for the adapter's in-page functions.
    if (hadWindow) {
      globals.window = originalWindow;
    } else {
      delete globals.window;
    }
  });

  it("needs a profile, a running Chrome, or an unpacked directory to find an installed extension", async () => {
    await assert.rejects(
      connectExtensionController({ extension: "WebMCP Extension" }),
      /empty temporary Chrome profile/,
    );
  });

  it("never clears site data or closes Chrome when attached with --browser-url", async () => {
    const browser = new FakeBrowser(fakeExtension());
    const controller = await attachTo(browser);
    await controller.openWebApp(APP_URL, OPEN_TIMEOUT_MS);
    await controller.dispose();

    assert.strictEqual(browser.cdpSessions, 0);
    assert.strictEqual(browser.disconnected, true);
    assert.strictEqual(browser.closed, false);

    // The same fake records the CDP call when webmcp-evals launched Chrome itself.
    const launched = new FakeBrowser(fakeExtension());
    const owned = await connectExtensionController(
      { extension: EXTENSION_ID, userDataDir: "/tmp/fake-chrome-profile" },
      { launchBrowser: async () => launched as unknown as Browser },
    );
    await owned.openWebApp(APP_URL, OPEN_TIMEOUT_MS);
    await owned.dispose();

    assert.deepStrictEqual(launched.cdpCommands, [
      "Storage.clearDataForOrigin http://localhost:5173",
    ]);
    assert.strictEqual(launched.closed, true);
  });

  it("reuses the open side panel for the next case, so the helper tab opens only once", async () => {
    const browser = new FakeBrowser(fakeExtension());
    const controller = await attachTo(browser);
    await controller.openWebApp(APP_URL, OPEN_TIMEOUT_MS);
    await controller.closeCurrentWebApp();
    await controller.openWebApp(APP_URL, OPEN_TIMEOUT_MS);
    await controller.dispose();

    assert.strictEqual(browser.helperTabsOpened, 1);
    assert.strictEqual(browser.sidePanelsOpened, 1);
  });

  it("does not report the panel ready while the extension cannot clear the previous chat", async () => {
    const extension = fakeExtension({
      items: [
        { kind: "user", text: "previous case prompt" },
        { kind: "ai", text: "previous case answer" },
      ],
      startNewChatResult: false,
    });
    const browser = new FakeBrowser(extension);
    const controller = await attachTo(browser);

    await assert.rejects(controller.openWebApp(APP_URL, 300), /clearing prior chat items/);
    await controller.dispose();

    assert.ok(extension.newChatRequests >= 1);
    assert.strictEqual(extension.items.length, 2);
  });

  it("keeps trying to stop the extension when the budget ends right after the prompt is sent", async () => {
    const budget = new AbortController();
    const extension = fakeExtension({
      stopFailuresLeft: 2,
      onSendPrompt: () => budget.abort(new Error("budget expired")),
    });
    const browser = new FakeBrowser(extension);
    const controller = await attachTo(browser);
    await controller.openWebApp(APP_URL, OPEN_TIMEOUT_MS);

    await assert.rejects(
      controller.runTurn("Add basil", { signal: budget.signal }),
      /budget expired/,
    );
    await controller.dispose();

    assert.strictEqual(extension.stopCalls, 3);
    assert.strictEqual(extension.stopped, true);
  });
});

describe("resolveDefaultHeadless & validateExtensionOptions", () => {
  it("chooses headless default based on platform and display environment", () => {
    assert.strictEqual(resolveDefaultHeadless("linux", {}), true);
    assert.strictEqual(resolveDefaultHeadless("linux", { DISPLAY: ":0" }), false);
    assert.strictEqual(resolveDefaultHeadless("linux", { WAYLAND_DISPLAY: "wayland-0" }), false);
    assert.strictEqual(resolveDefaultHeadless("darwin", {}), false);
  });

  it("fails fast, before Chrome starts, on a missing extension, unpacked directory, or broken manifest", () => {
    assert.throws(() => validateExtensionOptions({ extension: "   " }), /Missing --extension/);
    assert.throws(
      () =>
        validateExtensionOptions({
          extension: "./nonexistent-unpacked-extension-dir",
        }),
      /Unpacked extension directory .* does not exist or does not contain manifest\.json/,
    );
    const brokenDir = mkdtempSync(join(tmpdir(), "webmcp-evals-broken-extension-"));
    try {
      writeFileSync(join(brokenDir, "manifest.json"), "{ not json");
      assert.throws(
        () => validateExtensionOptions({ extension: brokenDir }),
        /Could not read .*manifest\.json: /,
      );
    } finally {
      rmSync(brokenDir, { recursive: true, force: true });
    }
  });
});

describe("attachAutoDismissDialogHandler", () => {
  it("dismisses dialogs such as alert() and accepts beforeunload", async () => {
    const events: string[] = [];
    let listener:
      | ((dialog: { type(): string; accept(): Promise<void>; dismiss(): Promise<void> }) => void)
      | undefined;

    attachAutoDismissDialogHandler({
      on(event, fn) {
        if (event === "dialog") listener = fn;
      },
    });

    assert.ok(listener);
    listener!({
      type: () => "alert",
      accept: async () => {
        events.push("accept:alert");
      },
      dismiss: async () => {
        events.push("dismiss:alert");
      },
    });
    listener!({
      type: () => "beforeunload",
      accept: async () => {
        events.push("accept:beforeunload");
      },
      dismiss: async () => {
        events.push("dismiss:beforeunload");
      },
    });

    await Promise.resolve();
    assert.deepStrictEqual(events, ["dismiss:alert", "accept:beforeunload"]);
  });
});
