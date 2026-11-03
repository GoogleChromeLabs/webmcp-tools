---
name: evaluate-webmcp-tools-with-extension
description: >-
  Configures Chrome and runs webmcp-evals browser and simulate suites to
  evaluate a website's WebMCP tools against a Chrome extension agent (such as
  GoogleChromeLabs/webmcp-extension or a custom side-panel agent) instead of
  the built-in agent. Use when a developer wants to test their website's WebMCP
  tools (or test an extension agent) with --extension, set up a persistent
  Chrome profile (--user-data-dir), attach to a running Chrome (--browser-url),
  install an unpacked extension folder in CI, handle tool permission prompts
  (--confirm-policy) or turn timeouts (--turn-timeout), debug a failing
  extension run, or implement the window.__AGENT_AUTOMATION__ bridge in a
  custom Chrome extension. Not for runs with the built-in agent, writing
  evals.json cases, or adding WebMCP tools to a site.
---

<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Evaluating WebMCP Tools Against a Chrome Extension Agent (`evaluate-webmcp-tools-with-extension`)

`webmcp-evals` evaluates a website's WebMCP tools (`document.modelContext` and declarative `<form toolname>`). By default, a built-in agent calls those tools. With `--extension`, `webmcp-evals` evaluates the same tools **against a Chrome extension agent**, such as [`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) or a custom side-panel agent. This works in both **`browser`** (`evals.json` trajectory checks) and **`simulate`** (`simulations.json` goals). Extension authors can also use this workflow to test their agent on WebMCP pages.

This skill needs a `webmcp-evals` version with `--extension` (check `npx webmcp-evals browser --help`). The full behavior is described in the [WebMCP Extension Automation Contract](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/webmcp-evals/docs/extension-contract.md).

## How to Use This Skill

1. Match the developer's request to a row in the **Router** and follow that section.
2. Apply the **Non-Negotiables** to every command and answer you give.
3. Before you give a run command, check it against **Before You Run**.

---

## Non-Negotiables

- **The extension is ready before the run**: it is installed, set up (model, API key, or endpoint), and past its first-run consent screen in the Chrome profile used for the run. `webmcp-evals` never configures an extension. It accepts a consent screen only for an unpacked `GoogleChromeLabs/webmcp-extension` that it installed itself.
- **Dedicated profile**: Chrome 136+ blocks remote debugging on the default profile, so always use a separate `--user-data-dir` (for example `~/.chrome-webmcp-evals`).
- **Choose an option by need**: Option A starts each case with clean site data for the target origin. Option B keeps the developer's Chrome open and keeps logins, but state can carry over between cases. Option C is for CI with an unpacked extension.
- **No agent API key with `--extension`**: the extension runs its own model. In `simulate`, a key is needed only for cases with `userScenario` or `successCriteria`.
- **Custom extensions use the bridge**: they expose `window.__AGENT_AUTOMATION__` on their side-panel page. Do not suggest CSS selectors or `data-*` attributes for custom extensions.

## Before You Run

- [ ] Options A and B: the extension is installed and set up in the profile, and its consent screen was accepted. Option C: the unpacked build needs no manual setup.
- [ ] Option A: that Chrome is closed, so `webmcp-evals` can launch it with the same `--user-data-dir`. Option B: Chrome was started with `--remote-debugging-port=9222`.
- [ ] Chrome runs with `--enable-features=WebMCP` (`webmcp-evals` adds it when it launches Chrome).
- [ ] The target page uses `https://` or `http://localhost`.
- [ ] The Chrome version is new enough for the extension: `GoogleChromeLabs/webmcp-extension` needs Chrome 155 or later, and `webmcp-evals` launches Chrome Canary by default (`--chrome-channel`).

---

## Router

