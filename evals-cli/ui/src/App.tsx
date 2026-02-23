/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { FiPlay } from 'react-icons/fi';
import { Toaster } from 'react-hot-toast';

import type { Tab, AppConfig } from './types';
import { useEvalsRunner } from './hooks/useEvalsRunner';
import { TabNavigation } from './components/TabNavigation';
import { ConfigPanel } from './components/ConfigPanel';
import { WebsitePanel } from './components/WebsitePanel';
import { LogViewer } from './components/LogViewer';
import styles from './App.module.css';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const [config, setConfig] = useState<AppConfig>({
    evalsFile: "./examples/travel/evals.json",
    toolSchemaFile: "./examples/travel/schema.json",
    url: "https://example.com",
    model: "gemini-2.5-flash",
    backend: "gemini"
  });
  const [isConfigValid, setIsConfigValid] = useState(true);

  const { logs, running, handleRun } = useEvalsRunner();

  const onRunClick = () => {
    if (activeTab === 'local') {
      if (!isConfigValid) return;
      handleRun({
        evalsFile: config.evalsFile,
        toolSchemaFile: config.toolSchemaFile,
        model: config.model,
        backend: config.backend
      });
    } else {
      handleRun({
        evalsFile: config.evalsFile,
        url: config.url || '',
        model: config.model,
        backend: config.backend
      });
    }
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-right" />
      <div className={styles.leftColumn}>
        <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="panel">
          <div className="button-group">
            <button className="primary" onClick={onRunClick} disabled={running || (activeTab === 'local' && !isConfigValid)}>
              <FiPlay /> {running ? 'Running...' : 'Run Evals'}
            </button>
          </div>

          {activeTab === 'local' && (
            <ConfigPanel
              config={config}
              setConfig={setConfig}
              running={running}
              setIsValid={setIsConfigValid}
            />
          )}

          {activeTab === 'website' && (
            <WebsitePanel
              config={config}
              setConfig={setConfig}
              running={running}
            />
          )}
        </div>
      </div>
      <div className={styles.rightColumn}>
        <LogViewer logs={logs} />
      </div>
    </div>
  );
}

export default App;
