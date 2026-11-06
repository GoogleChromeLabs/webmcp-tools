# Shared WebMCP assets

Files used by more than one demo. Reference them relatively, e.g.
`<script src="../shared/webmcp-polyfill.js"></script>`.

| File                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `webmcp-polyfill.js`            | Copy of the `@w3c/webmcp-polyfill` npm package build        |
| `webmcp-declarative.js`         | Polyfill for the experimental declarative form API          |
| `webmcp-batch.js`               | `execute_batch` helper: runs several tool calls in one turn |
| `types/webmcp-declarative.d.ts` | Ambient TypeScript types for the declarative attributes     |

## `webmcp-polyfill.js`

A copy of `dist/polyfill.js` (the self-installing IIFE build) from the
[`@w3c/webmcp-polyfill`](https://www.npmjs.com/package/@w3c/webmcp-polyfill)
npm package, which implements the imperative API. It is checked in so the
static demos work without a build step or a CDN. Do not edit it by hand: the
header records the package version and tarball integrity it came from.

### Refreshing it

From the repository root (the script lives there, not here, so it is not
deployed along with this folder):

```sh
./update-webmcp-polyfill.sh          # latest
./update-webmcp-polyfill.sh 0.1.0    # a specific version
```

The script runs `npm pack`, extracts `dist/polyfill.js`, and rewrites
`webmcp-polyfill.js` with a provenance header.

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
