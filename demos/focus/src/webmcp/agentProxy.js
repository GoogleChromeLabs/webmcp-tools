// Vite dev plugin — proxies OpenAI-compatible chat-completions.
//
// Why: OpenAI-compatible providers (OpenAI, NVIDIA NIM, …) do NOT send
// `Access-Control-Allow-Origin`, so an in-browser fetch from the companion
// window is blocked by CORS before it ever reaches the provider. The fix is a
// same-origin loopback proxy: the companion POSTs to /api/agent-loop on its own
// origin, and the dev server forwards the request server-side (no CORS) to the
// configured upstream with the caller's Authorization header.
//
// Security: the key arrives in the Authorization header, travels only
// browser → localhost dev server → the configured upstream, and is never
// logged, stored, or written to disk. Dev-only (configureServer); not present
// in production builds.

const CHAT_COMPLETIONS = '/chat/completions';

export default function agentProxy() {
  return {
    name: 'focus-agent-proxy',
    configureServer(server) {
      server.middlewares.use('/api/agent-loop', (req, res, next) => {
        if (req.method !== 'POST') return next();

        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch (e) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad JSON body' }));
            return;
          }

          const { baseUrl, model, messages, tools, tool_choice } = body || {};
          const auth = req.headers['authorization'];
          if (!baseUrl || !auth) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing baseUrl or Authorization header' }));
            return;
          }

          const endpoint = baseUrl.replace(/\/+$/, '') + CHAT_COMPLETIONS;
          const payload = { model, messages };
          if (tools) payload.tools = tools;
          if (tool_choice) payload.tool_choice = tool_choice;

          try {
            const upstream = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: auth,
              },
              body: JSON.stringify(payload),
            });
            const text = await upstream.text();
            res.writeHead(upstream.status, { 'content-type': 'application/json' });
            res.end(text);
          } catch (err) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: `Upstream fetch failed: ${err.message || String(err)}` }));
          }
        });
      });
    },
  };
}
