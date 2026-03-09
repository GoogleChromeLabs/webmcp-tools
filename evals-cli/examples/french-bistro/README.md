This directory contains evaluation test cases for the [WebMCP french-bistro!](../../../demos/french-bistro/) demo.

Note that `schema.json` is not included here because these evaluations are designed to be run against the [live demo](https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro) directly in the evals-cli UI, which discovers the tool schemas dynamically from the page.

### Testing cross-document variations

The demo supports a cross-document submission mode when loading the URL with the `?crossdocument&toolautosubmit` query parameter. You can run the tests against this version of the demo, and all the test cases and assertions should evaluate to true in the exact same manner.

Example command:

```bash
npm run build && node dist/bin/webmcpevals.js --url="http://localhost:8080?crossdocument&toolautosubmit" --evals=examples/french-bistro/evals.json --debug
```