| Developer Goal                                                                       | Action                                                                     | Read First                                                                                                            |
| :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| Set up Chrome once and evaluate a site's WebMCP tools against an installed extension | Follow **Section 1: Setting Up Chrome** below                              | This file                                                                                                             |
| Make a custom Chrome extension work with `webmcp-evals`                              | Implement `window.__AGENT_AUTOMATION__` on the extension's side-panel page | [`references/extension-contract.md`](./references/extension-contract.md#custom-extensions-window__agent_automation__) |
| Debug "extension not found", `0 tools`, consent errors, or turn timeouts             | Follow **Section 5: Troubleshooting** below                                | This file                                                                                                             |

---

## 1. Setting Up Chrome

Choose **Option A** for repeatable runs where `webmcp-evals` launches and closes Chrome, **Option B** to watch an open Chrome window while evals run, or **Option C** for CI with an unpacked extension.

### Option A: Persistent Chrome Profile (`--user-data-dir`) — Recommended

1. **One-time profile setup**: launch Chrome Canary with a dedicated profile directory and `--enable-features=WebMCP`:

   ```bash
   # macOS
   "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
     --user-data-dir="$HOME/.chrome-webmcp-evals" \
     --enable-features=WebMCP

   # Linux
   google-chrome-canary \
     --user-data-dir="$HOME/.chrome-webmcp-evals" \
     --enable-features=WebMCP
   ```

2. **Install and set up the extension**:
   - Open `chrome://extensions`, turn on **Developer mode**, and load the extension (or install it from the Chrome Web Store).
   - Open its side panel, **accept the first-run consent screen**, and set the model, API key, or endpoint.
   - Note the extension's `name` (for example `"WebMCP Extension"`) or its 32-character ID from `chrome://extensions`.
   - **Quit that Chrome** so the profile is free when `webmcp-evals` launches it.

3. **Run `browser` or `simulate`**:

   ```bash
   # Trajectory evaluation (evals.json)
   npx webmcp-evals browser \
     -u http://localhost:5173 \
     -e evals.json \
     --extension "WebMCP Extension" \
     --user-data-dir "$HOME/.chrome-webmcp-evals"

   # Goal-oriented simulation (simulations.json)
   npx webmcp-evals simulate \
     -u http://localhost:5173 \
     -s simulations.json \
     --extension "WebMCP Extension" \
     --user-data-dir "$HOME/.chrome-webmcp-evals" \
     --judge-model google:gemini-3.5-flash
   ```

### Option B: Attach to a Running Chrome (`--browser-url`)

1. **Start Chrome with a remote debugging port and a dedicated profile**:

   ```bash
   google-chrome-canary \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/.chrome-webmcp-evals" \
     --enable-features=WebMCP
   ```

2. **Check that the extension is turned on, set up, and past its consent screen** in that window.
3. **Attach `webmcp-evals`**. It leaves Chrome open and does not clear site data, so logins survive, but state (cart, form data, storage) can carry over from one case to the next:

   ```bash
   npx webmcp-evals simulate \
     -u http://localhost:5173 \
     -s simulations.json \
     --extension "WebMCP Extension" \
     --browser-url http://127.0.0.1:9222
   ```

### Option C: Unpacked Extension Directory (`--extension ./dir`)

For CI, when the extension needs no manual setup, pass the unpacked build folder (with `manifest.json`) to `--extension`. `webmcp-evals` launches Chrome with a temporary profile and installs the extension. Only `GoogleChromeLabs/webmcp-extension` gets its consent screen accepted automatically; for other extensions, use Option A.

```bash
npx webmcp-evals browser \
  -u http://localhost:5173 \
  -e evals.json \
  --extension ./dist \
  --headless
```

`browser` and `simulate` exit with code 1 when any case fails or errors, so a CI job fails too.

---

## 2. CLI Options (`browser` and `simulate`)

