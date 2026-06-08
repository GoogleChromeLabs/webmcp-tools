# WebMCP Demo

A mini-site that's a WebMCP explainer! [Visit the live site](https://googlechromelabs.github.io/webmcp-tools/demos/explainer/).

This shows a side-by-side demo of how AI agents interact with a web page today (site scraping)
and a future where the page declares structured tools with **WebMCP**. It shows:

- A calendar button side by side as a demo, but on the right side,
  you can play with it with the webMCP extension.
- An explainer of how WebMCP works, and many links and docs
- Calls to action linking to the spec and feedback channels.

You can feel free to fork this demo as a learning tool, and you're also encouraged to
follow the links on the site for further resources to build your own sites, apps and
experiences, or participate in the origin trial.

## Running locally

This is a single static page — no build step.

```sh
# any static server works; pick one
npx serve .
# or
python3 -m http.server 8000
```

Open the served URL in a browser.

## Files

- `index.html` — page structure and copy
- `styles.css` — visual design
- `app.js` — booking widget, WebMCP shim, agent simulation, annotation layout
