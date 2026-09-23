# Shared WebMCP assets

Files used by more than one demo. Reference them relatively, e.g.
`<script src="../shared/webmcp-polyfill.js"></script>`.

| File                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `webmcp-polyfill.js`            | Vendored build of the upstream WebMCP polyfill              |
| `webmcp-declarative.js`         | Polyfill for the experimental declarative form API          |
| `webmcp-batch.js`               | `execute_batch` helper: runs several tool calls in one turn |
| `types/webmcp-declarative.d.ts` | Ambient TypeScript types for the declarative attributes     |

## `webmcp-polyfill.js`

A vendored build of [webmachinelearning/webmcp-polyfill](https://github.com/webmachinelearning/webmcp-polyfill),
which implements the imperative API. Do not edit it by hand: the header records
the upstream commit it came from.

### Refreshing it

This is manual for now because upstream does not publish to npm yet, and its
`dist/` is gitignored, so the bundle has to be built from a clone.

Once upstream publishes, replace all of this with a dependency and a copy step.

Run this from the repository root:

```sh
UPSTREAM=$(mktemp -d)
git clone --depth 1 --branch main https://github.com/webmachinelearning/webmcp-polyfill "$UPSTREAM"

(cd "$UPSTREAM" && pnpm install --frozen-lockfile && pnpm build)

{
  printf '/**\n * WebMCP polyfill - vendored build, do not edit by hand.\n *\n'
  printf ' * Source:  https://github.com/webmachinelearning/webmcp-polyfill\n'
  printf ' * Version: %s\n' "$(node -p "require('$UPSTREAM/package.json').version")"
  printf ' * Branch:  %s\n' "$(git -C "$UPSTREAM" rev-parse --abbrev-ref HEAD)"
  printf ' * Commit:  %s\n' "$(git -C "$UPSTREAM" rev-parse HEAD)"
  printf ' * Synced:  %s\n *\n' "$(date -u +%Y-%m-%d)"
  printf ' * Implements the imperative WebMCP API only. The declarative form[toolname]\n'
  printf ' * tools and the :tool-form-active / :tool-submit-active pseudo-classes are\n'
  printf ' * polyfilled by webmcp-declarative.js, which must load after this file.\n *\n'
  printf ' * SPDX-License-Identifier: MIT\n */\n'
  cat "$UPSTREAM/dist/polyfill.js"
} > demos/shared/webmcp-polyfill.js

rm -rf "$UPSTREAM"
```

To build from a checkout you already have, set `UPSTREAM` to its path and skip
the `git clone` and `rm -rf` lines.

## `webmcp-declarative.js`

Upstream implements only what is specified, so the declarative features Chrome
prototypes live here instead:

| Feature                                     | Description                                          |
| ------------------------------------------- | ---------------------------------------------------- |
| `<form toolname tooldescription>`           | Registers the form as a tool                         |
| `toolparamdescription`                      | Per-field description in the generated `inputSchema` |
| `toolautosubmit`                            | Submits without waiting for the user                 |
| `event.agentInvoked`                        | Set on the `submit` event during a tool call         |
| `event.respondWith(value)`                  | Resolves the tool call with a result                 |
| `toolactivated` / `toolcancel`              | Fired on `window`                                    |
| `:tool-form-active` / `:tool-submit-active` | Rewritten to equivalent classes                      |

Load it after the polyfill, and only in demos that use declarative forms:

```html
<script src="../shared/webmcp-polyfill.js"></script>
<script src="../shared/webmcp-declarative.js"></script>
```

Form controls with a `name` become schema properties: `<select>` turns into a
`string` with an `enum` of its option values, `number` and `range` into
`number`, `checkbox` into `boolean`, and `required` controls are listed in
`required`. Hidden inputs are skipped.