| Option                             | Default           | Description                                                                                                                             |
| :--------------------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `--extension <id-or-name-or-path>` | —                 | 32-character extension ID, `manifest.json` name, or unpacked extension directory                                                        |
| `--user-data-dir <path>`           | Temporary profile | Chrome profile where the extension is installed (not with `--browser-url`)                                                              |
| `--browser-url <url>`              | —                 | Remote debugging URL (`http://127.0.0.1:9222`) or `ws://` endpoint of a running Chrome                                                  |
| `--chrome-channel <channel>`       | `chrome-canary`   | Chrome to launch: `chrome`, `chrome-beta`, `chrome-dev`, or `chrome-canary` (ignored with `--browser-url`)                              |
| `--headless`                       | Auto              | Launch Chrome headless (by default, only on Linux without a display); not with `--browser-url`                                          |
| `--extension-panel-path <path>`    | From manifest     | Side-panel HTML path inside `chrome-extension://<id>/` (default: the manifest's `side_panel.default_path`, then `sidepanel/index.html`) |
| `--confirm-policy <policy>`        | `allow-once`      | Tool permission prompts: `allow-once`, `always-allow`, `deny`, or `none` (leave them for a human to answer, up to the turn timeout)     |
| `--turn-timeout <milliseconds>`    | `120000`          | `browser` only: maximum time for one extension turn                                                                                     |
| `--timeout <milliseconds>`         | `30000`           | Page navigation, panel readiness, and setup tool calls (plus the judge request in `simulate`); does not limit turn length               |
| `--max-duration <milliseconds>`    | `300000`          | `simulate` only: conversation budget for a case without `maxDurationMs`, including extension turns                                      |

---

## 3. Supported Extensions

- **[`GoogleChromeLabs/webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension)**: works without changes, because `webmcp-evals` has built-in support for its side panel. Its prompt box is one line, so newlines in prompts are replaced with spaces. Its "Keep going?" card (shown after many tool calls) is answered like a permission prompt.
- **Custom extensions**: expose `window.__AGENT_AUTOMATION__` on the side-panel page. Read [`references/extension-contract.md`](./references/extension-contract.md) for the TypeScript interface, the behavior rules, the [turn completion rules](./references/extension-contract.md#turn-completion), and an example bridge.

---

## 4. Reading Results

- Reports show the resolved extension name and ID. In `browser`, an errored case also shows its reason.
- In `browser`, earlier `functioncall` steps of a case run on the live page before the prompt is sent (listed under "World state before the conversation"). Earlier messages are sent as context in the prompt.
- If the extension shows an error after it made tool calls, those calls are still scored, and the error text is added to the response.
- If the extension shows an error and made no tool calls, the case is reported as an error.

---

## 5. Troubleshooting

- **`SingletonLock` or "profile in use" with `--user-data-dir`**: Chrome is still running with that profile. Close it, or start it with `--remote-debugging-port=9222` and use `--browser-url http://127.0.0.1:9222`.
- **`No installed extension matching "..." was found`**: check that the extension is turned on in that Chrome profile. If it is still not found, pass its 32-character ID instead of its name.
- **Every case fails because the extension's consent screen is showing**: open the extension's side panel in that profile, accept the consent screen, close Chrome (Option A), and run again.
- **Chrome does not launch because Chrome Canary is not installed**: install Chrome Canary, or pass `--chrome-channel chrome` (or `chrome-beta`, `chrome-dev`) if that Chrome is new enough for the extension.
- **`WebMCP tools are not available on ... (0 tools registered on page)`**: make sure Chrome runs with `--enable-features=WebMCP` and the page uses `https://` or `http://localhost`.
- **A turn times out on a tool permission prompt**: `--confirm-policy none` leaves prompts for a human. Use the default `allow-once` (or `always-allow` / `deny`). For a custom extension, check that the prompt is listed in `window.__AGENT_AUTOMATION__.getSnapshot().confirmations`.
- **`... window.__AGENT_AUTOMATION__ has no resolveConfirmation(id, decision)`**: the custom extension lists a permission prompt, but its bridge cannot answer it. Implement `resolveConfirmation`, or run with `--confirm-policy none`.
- **Long turns time out**: raise `--turn-timeout` (`browser`) or `maxDurationMs` / `--max-duration` (`simulate`). `--timeout` does not limit turn length.
- **State from one case shows up in the next**: with `--browser-url`, site data is not cleared between cases. Use Option A to start each case with clean site data.
