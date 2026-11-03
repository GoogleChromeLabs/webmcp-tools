/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { delay } from "./asyncUtils.js";

export interface DiscoveredExtensionInfo {
  readonly id: string;
  readonly name: string;
  readonly panelPath: string;
  readonly enabled: boolean;
}

interface RawExtensionManifest {
  name?: string;
  background?: { service_worker?: string };
  side_panel?: { default_path?: string };
}

/** One installed extension as the discovery steps see it. The name may still be missing. */
interface ExtensionEntry {
  readonly id: string;
  readonly name?: string;
  readonly enabled: boolean;
}

const DEFAULT_PANEL_PATH = "sidepanel/index.html";
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/i;

/** How long a launched Chrome profile may take to load its installed extensions. */
const PROFILE_STARTUP_TIMEOUT_MS = 5_000;
/** Loading `chrome://extensions` or an extension's `manifest.json` in a helper tab. */
const PROBE_PAGE_TIMEOUT_MS = 5_000;

export function expandUserPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }
  return resolve(process.cwd(), trimmed);
}

export function isExtensionId(value: string): boolean {
  return EXTENSION_ID_PATTERN.test(value.trim());
}

export function looksLikeFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith(".\\") ||
    trimmed.startsWith("..\\") ||
    trimmed.startsWith("~\\") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  );
}

export function extractExtensionIdsFromTargetUrls(urls: readonly string[]): string[] {
  const ids = new Set<string>();
  const prefixPattern = /^chrome-extension:\/\/([a-p]{32})(?:\/|$)/i;
  for (const url of urls) {
    const match = prefixPattern.exec(url);
    if (match?.[1]) {
      ids.add(match[1].toLowerCase());
    }
  }
  return [...ids];
}

/** More than one installed extension matches the name. Waiting longer will not change that. */
class AmbiguousExtensionError extends Error {}

/**
 * Pure matching logic resolving a user-provided extension identifier (32-char ID
 * or manifest name) against extensions discovered in the browser.
 */
export function matchInstalledExtension(
  query: string,
  candidates: readonly DiscoveredExtensionInfo[],
): DiscoveredExtensionInfo {
  const trimmed = query.trim();
  const enabledCandidates = candidates.filter((c) => c.enabled);

  if (isExtensionId(trimmed)) {
    const wantedId = trimmed.toLowerCase();
    const match = enabledCandidates.find((c) => c.id.toLowerCase() === wantedId);
    if (match) return match;
    throw new Error(
      `Extension with ID "${wantedId}" was not found or is disabled in Chrome. ` +
        formatDiscoveredExtensionsHint(enabledCandidates),
    );
  }

  const wantedLower = trimmed.toLowerCase();
  const exactMatches = enabledCandidates.filter((c) => c.name.trim().toLowerCase() === wantedLower);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    throw new AmbiguousExtensionError(
      `Multiple installed extensions share the name "${trimmed}": ` +
        exactMatches.map((c) => `${c.name} (${c.id})`).join(", ") +
        ". Pass the specific 32-character extension ID to --extension instead.",
    );
  }

  const partialMatches = enabledCandidates.filter((c) =>
    c.name.toLowerCase().includes(wantedLower),
  );
  if (partialMatches.length === 1) return partialMatches[0];
  if (partialMatches.length > 1) {
    throw new AmbiguousExtensionError(
      `Extension query "${trimmed}" matched multiple installed extensions: ` +
        partialMatches.map((c) => `"${c.name}" (${c.id})`).join(", ") +
        ". Pass an exact name or the 32-character extension ID to --extension.",
    );
  }

  throw new Error(
    `No installed extension matching "${trimmed}" was found in Chrome. ` +
      formatDiscoveredExtensionsHint(enabledCandidates),
  );
}

function formatDiscoveredExtensionsHint(candidates: readonly DiscoveredExtensionInfo[]): string {
  if (candidates.length === 0) {
    return (
      "No active extensions were detected in this browser session. " +
      "Ensure Chrome was started with --user-data-dir pointing to a profile where the extension is installed (or attach via --browser-url), " +
      "or pass the 32-character extension ID from chrome://extensions."
    );
  }
  const list = candidates.map((c) => `"${c.name}" (${c.id})`).join(", ");
  return `Detected extensions: ${list}.`;
}

/**
 * Reads an unpacked extension directory. Returns `null` when there is no
 * `manifest.json`, and throws when `manifest.json` cannot be read or parsed.
 */
