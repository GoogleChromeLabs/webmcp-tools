/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, {
  type Browser,
  type ChromeReleaseChannel,
  type Page,
  type Target,
} from "puppeteer-core";
import type { ExtensionConfigOptions } from "../types/config.js";
import { logger } from "../utils/logger.js";
import { type AgentUiAdapter, createAutoDetectingExtensionAdapter } from "./adapters.js";
import { delay, pollUntil } from "./asyncUtils.js";
import {
  type AgentExtensionController,
  type AgentPanelStatus,
  type ConfirmationDecision,
  type RunTurnOptions,
  type RunTurnResult,
  checkPanelReadiness,
  DEFAULT_CHROME_CHANNEL,
  deriveAgentStatus,
  matchesAttachedDomain,
} from "./contract.js";
import {
  type DiscoveredExtensionInfo,
  expandUserPath,
  isExtensionId,
  looksLikeFilesystemPath,
  resolveInstalledExtensionInBrowser,
  resolvePanelPath,
  resolveUnpackedExtensionDir,
} from "./discovery.js";
import { waitForTurnToFinish } from "./turn.js";

/** How to reach Chrome and which extension to evaluate against. */
type ExtensionLaunchOptions = ExtensionConfigOptions & { chromeChannel?: ChromeReleaseChannel };

const PANEL_TAB_VIEWPORT = { width: 360, height: 760 } as const;

/** Loading an extension page, or waiting for a freshly installed extension's service worker. */
const EXTENSION_PAGE_TIMEOUT_MS = 15_000;
/** Waiting for the side panel to appear after asking Chrome to open it. */
const SIDE_PANEL_OPEN_TIMEOUT_MS = 5_000;
/** Waiting for the panel to show a sent prompt, or to start working on it. */
const PROMPT_ACK_TIMEOUT_MS = 10_000;
/** Waiting for an answered permission prompt to disappear from the panel. */
const CONFIRMATION_DISMISS_TIMEOUT_MS = 3_000;
/** Retrying stop, because the stop button can appear a moment after a prompt is sent. */
const STOP_RETRY_TIMEOUT_MS = 2_000;

/** Injection points for tests, so the controller can run against a fake browser. */
export type ExtensionControllerDependencies = {
  connectBrowser?: (browserUrl: string) => Promise<Browser>;
  launchBrowser?: (options: ExtensionLaunchOptions) => Promise<Browser>;
};

/**
 * Connects to an already-running Chrome (`browserUrl`) or launches Chrome
 * (`userDataDir` / unpacked extension), resolves the target extension by ID,
 * manifest name, or unpacked directory path, and prepares panel automation.
 */
