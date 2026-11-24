# PR draft: Preserve `outputSchema` + report schema projection diagnostics

**Status:** local patch only — do **not** open/submit publicly until maintainer review.  
**Repo:** GoogleChromeLabs/webmcp-tools (`webmcp-evals`) via fork `rajudandigam/webmcp-tools`  
**Related:** Puppeteer [#15579](https://github.com/puppeteer/puppeteer/pull/15579) (open); skills guidance in #619

## Problem

1. `ToolSchema` includes `outputSchema`, but loaders/`mapRawBrowserToolsToConfig` drop it when normalizing to `Tool`.
2. `sanitizeSchema` intentionally strips nested `oneOf`/`anyOf` for Vercel AI SDK compatibility; callers had no diagnostic of what was removed (source is already cloned — not mutated).

## Approach

- Add optional `outputSchema` / `schemaProjection` on `Tool`.
- `mapToolSchemaEntriesToTools` + browser mapper preserve object/`null`.
- `sanitizeSchemaWithDiagnostics` records stripped paths; keep strip behavior for Vercel.
- Gemini local backend maps object → `FunctionDeclaration.responseJsonSchema` (tool-result schema); omit when null. Keyless request stub only — not live model proof.
- Native browser `outputSchema` round-trip remains **blocked** until Puppeteer #15579 ships. Do not cast absent fields as native support.

## Non-goals

- Removing oneOf/anyOf stripping globally.
- Claiming live model validation from stubs.
- Forcing Puppeteer upgrades.

## Test plan

```bash
cd webmcp-evals
npm ci
npx tsc
node --test dist/test/mappers.test.js dist/test/geminiBackend.test.js
```

## Suggested title

`fix(webmcp-evals): preserve outputSchema and report schema projection diagnostics`