export function resolveUnpackedExtensionDir(
  spec: string,
): { dir: string; manifest: RawExtensionManifest } | null {
  const dir = expandUserPath(spec);
  const manifestPath = join(dir, "manifest.json");
  // Also false when `dir` is a file, so no separate directory check is needed.
  if (!existsSync(manifestPath)) return null;
  try {
    return {
      dir,
      manifest: JSON.parse(readFileSync(manifestPath, "utf-8")) as RawExtensionManifest,
    };
  } catch (error) {
    throw new Error(
      `Could not read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function resolvePanelPath(
  manifest: RawExtensionManifest | undefined,
  explicitPanelPath?: string,
): string {
  const panelPath = explicitPanelPath ?? manifest?.side_panel?.default_path ?? DEFAULT_PANEL_PATH;
  return panelPath.replace(/^\/+/, "");
}

/**
 * Finds the installed extension that `query` names. A Chrome that webmcp-evals has just
 * launched may still be loading its profile's extensions, so then it keeps trying for a while.
 */
export async function resolveInstalledExtensionInBrowser(
  browser: Browser,
  query: string,
  explicitPanelPath: string | undefined,
  waitForProfileStartup: boolean,
): Promise<DiscoveredExtensionInfo> {
  const deadline = waitForProfileStartup ? Date.now() + PROFILE_STARTUP_TIMEOUT_MS : 0;

  while (true) {
    const candidates = await discoverExtensionsInBrowser(browser, query, explicitPanelPath);
    try {
      return matchInstalledExtension(query, candidates);
    } catch (err) {
      if (Date.now() >= deadline || err instanceof AmbiguousExtensionError) {
        throw err;
      }
      await delay(250);
    }
  }
}

/** Lists the installed extensions that `query` might name, with their panel paths. */
export async function discoverExtensionsInBrowser(
  browser: Browser,
  query: string,
  explicitPanelPath?: string,
): Promise<DiscoveredExtensionInfo[]> {
  // No single source lists every installed extension, so combine them.
  const byId = await listUnpackedExtensions(browser);
  addAwakeExtensions(browser, byId);
  if (!isExtensionId(query)) {
    await addExtensionsFromExtensionsPage(browser, byId);
  }
  const probedId = addProbedExtensionId(query, byId);
  return describeCandidates(browser, byId.values(), query, probedId, explicitPanelPath);
}

/**
 * Step 1: Puppeteer's list of unpacked extensions (CDP `Extensions.getExtensions` leaves
 * out Chrome Web Store extensions). It needs the pipe that webmcp-evals uses when it
 * launches Chrome, so it is empty over --browser-url.
 */
async function listUnpackedExtensions(browser: Browser): Promise<Map<string, ExtensionEntry>> {
  const byId = new Map<string, ExtensionEntry>();
  try {
    for (const [id, ext] of await browser.extensions()) {
      byId.set(id.toLowerCase(), { id: id.toLowerCase(), name: ext.name, enabled: ext.enabled });
    }
  } catch {
    // browser.extensions() throws when attached with --browser-url.
  }
  return byId;
}

/** Step 2: awake extensions, found from their `chrome-extension://` targets. */
function addAwakeExtensions(browser: Browser, byId: Map<string, ExtensionEntry>): void {
  const targetUrls = browser.targets().map((t) => t.url());
  for (const id of extractExtensionIdsFromTargetUrls(targetUrls)) {
    if (!byId.has(id)) {
      byId.set(id, { id, enabled: true });
    }
  }
}

/**
 * Step 3: the list behind `chrome://extensions`, read in a background tab. It has every
 * installed extension, including Chrome Web Store extensions (which step 1 leaves out)
 * and sleeping MV3 extensions (which have no targets), so they can be found by name.
 * `chrome.developerPrivate` is the private API behind chrome://extensions, not a public
 * contract. This is best effort: if it changes, name lookup only sees unpacked and awake
 * extensions, and the error message suggests passing the 32-character ID.
 */
async function addExtensionsFromExtensionsPage(
  browser: Browser,
  byId: Map<string, ExtensionEntry>,
): Promise<void> {
  let extMgmtPage: Page | undefined;
  try {
    extMgmtPage = await browser.newPage({ background: true });
    await extMgmtPage.goto("chrome://extensions", {
      waitUntil: "domcontentloaded",
      timeout: PROBE_PAGE_TIMEOUT_MS,
    });
    const devInfos = await extMgmtPage.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome?: {
            developerPrivate?: {
              getExtensionsInfo(): Promise<Array<{ id: string; name: string; state: string }>>;
            };
          };
        }
      ).chrome?.developerPrivate;
      if (!api?.getExtensionsInfo) return [];
      return api.getExtensionsInfo();
    });
    for (const info of devInfos) {
      const id = info.id.toLowerCase();
      const existing = byId.get(id);
      byId.set(id, {
        id,
        name: info.name || existing?.name,
        enabled: info.state === "ENABLED",
      });
    }
  } catch {
    // Non-fatal if chrome://extensions is unavailable in custom Chromium embeds.
  } finally {
    await extMgmtPage?.close().catch(() => undefined);
  }
}