export async function connectExtensionController(
  options: ExtensionLaunchOptions,
  dependencies: ExtensionControllerDependencies = {},
): Promise<AgentExtensionController> {
  validateExtensionOptions(options);

  const unpacked = resolveUnpackedExtensionDir(options.extension);
  if (!unpacked && !options.browserUrl && !options.userDataDir) {
    throw new Error(
      `Cannot find installed extension "${options.extension}" in an empty temporary Chrome profile. ` +
        `Pass --user-data-dir <profile-dir>, attach to a running Chrome via --browser-url <http-or-ws-url>, ` +
        `or pass a path to an unpacked extension directory containing manifest.json.`,
    );
  }

  let browser: Browser;
  let ownedBrowser: boolean;

  if (options.browserUrl) {
    browser = await (dependencies.connectBrowser ?? connectToRunningChrome)(options.browserUrl);
    ownedBrowser = false;
  } else {
    browser = await (dependencies.launchBrowser ?? launchExtensionChrome)(options);
    ownedBrowser = true;
  }

  try {
    // Keep one ordinary tab open, so closing a case's tab never closes the window
    // (and the side panel with it).
    const existingPages = await browser.pages();
    const nonExtensionPage = existingPages.find((p) => !p.url().startsWith("chrome-extension://"));
    const createdAnchorPage = !nonExtensionPage;
    const anchorPage = nonExtensionPage ?? (await browser.newPage());

    let resolved: DiscoveredExtensionInfo;
    let freshlyInstalled = false;

    if (unpacked && ownedBrowser) {
      const extensionId = await browser.installExtension(unpacked.dir);
      freshlyInstalled = true;
      const serviceWorker = unpacked.manifest.background?.service_worker;
      if (serviceWorker) {
        const swUrl = `chrome-extension://${extensionId}/${serviceWorker.replace(/^\/+/, "")}`;
        await browser
          .waitForTarget((target) => target.type() === "service_worker" && target.url() === swUrl, {
            timeout: EXTENSION_PAGE_TIMEOUT_MS,
          })
          .catch(() =>
            logger.warn(
              `The extension's service worker did not start within ${EXTENSION_PAGE_TIMEOUT_MS} ms. Continuing.`,
            ),
          );
      }
      resolved = {
        id: extensionId,
        name: unpacked.manifest.name || extensionId,
        panelPath: resolvePanelPath(unpacked.manifest, options.extensionPanelPath),
        enabled: true,
      };
    } else {
      const lookupQuery =
        unpacked?.manifest.name && !isExtensionId(options.extension)
          ? unpacked.manifest.name
          : options.extension;
      resolved = await resolveInstalledExtensionInBrowser(
        browser,
        lookupQuery,
        options.extensionPanelPath,
        ownedBrowser,
      );
    }

    return new PuppeteerAgentExtensionController({
      browser,
      ownedBrowser,
      anchorPage,
      createdAnchorPage,
      extensionId: resolved.id,
      extensionName: resolved.name,
      panelPath: resolved.panelPath,
      autoAcceptConsent: freshlyInstalled,
    });
  } catch (error) {
    if (ownedBrowser) {
      await browser.close().catch(() => undefined);
    } else {
      await browser.disconnect().catch(() => undefined);
    }
    throw error;
  }
}

export function resolveDefaultHeadless(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (platform === "linux") {
    return !env["DISPLAY"] && !env["WAYLAND_DISPLAY"];
  }
  return false;
}

/**
 * Fails fast, before Chrome starts, on inputs that can be checked locally.
 * Flag combinations are validated by the CLI (`resolveExtensionCliOptions`).
 */
export function validateExtensionOptions<T extends { extension?: string }>(
  options: T,
): asserts options is T & { extension: string } {
  if (!options.extension || !options.extension.trim()) {
    throw new Error(
      "Missing --extension <id-or-name-or-path>. Specify an installed extension ID, manifest name, or unpacked directory.",
    );
  }
  if (
    looksLikeFilesystemPath(options.extension) &&
    !resolveUnpackedExtensionDir(options.extension)
  ) {
    throw new Error(
      `Unpacked extension directory "${options.extension}" (resolved to "${expandUserPath(options.extension)}") does not exist or does not contain manifest.json.`,
    );
  }
}

class PuppeteerAgentExtensionController implements AgentExtensionController {
  readonly extensionId: string;
  readonly extensionName: string;
  readonly #browser: Browser;
  readonly #ownedBrowser: boolean;
  readonly #anchorPage: Page;
  readonly #createdAnchorPage: boolean;
  readonly #adapter: AgentUiAdapter = createAutoDetectingExtensionAdapter();
  readonly #panelUrl: string;
  readonly #autoAcceptConsent: boolean;

  #webAppPage: Page | null = null;
  #panelPage: Page | null = null;
  #activeMode: "side-panel" | "tab" | null = null;
  #sidePanelFailedReason: string | null = null;
  #expectedTargetUrl: URL | null = null;

