/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runEvaluations } from './runner.js';
import { listToolsFromPage } from '../evaluator/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/run', async (req, res) => {
    // Expected to receive either Config or WebmcpConfig in body
    const config = req.body;
    
    if (!config || !config.evalsFile || (!config.url && !config.toolSchemaFile)) {
      res.status(400).json({ error: 'Missing required configuration' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await runEvaluations(config, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'completed' || event.type === 'error') {
        res.end();
      }
    });
  });

  app.post('/api/tools', async (req, res) => {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Missing required parameter: url' });
      return;
    }

    try {
      const tools = await listToolsFromPage(url);
      res.json({ tools });
    } catch (error: any) {
      console.error('Error fetching tools:', error);
      res.status(500).json({ error: `Failed to fetch tools: ${error.message}` });
    }
  });

  // Serve generated report
  app.get('/report-:id.html', (req, res) => {
    const filename = `report-${req.params.id}.html`;
    res.sendFile(join(process.cwd(), filename));
  });

  // Serve static files from the built frontend 'ui/dist' folder
  const uiBuildPath = join(__dirname, '..', '..', 'ui', 'dist');
  app.use(express.static(uiBuildPath));

  app.use((req, res, next) => {
    if (req.method === 'GET') {
      res.sendFile(join(uiBuildPath, 'index.html'));
    } else {
      next();
    }
  });

  return app;
}
