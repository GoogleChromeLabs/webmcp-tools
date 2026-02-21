/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FiCode } from 'react-icons/fi';
import type { ToolDef } from '../types';

interface ToolCardProps {
  tool: ToolDef;
}

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <div className="tool-card">
      <div className="tool-header">
        <FiCode color="var(--primary-color)" />
        <span className="tool-name">{tool.functionName}</span>
      </div>
      <div className="tool-desc">{tool.description}</div>
      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
        <div className="tool-params">
          <details>
            <summary className="tool-card-summary">
              Parameters Schema
            </summary>
            <pre className="tool-card-pre">
              {JSON.stringify(tool.parameters, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