  constructor(params: {
    browser: Browser;
    ownedBrowser: boolean;
    anchorPage: Page;
    createdAnchorPage: boolean;
    extensionId: string;
    extensionName: string;
    /** Side-panel HTML path inside `chrome-extension://<id>/`, without a leading slash. */
    panelPath: string;
    autoAcceptConsent: boolean;
  }) {
    this.#browser = params.browser;
    this.#ownedBrowser = params.ownedBrowser;
    this.#anchorPage = params.anchorPage;
    this.#createdAnchorPage = params.createdAnchorPage;
    this.extensionId = params.extensionId;
    this.extensionName = params.extensionName;
    this.#autoAcceptConsent = params.autoAcceptConsent;
    this.#panelUrl = `chrome-extension://${params.extensionId}/${params.panelPath}`;
  }

  async openWebApp(url: string, timeoutMs: number): Promise<Page> {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Expected an http(s) WebMCP app URL, got: ${url}`);
    }

    await this.closeCurrentWebApp();
    this.#expectedTargetUrl = parsed;

    // Open in a new tab so tab-scoped side-panel extensions start with a fresh chat.
    const page = await this.#browser.newPage();
    attachAutoDismissDialogHandler(page);
    this.#webAppPage = page;

    try {
      await page.bringToFront();

      // Reset the site's state between cases, but never in the user's own browser
      // (--browser-url), where this would also wipe their cookies and logins.
      if (this.#ownedBrowser) {
        await clearWebOriginData(page, parsed.origin);
      }

      await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
      await this.#attachPanel(page, parsed, timeoutMs);
      return page;
    } catch (error) {
      await this.closeCurrentWebApp();
      throw error;
    }
  }

  async closeCurrentWebApp(): Promise<void> {
    // A real side panel stays open for the next case; a panel page in a tab is closed.
    if (this.#activeMode === "tab" && this.#panelPage) {
      if (!this.#panelPage.isClosed()) {
        await this.#panelPage.close().catch(() => undefined);
      }
      this.#panelPage = null;
      this.#activeMode = null;
    }
    if (this.#webAppPage && !this.#webAppPage.isClosed()) {
      await this.#webAppPage.close().catch(() => undefined);
    }
    this.#webAppPage = null;
    this.#expectedTargetUrl = null;
  }

  async #sendPrompt(prompt: string, signal?: AbortSignal): Promise<void> {
    const panel = this.#requirePanel();
    const beforeSnapshot = await this.#adapter.readSnapshot(panel);
    const prevUserCount = beforeSnapshot.items.filter((i) => i.kind === "user").length;

    await this.#adapter.submitPrompt(panel, prompt, signal);

    await pollUntil(
      async () => {
        const snap = await this.#adapter.readSnapshot(panel);
        const userCount = snap.items.filter((i) => i.kind === "user").length;
        const status = deriveAgentStatus(snap);
        return userCount > prevUserCount || status.busy ? true : undefined;
      },
      {
        timeoutMs: PROMPT_ACK_TIMEOUT_MS,
        intervalMs: 100,
        signal,
        label: "prompt submission acknowledgement",
      },
    );
  }

  async #getStatus(signal?: AbortSignal): Promise<AgentPanelStatus> {
    const panel = this.#requirePanel();
    let snapshot = await this.#adapter.readSnapshot(panel);

    // Side-panel extensions follow whichever tab is focused in Chrome and only
    // render permission prompts for that tab. Restore focus if it drifted.
    if (
      this.#expectedTargetUrl &&
      !matchesAttachedDomain(snapshot.attachedDomain, this.#expectedTargetUrl) &&
      !snapshot.consentVisible &&
      !snapshot.settingsVisible &&
      this.#webAppPage &&
      !this.#webAppPage.isClosed()
    ) {
      await this.#webAppPage.bringToFront();
      await delay(200, signal);
      snapshot = await this.#adapter.readSnapshot(panel);
    }
    return deriveAgentStatus(snapshot);
  }

  /** Asks the extension to stop. Returns `false` if no stop control could be used in time. */
  async #stopGeneration(): Promise<boolean> {
    const deadline = Date.now() + STOP_RETRY_TIMEOUT_MS;
    while (this.#panelPage && !this.#panelPage.isClosed()) {
      if (await this.#adapter.stopGeneration(this.#panelPage).catch(() => false)) return true;
      if (Date.now() >= deadline) break;
      await delay(100);
    }
    return false;
  }

  async runTurn(prompt: string, options: RunTurnOptions = {}): Promise<RunTurnResult> {
    try {
      await this.#sendPrompt(prompt, options.signal);
    } catch (error) {
      // The prompt may already be running even though sending did not finish.
      if (options.signal?.aborted) await this.#stopGeneration();
      throw error;
    }
    return waitForTurnToFinish(
      {
        readStatus: (signal) => this.#getStatus(signal),
        answerConfirmation: (card, decision, signal) =>
          this.#handleConfirmation(card.id, decision, signal),
        stop: () => this.#stopGeneration(),
      },
      options,
    );
  }

  async dispose(): Promise<void> {
    await this.closeCurrentWebApp();
    if (this.#ownedBrowser) {
      await this.#browser.close().catch(() => undefined);
    } else {
      if (this.#createdAnchorPage && !this.#anchorPage.isClosed()) {
        const pages = await this.#browser.pages().catch(() => []);
        if (pages.length > 1) {
          await this.#anchorPage.close().catch(() => undefined);
        }
      }
      await this.#browser.disconnect().catch(() => undefined);
    }
  }

  // -------------------------------------------------------------------------
  // Internal Panel Attachment (3-Tier Strategy)
  // -------------------------------------------------------------------------

  async #attachPanel(webAppPage: Page, targetUrl: URL, readyTimeoutMs: number): Promise<void> {
    // A window-wide side panel (like webmcp-extension's) stays open between cases.
    let attached =
      this.#activeMode === "side-panel" && this.#panelPage !== null && !this.#panelPage.isClosed();

    if (!attached && this.#sidePanelFailedReason === null) {
      try {
        const target = await this.#openOrFindRealSidePanel(webAppPage);
        const panelPage = await target.asPage();
        if (!panelPage) {
          throw new Error("Side panel target could not be attached as a Page.");
        }
        this.#panelPage = panelPage;
        this.#activeMode = "side-panel";
        attached = true;
      } catch (error) {
        this.#sidePanelFailedReason = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Could not open the extension side panel (${this.#sidePanelFailedReason}). The panel page will run in a background tab for the rest of this run.`,
        );
      }
    }

    if (!attached) {
      // Tier 3 Fallback: open panel page in a background tab so `webAppPage` stays active in front.
      const tab = await this.#browser.newPage({ background: true });
      this.#panelPage = tab;
      this.#activeMode = "tab";
      await tab.setViewport(PANEL_TAB_VIEWPORT);
      await tab.goto(this.#panelUrl, {
        waitUntil: "domcontentloaded",
        timeout: EXTENSION_PAGE_TIMEOUT_MS,
      });
    }

    await webAppPage.bringToFront();
    await this.#waitUntilPanelReady(targetUrl, readyTimeoutMs);
  }

  #isSidePanelTarget(target: Target, exclude?: Target): boolean {
    return (
      target !== exclude &&
      (target.type() === "page" || target.type() === "other") &&
      target.url().split(/[?#]/)[0] === this.#panelUrl
    );
  }

  /**
   * Returns the extension's real side panel, opening it if needed. There are two ways
   * to open it, because neither works everywhere:
   * - Tier 1, `Extension.triggerAction` (pipe and unpacked extensions only): Chrome's own
   *   toolbar click. It opens no extension page in a tab, but it opens the panel only if
   *   the extension's toolbar button does (for example with `openPanelOnActionClick`).
   * - Tier 2, `chrome.sidePanel.open()` from a helper tab: this also works over
   *   --browser-url. The API needs a user gesture, and a Puppeteer mouse click counts as
   *   one. The helper loads the panel page because it is the one extension page we know.
   * If both fail, `#attachPanel` loads the panel page in a background tab instead (Tier 3).
   */
  async #openOrFindRealSidePanel(webAppPage: Page): Promise<Target> {
    const existing = this.#browser.targets().find((t) => this.#isSidePanelTarget(t));
    if (existing) return existing;

    // Tier 1: Puppeteer's extension.triggerAction(). Puppeteer lists only unpacked
    // extensions, and only when webmcp-evals launched Chrome over a pipe.
    try {
      const ext = (await this.#browser.extensions()).get(this.extensionId);
      if (ext) {
        await ext.triggerAction(webAppPage);
        return await this.#browser.waitForTarget((t) => this.#isSidePanelTarget(t), {
          timeout: SIDE_PANEL_OPEN_TIMEOUT_MS,
        });
      }
    } catch {
      // Not available over --browser-url, or the action does not open the side panel.
    }

    // Tier 2: Trusted user click inside a temporary extension page calling chrome.sidePanel.open()
    const helper = await this.#browser.newPage();
    try {
      await helper.goto(this.#panelUrl, {
        waitUntil: "domcontentloaded",
        timeout: EXTENSION_PAGE_TIMEOUT_MS,
      });
      await helper.bringToFront();
      const setupProblem = await helper.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            chrome?: {
              windows?: { getCurrent(): Promise<{ id?: number }> };
              sidePanel?: { open(opts: { windowId: number }): Promise<void> };
            };
          }
        ).chrome;
        if (!api?.sidePanel || !api.windows) return "chrome.sidePanel API unavailable";
        const win = await api.windows.getCurrent();
        if (win.id === undefined) return "no current window id";
        const windowId = win.id;
        const sidePanel = api.sidePanel;
        const w = window as unknown as { __sidePanelOpen?: Promise<void> };
        // A full-page button, so the trusted click below lands on it wherever it hits.
        const btn = document.createElement("button");
        btn.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;";
        btn.addEventListener("click", () => {
          w.__sidePanelOpen = sidePanel.open({ windowId });
        });
        document.body.replaceChildren(btn);
        return null;
      });
      if (setupProblem) throw new Error(setupProblem);

      await helper.mouse.click(40, 40);
      await helper.evaluate(
        () => (window as unknown as { __sidePanelOpen?: Promise<void> }).__sidePanelOpen,
      );

      return await this.#browser.waitForTarget((t) => this.#isSidePanelTarget(t, helper.target()), {
        timeout: SIDE_PANEL_OPEN_TIMEOUT_MS,
      });
    } finally {
      await helper.close().catch(() => undefined);
      await webAppPage.bringToFront().catch(() => undefined);
    }
  }

  async #waitUntilPanelReady(targetUrl: URL, timeoutMs: number): Promise<void> {
    const panel = this.#requirePanel();
    let chatCleared = false;
    let consentAttempted = false;
    let lastReason = "waiting for snapshot";
    const waitStartedAt = Date.now();

    await pollUntil(
      async () => {
        const readiness = checkPanelReadiness(await this.#adapter.readSnapshot(panel), {
          targetUrl,
          pageToolCount: this.#webAppPage?.webmcp.tools().length,
          waitedMs: Date.now() - waitStartedAt,
          chatCleared,
          canAcceptConsent: this.#autoAcceptConsent && !consentAttempted,
        });
        if (readiness.status === "ready") return true;
        if (readiness.status === "fail") throw new Error(readiness.reason);

        lastReason = readiness.reason;
        if (readiness.action === "accept-consent") {
          consentAttempted = true;
          await this.#adapter.completeOnboarding(panel);
        } else if (readiness.action === "focus-web-app") {
          if (this.#webAppPage && !this.#webAppPage.isClosed()) {
            await this.#webAppPage.bringToFront().catch(() => undefined);
          }
        } else if (readiness.action === "start-new-chat") {
          // If the extension could not clear its chat, ask again on the next poll.
          chatCleared = await this.#adapter.startNewChat(panel);
        }
        return undefined;
      },
      {
        timeoutMs,
        intervalMs: 150,
        label: () => `extension panel ready for ${targetUrl.hostname} (${lastReason})`,
      },
    );
  }

  async #handleConfirmation(
    cardId: string,
    decision: ConfirmationDecision,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const panel = this.#requirePanel();
    const tryClick = (): Promise<boolean> => {
      signal?.throwIfAborted();
      return this.#adapter.resolveConfirmation(panel, cardId, decision);
    };
    if (!(await tryClick())) return false;

    const waitForDismissal = async (): Promise<boolean> => {
      try {
        return await pollUntil(
          async () => {
            const next = await this.#adapter.readSnapshot(panel);
            return next.confirmations.every((c) => c.id !== cardId) ? true : undefined;
          },
          {
            timeoutMs: CONFIRMATION_DISMISS_TIMEOUT_MS,
            intervalMs: 100,
            signal,
            label: "confirmation card dismissal",
          },
        );
      } catch (err) {
        if (signal?.aborted) throw signal.reason ?? err;
        return false;
      }
    };

    if (await waitForDismissal()) {
      return true;
    }

    // Retry once if the UI ignored the first click during re-render, then verify dismissal.
    if (!(await tryClick())) {
      const checkSnap = await this.#adapter.readSnapshot(panel);
      return checkSnap.confirmations.every((c) => c.id !== cardId);
    }
    return waitForDismissal();
  }

  #requirePanel(): Page {
    if (!this.#panelPage || this.#panelPage.isClosed()) {
      throw new Error("Extension panel is not attached. Call openWebApp(url) first.");
    }
    return this.#panelPage;
  }
}

