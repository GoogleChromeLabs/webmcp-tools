/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
}

export function LogViewer({ logs }: LogViewerProps) {
  return (
    <div className="panel logs-container">
      <h2>Execution Logs</h2>
      <div className="logs">
        {logs.length === 0 ? (
          <div className="log-viewer-empty">
            No logs yet. Click 'Run Evals' to begin.
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`log-entry log-${log.type}`}>
              {log.msg}
              {log.isLink && (
                <a href={log.linkUrl || "/report.html"} target="_blank" rel="noreferrer" className="log-link">View Details</a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
