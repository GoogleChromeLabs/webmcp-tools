/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { AppConfig } from '../types';

interface ConfigPanelProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  running: boolean;
  setIsValid: (valid: boolean) => void;
}

export function ConfigPanel({ config, setConfig, running, setIsValid }: ConfigPanelProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jsonStr, setJsonStr] = useState(() => JSON.stringify({
    evalsFile: config.evalsFile,
    toolSchemaFile: config.toolSchemaFile,
    model: config.model,
    backend: config.backend
  }, null, 2));

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.model !== config.model || parsed.evalsFile !== config.evalsFile) {
        setJsonStr(JSON.stringify({
          evalsFile: config.evalsFile,
          toolSchemaFile: config.toolSchemaFile,
          model: config.model,
          backend: config.backend
        }, null, 2));
      }
    } catch {
      // invalid JSON, do not overwrite user's typing
    }
  }, [config.model, config.evalsFile, config.toolSchemaFile, config.backend, jsonStr]);

  const handleValidation = useCallback((markers: any[]) => {
    if (markers.length > 0) {
      setIsValid(false);
      setErrorMsg('Invalid JSON configuration');
    } else {
      setIsValid(true);
      setErrorMsg(null);
    }
  }, [setIsValid]);

  const handleChange = (value: string | undefined) => {
    const val = value || '';
    setJsonStr(val);
    try {
      const parsed = JSON.parse(val);
      setConfig({ ...config, ...parsed }); // preserve url
      setIsValid(true);
      setErrorMsg(null);
    } catch {
      setIsValid(false);
      setErrorMsg('Invalid JSON');
    }
  };

  return (
    <div className="form-group config-panel">
      <label>
        JSON Configuration
        {errorMsg && <span className="config-error-text">{errorMsg}</span>}
      </label>
      <div className={`editor-container ${errorMsg ? 'has-error' : ''}`}>
        <Editor
          height="100%"
          defaultLanguage="json"
          value={jsonStr}
          onChange={handleChange}
          onValidate={handleValidation}
          options={{
            minimap: { enabled: false },
            readOnly: running,
            scrollBeyondLastLine: false,
            wordWrap: 'on'
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  );
}
