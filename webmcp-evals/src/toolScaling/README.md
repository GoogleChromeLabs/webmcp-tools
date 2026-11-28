# WebMCP Tool-Count Scaling Benchmark (`#422`)

Isolated, single-step evaluation suite measuring how website WebMCP tool counts (`N = 1..100+`) affect Gemini tool selection accuracy, abstention, parameter validity, token usage, and indicative client latency.

## Files

- `PREREGISTRATION.md`: Frozen v2.4 protocol, `900`-call MVP matrix, and pre-registered accuracy-cliff criteria.
- `types.ts`: Trial specification, `usageMetadata`, and summary types.
- `dataset.ts`: Deterministic seeded generator (`examples/commerce/shopping/schema.json` target tools + real `examples/` orthogonal schemas at commit `f3faa835f3fdeab42e41b055209d6954b192f653` + curated synthetic distractors + `16 positive / 4 abstention` intents).
- `geminiRunner.ts`: Native `@google/genai` runner (`FunctionCallingConfigMode.AUTO`, `f.args ?? {}`, `thinkingBudget`, paired `countTokens`, bounded `429`/`503` retries, immediate daily-quota stop, JSONL checkpoint/resume).
- `metrics.ts`: Wilson 95% CIs, Macro-F1, schema validity, semantic arg checks, pre-registered cliff check, CSV & Markdown reporting.
- `cli.ts`: Standalone CLI (`quota-probe`, `micro-pilot`, `run`, `report`).
- `openAiCompatRunner.ts`: Optional OpenAI-compatible runner (`--provider openrouter|groq`, not used in the `900`-trial Gemini dataset).

> **Note on v1 `domain-adjacent` arm & mid-run resume:** In `dataset.ts`, the `domain-adjacent` identifier represents same-domain, non-overlapping tools (`track_shipment`, `initiate_return`, etc.), not near-duplicate schemas. During the `900`-trial `gemini-3.5-flash-lite` run, after hitting the initial daily-quota cap at trial `828`, `openAiCompatRunner.ts` and `--provider` CLI wiring were added without altering Gemini prompt/scoring behavior, and the remaining `74` trials were resumed (`--resume`) on the same `gemini-3.5-flash-lite` model using a separate AI Studio project credential.

## Commands (run inside `webmcp-evals/`)

1. Put `GOOGLE_AI=your_key` in `webmcp-evals/.env` (gitignored).
2. Build first:
   ```bash
   npm run build
   ```
3. Run `20` `countTokens` quota probe:
   ```bash
   node dist/toolScaling/cli.js quota-probe
   ```
4. Run `6`-call Stage 1 micro-pilot (`N = 1, 5, 40, 100, 128, 150`):
   ```bash
   node dist/toolScaling/cli.js micro-pilot
   ```
5. Run `900`-call Stage 2 MVP (auto-resumes from `.evals/tool-scaling/mvp/results.jsonl`):
   ```bash
   node dist/toolScaling/cli.js run
   ```
6. Regenerate `summary.csv` and `report.md` from an existing `results.jsonl`:
   ```bash
   node dist/toolScaling/cli.js report -i .evals/tool-scaling/mvp/results.jsonl
   ```

## Draft Comment for Issue `#422`

> Hi! I'd like to run a controlled single-step scaling study for this issue if nobody is working on it yet.
>
> Planned scope:
>
> - Test `N ∈ {1, 5, 10, 20, 40, 50, 100}` (specifically probing the `40`-tool Lighthouse heuristic from #17221) across orthogonal (`examples/` + synthetic) and domain-adjacent distractors, plus a concise-vs-verbose control at `N=20` to separate tool-count effects from schema-token volume.
> - Use a separate isolated runner with native `@google/genai` (`AUTO` mode) so it does not overlap with PR #659 or PR #665.
> - Report top-1 accuracy (Wilson CIs), abstention (`expectedCall: null`), Macro-F1, parameter validity, `usageMetadata` tokens + paired `countTokens` schema overhead, and indicative client latency.
>
> Would you prefer this contributed as an isolated PR here or kept in a standalone companion repo with a summary posted back on this issue?