// ---------------------------------------------------------------------------
// Browser Connection, Dialogs & Origin Clearing
// ---------------------------------------------------------------------------

function connectToRunningChrome(browserUrl: string): Promise<Browser> {
  const endpoint = browserUrl.trim();
  return endpoint.startsWith("ws://") || endpoint.startsWith("wss://")
    ? puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null })
    : puppeteer.connect({ browserURL: endpoint, defaultViewport: null });
}

async function launchExtensionChrome(options: ExtensionLaunchOptions): Promise<Browser> {
  const headless = options.headless ?? resolveDefaultHeadless();
  const args = ["--enable-features=WebMCP", "--window-size=1440,900"];
  if (!headless) args.push("--window-position=0,0");
  if (process.platform === "linux") {
    // Chrome's sandbox cannot start as root or in many headless CI containers. Keep it
    // for headed desktop runs, where the profile may hold real logins.
    if (headless || process.getuid?.() === 0) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }
  }

  return puppeteer.launch({
    browser: "chrome",
    channel: options.chromeChannel || DEFAULT_CHROME_CHANNEL,
    headless,
    pipe: true,
    enableExtensions: true,
    defaultViewport: null,
    ...(options.userDataDir ? { userDataDir: expandUserPath(options.userDataDir) } : {}),
    args,
  });
}

export function attachAutoDismissDialogHandler(page: {
  on(
    event: "dialog",
    listener: (dialog: {
      type(): string;
      accept(): Promise<void>;
      dismiss(): Promise<void>;
    }) => void,
  ): unknown;
}): void {
  page.on("dialog", (dialog) => {
    const action = dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss();
    void action.catch(() => undefined);
  });
}

/**
 * Clears storage (`localStorage`, `IndexedDB`, cookies, cache) for the target web
 * app's `origin` only. This is the one direct CDP call in extension mode: MV3
 * extensions are disabled in incognito `BrowserContext`s, and clearing browser-wide
 * data would also wipe `chrome.storage.local` inside `chrome-extension://<id>`.
 * Only used when webmcp-evals launched Chrome itself.
 */
async function clearWebOriginData(page: Page, origin: string): Promise<void> {
  let client: Awaited<ReturnType<Page["createCDPSession"]>> | undefined;
  try {
    client = await page.createCDPSession();
    await client.send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "all",
    });
  } catch (error) {
    // Not fatal, but cases may now share site state, so say so.
    logger.warn(
      `Could not clear site data for ${origin}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await client?.detach().catch(() => undefined);
  }
}
