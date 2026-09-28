/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const port = 3333;
const workspaceRoot = path.resolve("evals-workspace");

function loadWorkspaceData() {
  if (!fs.existsSync(workspaceRoot)) {
    return { iterations: [] };
  }

  const iterationsData: unknown[] = [];
  const skillDirs = fs.readdirSync(workspaceRoot);

  for (const skillName of skillDirs) {
    const skillPath = path.join(workspaceRoot, skillName);
    if (!fs.statSync(skillPath).isDirectory()) continue;

    const itDirs = fs.readdirSync(skillPath).filter((d) => d.startsWith("iteration-"));

    for (const itDir of itDirs) {
      const itPath = path.join(skillPath, itDir);
      const iterationNum = parseInt(itDir.replace("iteration-", ""), 10);
      const benchmarkPath = path.join(itPath, "benchmark.json");
      const feedbackPath = path.join(itPath, "feedback.json");

      if (!fs.existsSync(benchmarkPath)) continue;

      const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));
      const feedback = fs.existsSync(feedbackPath)
        ? JSON.parse(fs.readFileSync(feedbackPath, "utf8"))
        : {};

      const evalDirs = fs.readdirSync(itPath).filter((d) => d.startsWith("eval-"));
      const evals: unknown[] = [];

      for (const eDir of evalDirs) {
        const evalId = eDir.replace(/^eval-/, "");
        const evalBasePath = path.join(itPath, eDir);

        const readConfig = (config: "with_skill" | "without_skill") => {
          const configPath = path.join(evalBasePath, config);
          if (!fs.existsSync(configPath)) return undefined;

          // Check for run-1 directory if files are not at configPath root
          let targetPath = configPath;
          if (!fs.existsSync(path.join(configPath, "outputs", "response.md"))) {
            const runDirs = fs
              .readdirSync(configPath)
              .filter(
                (d) => /^run-\d+$/.test(d) && fs.statSync(path.join(configPath, d)).isDirectory(),
              );
            if (runDirs.length > 0) {
              targetPath = path.join(
                configPath,
                runDirs.sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))[0],
              );
            }
          }

          const responsePath = path.join(targetPath, "outputs", "response.md");
          const timingPath = path.join(targetPath, "timing.json");
          const gradingPath = path.join(targetPath, "grading.json");

          return {
            output: fs.existsSync(responsePath) ? fs.readFileSync(responsePath, "utf8") : "",
            timing: fs.existsSync(timingPath)
              ? JSON.parse(fs.readFileSync(timingPath, "utf8"))
              : {},
            grading: fs.existsSync(gradingPath)
              ? JSON.parse(fs.readFileSync(gradingPath, "utf8"))
              : {},
          };
        };

        evals.push({
          id: evalId,
          with_skill: readConfig("with_skill"),
          without_skill: readConfig("without_skill"),
        });
      }

      iterationsData.push({
        iteration: iterationNum,
        skill_name: skillName,
        benchmark,
        evals,
        feedback,
      });
    }
  }

  return { iterations: iterationsData.reverse() };
}

async function start() {
  const server = await createServer({
    root: path.resolve("src/eval-viewer"),
    server: {
      port,
      open: true,
    },
    plugins: [
      {
        name: "eval-viewer-api",
        configureServer(viteDevServer) {
          viteDevServer.middlewares.use((req, res, next) => {
            if (req.url === "/api/workspace" && req.method === "GET") {
              const data = loadWorkspaceData();
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return;
            }

            if (req.url === "/api/feedback" && req.method === "POST") {
              let body = "";
              req.on("data", (chunk) => {
                body += chunk;
              });
              req.on("end", () => {
                try {
                  const { skill, iteration, eval_id, feedback } = JSON.parse(body);
                  const fbPath = path.join(
                    workspaceRoot,
                    skill,
                    `iteration-${iteration}`,
                    "feedback.json",
                  );
                  const current = fs.existsSync(fbPath)
                    ? JSON.parse(fs.readFileSync(fbPath, "utf8"))
                    : {};
                  current[eval_id] = feedback;
                  fs.writeFileSync(fbPath, JSON.stringify(current, null, 2) + "\n", "utf8");
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: (e as Error).message }));
                }
              });
              return;
            }

            next();
          });
        },
      },
    ],
  });

  await server.listen();
  console.log(`\n  Vite Eval Viewer running at: http://localhost:${port}\n`);
}

start().catch((err) => {
  console.error("Failed to start eval viewer:", err);
  process.exit(1);
});
