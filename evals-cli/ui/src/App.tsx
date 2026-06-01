/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { FiPlay } from "react-icons/fi";
import { Toaster } from "react-hot-toast";

import type { Tab, AppConfig } from "./types";
import { useEvalsRunner } from "./hooks/useEvalsRunner";
import { TabNavigation } from "./components/TabNavigation";
import { ConfigPanel } from "./components/ConfigPanel";
import { WebsitePanel } from "./components/WebsitePanel";
import { LogViewer } from "./components/LogViewer";
import styles from "./App.module.css";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("local");
  const [config, setConfig] = useState<AppConfig>({
    evalsFile: "./examples/travel/evals.json",
    toolSchemaFile: "./examples/travel/schema.json",
    url: "https://example.com",
    model: "gemini-3-flash-preview",
    backend: "gemini",
    runs: 1,
  });
  const [isConfigValid, setIsConfigValid] = useState(true);

  const { logs, running, reportUrl, handleRun } = useEvalsRunner();
  const [rightTab, setRightTab] = useState<"logs" | "report">("logs");

  useEffect(() => {
    if (reportUrl) {
      setRightTab("report");
    } else {
      setRightTab("logs");
    }
  }, [reportUrl]);

  const onRunClick = () => {
    if (activeTab === "local") {
      if (!isConfigValid) return;
      handleRun({
        evalsFile: config.evalsFile,
        toolSchemaFile: config.toolSchemaFile,
        model: config.model,
        backend: config.backend,
        runs: config.runs,
      });
    } else {
      handleRun({
        evalsFile: config.evalsFile,
        url: config.url || "",
        model: config.model,
        backend: config.backend,
        runs: config.runs,
      });
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" />
      <div className={styles.leftColumn}>
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="button-group" style={{ marginTop: 0 }}>
              <button
                className="primary"
                onClick={onRunClick}
                disabled={running || (activeTab === "local" && !isConfigValid)}
              >
                <FiPlay /> {running ? "Running..." : "Run Evals"}
              </button>
            </div>

            {activeTab === "local" && (
              <ConfigPanel
                config={config}
                setConfig={setConfig}
                running={running}
                setIsValid={setIsConfigValid}
              />
            )}

            {activeTab === "website" && (
              <WebsitePanel config={config} setConfig={setConfig} running={running} />
            )}
          </div>
        </div>
      </div>
      <div className={styles.rightColumn}>
        <div className={styles.rightHeader}>
          <div className={styles.rightTabs}>
            <button
              className={`${styles.rightTabButton} ${rightTab === "logs" ? styles.activeRightTab : ""}`}
              onClick={() => setRightTab("logs")}
            >
              Console Logs
            </button>
            <button
              className={`${styles.rightTabButton} ${rightTab === "report" ? styles.activeRightTab : ""}`}
              onClick={() => setRightTab("report")}
              disabled={!reportUrl}
            >
              Report View
            </button>
          </div>
        </div>
        <div className={styles.rightContent}>
          {rightTab === "logs" ? (
            <LogViewer logs={logs} />
          ) : (
            reportUrl && (
              <iframe
                src={reportUrl}
                className={styles.reportIframe}
                title="Evaluation Report"
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
