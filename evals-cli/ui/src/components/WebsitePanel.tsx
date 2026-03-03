/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FiCloudLightning } from "react-icons/fi";
import { useWebsiteTools } from "../hooks/useWebsiteTools";
import { ToolCard } from "./ToolCard";
import type { AppConfig } from "../types";
import styles from "./WebsitePanel.module.css";

interface WebsitePanelProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  running: boolean;
}

export function WebsitePanel({ config, setConfig, running }: WebsitePanelProps) {
  const { tools, fetchingTools, fetchToolsForWebsite } = useWebsiteTools();

  return (
    <div className={styles.container}>
      <div className="form-group">
        <label>Target Website URL</label>
        <div className={styles.urlInputGroup}>
          <input
            type="text"
            value={config.url || ""}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            disabled={running}
            placeholder="https://example.com"
          />
          <button
            className="secondary"
            onClick={() => fetchToolsForWebsite(config.url || "")}
            disabled={fetchingTools || running || !config.url}
          >
            <FiCloudLightning /> {fetchingTools ? "Fetching..." : "Fetch Tools"}
          </button>
        </div>
      </div>

      <div className={styles.configInputsRow}>
        <div className={`form-group ${styles.flex1}`}>
          <label>Evals File Path</label>
          <input
            type="text"
            value={config.evalsFile}
            onChange={(e) => setConfig({ ...config, evalsFile: e.target.value })}
            disabled={running}
          />
        </div>
        <div className={`form-group ${styles.flex1}`}>
          <label>Model</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            disabled={running}
          />
        </div>
        <div className={`form-group ${styles.flex1}`}>
          <label>Backend</label>
          <select
            value={config.backend || "gemini"}
            onChange={(e) => setConfig({ ...config, backend: e.target.value })}
            disabled={running}
          >
            <option value="vercel">Vercel</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
      </div>

      {tools.length > 0 && (
        <div className={`tools-preview ${styles.mt16}`}>
          <h3>Discovered Tools ({tools.length})</h3>
          <div className={styles.toolsGrid}>
            {tools.map((t, idx) => (
              <ToolCard key={idx} tool={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
