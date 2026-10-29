/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Browser } from "puppeteer-core";
import {
  discoverExtensionsInBrowser,
  expandUserPath,
  extractExtensionIdsFromTargetUrls,
  isExtensionId,
  matchInstalledExtension,
  type DiscoveredExtensionInfo,
} from "../extension/discovery.js";

const EXT_A: DiscoveredExtensionInfo = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "WebMCP Agent",
  panelPath: "sidepanel/index.html",
  enabled: true,
};

const EXT_B: DiscoveredExtensionInfo = {
  id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  name: "Acme Shopping Assistant",
  panelPath: "panel.html",
  enabled: true,
};

const EXT_DISABLED: DiscoveredExtensionInfo = {
  id: "cccccccccccccccccccccccccccccccc",
  name: "Disabled Agent",
  panelPath: "sidepanel/index.html",
  enabled: false,
};

describe("extension discovery", () => {
  it("recognizes valid 32-character Chrome extension IDs (a-p)", () => {
    assert.strictEqual(isExtensionId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.strictEqual(isExtensionId("ABCDEFGHIJKLMNOPabcdefghijklmnop"), true);
    assert.strictEqual(isExtensionId("WebMCP Agent"), false);
    assert.strictEqual(isExtensionId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"), false);
    assert.strictEqual(isExtensionId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  });

  it("extracts deduplicated extension IDs from browser target URLs", () => {
    const urls = [
      "https://localhost:5173/",
      "chrome-extension://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/background.js",
      "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/sidepanel/index.html",
      "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/sw.js",
      "chrome-extension://not-a-valid-id/index.html",
    ];

    assert.deepStrictEqual(extractExtensionIdsFromTargetUrls(urls), [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });

  it("matches installed extensions by exact ID, exact name, or unambiguous substring", () => {
    const candidates = [EXT_A, EXT_B, EXT_DISABLED];

    assert.strictEqual(
      matchInstalledExtension("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", candidates),
      EXT_A,
    );
    assert.strictEqual(matchInstalledExtension("webmcp agent", candidates), EXT_A);
    assert.strictEqual(matchInstalledExtension("Shopping", candidates), EXT_B);

    assert.throws(
      () => matchInstalledExtension("cccccccccccccccccccccccccccccccc", candidates),
      /not found or is disabled/,
    );
    assert.throws(
      () => matchInstalledExtension("Agent", [EXT_A, { ...EXT_B, name: "Second Agent" }]),
      /matched multiple installed extensions/,
    );
    assert.throws(
      () => matchInstalledExtension("WebMCP Agent", [EXT_A, { ...EXT_B, name: "WebMCP Agent" }]),
      /Multiple installed extensions share the name "WebMCP Agent"/,
    );
    assert.throws(
      () => matchInstalledExtension("Nonexistent", candidates),
      /No installed extension matching "Nonexistent"/,
    );
  });

  it("discovers sleeping MV3 extensions via chrome://extensions even when other extensions are awake over --browser-url", async () => {
    const visitedUrls: string[] = [];
    let unrelatedManifestReads = 0;
    const fakeBrowser = {
      extensions: async () => {
        throw new Error("Extensions.getExtensions restricted over HTTP remote debugging");
      },
      targets: () => [
        // Unrelated awake extension (e.g. React DevTools)
        {
          type: () => "service_worker",
          url: () => "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/sw.js",
          worker: async () => ({
            evaluate: async () => {
              unrelatedManifestReads++;
              return {
                name: "React DevTools",
                background: { service_worker: "sw.js" },
              };
            },
          }),
        },
      ],
      newPage: async () => {
        let currentUrl = "";
        return {
          goto: async (url: string) => {
            currentUrl = url;
            visitedUrls.push(url);
            return { ok: () => true };
          },
          evaluate: async () => {
            if (currentUrl === "chrome://extensions") {
              return [
                {
                  id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  name: "React DevTools",
                  state: "ENABLED",
                },
                {
                  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  name: "WebMCP Agent",
                  state: "ENABLED",
                },
                {
                  id: "cccccccccccccccccccccccccccccccc",
                  name: "Disabled Helper",
                  state: "DISABLED",
                },
              ];
            }
            if (
              currentUrl === "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest.json"
            ) {
              return JSON.stringify({
                name: "WebMCP Agent",
                side_panel: { default_path: "sidepanel/index.html" },
                background: { service_worker: "background.js" },
              });
            }
            return "{}";
          },
          close: async () => {},
        };
      },
    } as unknown as Browser;

    const discovered = await discoverExtensionsInBrowser(fakeBrowser, "WebMCP Agent");
    assert.ok(visitedUrls.includes("chrome://extensions"));
    const match = matchInstalledExtension("WebMCP Agent", discovered);
    assert.strictEqual(match.id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.strictEqual(match.panelPath, "sidepanel/index.html");
    // Disabled extensions skip opening manifest.json tabs
    assert.ok(
      !visitedUrls.includes("chrome-extension://cccccccccccccccccccccccccccccccc/manifest.json"),
    );
    // A named extension that cannot match the query is never probed.
    assert.strictEqual(unrelatedManifestReads, 0);
  });

  it("preserves active extensions in the diagnostic hint when a 32-char ID is not found over --browser-url", async () => {
    const fakeBrowser = {
      extensions: async () => {
        throw new Error("Extensions.getExtensions restricted over HTTP remote debugging");
      },
      targets: () => [
        {
          type: () => "service_worker",
          url: () => "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/sw.js",
        },
      ],
      newPage: async () => ({
        goto: async () => ({ ok: () => false }),
        evaluate: async () => "",
        close: async () => {},
      }),
    } as unknown as Browser;

    const missingId = "dddddddddddddddddddddddddddddddd";
    const discovered = await discoverExtensionsInBrowser(fakeBrowser, missingId);
    assert.strictEqual(discovered.length, 1);
    assert.strictEqual(discovered[0]?.id, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.throws(
      () => matchInstalledExtension(missingId, discovered),
      /Detected extensions: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/,
    );
  });

  it("finds a Chrome Web Store extension that the pipe list of unpacked extensions leaves out", async () => {
    const storeId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fakeBrowser = {
      // Over a pipe, Puppeteer lists only unpacked extensions.
      extensions: async () => new Map(),
      targets: () => [
        {
          type: () => "service_worker",
          url: () => `chrome-extension://${storeId}/sw.js`,
          worker: async () => ({
            evaluate: async () => ({
              name: "WebMCP Extension",
              side_panel: { default_path: "panel.html" },
            }),
          }),
        },
      ],
      newPage: async () => {
        throw new Error("chrome://extensions is not available in this fake browser");
      },
    } as unknown as Browser;

    for (const query of [storeId, "WebMCP Extension"]) {
      const discovered = await discoverExtensionsInBrowser(fakeBrowser, query);
      assert.deepStrictEqual(discovered, [
        { id: storeId, name: "WebMCP Extension", panelPath: "panel.html", enabled: true },
      ]);
    }
  });
});

describe("expandUserPath", () => {
  it("expands leading ~ and ~/ paths to the user home directory", () => {
    assert.strictEqual(expandUserPath("~"), homedir());
    assert.strictEqual(
      expandUserPath("~/.chrome-webmcp-evals"),
      join(homedir(), ".chrome-webmcp-evals"),
    );
  });
});