/**
 * Step 4: an explicit 32-character ID whose service worker is asleep has no target, so
 * it is added here and step 5 probes its `manifest.json`. Returns the ID if it was added.
 */
function addProbedExtensionId(query: string, byId: Map<string, ExtensionEntry>): string | null {
  if (!isExtensionId(query)) return null;
  const id = query.trim().toLowerCase();
  if (byId.has(id)) return null;
  byId.set(id, { id, enabled: true });
  return id;
}

/**
 * Step 5: reads manifests only where they matter: entries without a usable name (needed
 * to match by name) and entries the query could select (needed for the panel path).
 * Over --browser-url each read may open a tab in the user's browser.
 */
async function describeCandidates(
  browser: Browser,
  entries: Iterable<ExtensionEntry>,
  query: string,
  probedId: string | null,
  explicitPanelPath: string | undefined,
): Promise<DiscoveredExtensionInfo[]> {
  const wantedId = isExtensionId(query) ? query.trim().toLowerCase() : null;
  const wantedName = query.trim().toLowerCase();
  const results: DiscoveredExtensionInfo[] = [];
  for (const entry of entries) {
    if (!entry.enabled) {
      results.push({
        id: entry.id,
        name: entry.name || entry.id,
        panelPath: DEFAULT_PANEL_PATH,
        enabled: false,
      });
      continue;
    }
    // "__MSG_appName__" is an untranslated i18n placeholder, not a usable name.
    const knownName = entry.name && !entry.name.startsWith("__MSG_") ? entry.name : undefined;
    const mightMatch = wantedId
      ? entry.id === wantedId
      : !knownName || knownName.trim().toLowerCase().includes(wantedName);
    const manifest = mightMatch
      ? await readInstalledExtensionManifest(browser, entry.id)
      : undefined;
    if (entry.id === probedId && !manifest) {
      // A probed 32-char ID that fails to load manifest.json is not installed.
      continue;
    }
    const resolvedName = knownName ?? (manifest?.name || entry.name || entry.id);
    results.push({
      id: entry.id,
      name: resolvedName,
      panelPath: resolvePanelPath(manifest, explicitPanelPath),
      enabled: entry.enabled,
    });
  }
  return results;
}

async function readInstalledExtensionManifest(
  browser: Browser,
  extensionId: string,
): Promise<RawExtensionManifest | undefined> {
  // Fast path: ask the extension's running service worker, which needs no extra tab.
  const swTarget = browser
    .targets()
    .find(
      (t) =>
        t.type() === "service_worker" &&
        t.url().toLowerCase().startsWith(`chrome-extension://${extensionId}/`),
    );
  if (swTarget) {
    try {
      const worker = await swTarget.worker();
      if (worker) {
        return await worker.evaluate(() => {
          const runtime = (
            globalThis as unknown as {
              chrome?: { runtime?: { getManifest(): RawExtensionManifest } };
            }
          ).chrome?.runtime;
          return runtime?.getManifest();
        });
      }
    } catch {
      // Fall through to manifest.json navigation probe.
    }
  }

  // Fallback: load chrome-extension://<id>/manifest.json in a temporary background tab.
  let probePage: Page | undefined;
  try {
    probePage = await browser.newPage({ background: true });
    const response = await probePage.goto(`chrome-extension://${extensionId}/manifest.json`, {
      waitUntil: "domcontentloaded",
      timeout: PROBE_PAGE_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      return undefined;
    }
    const text = await probePage.evaluate(
      () => document.body?.innerText || document.body?.textContent || "",
    );
    return JSON.parse(text) as RawExtensionManifest;
  } catch {
    return undefined;
  } finally {
    await probePage?.close().catch(() => undefined);
  }
}
