/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogEntry } from "../types";
import styles from "./LogViewer.module.css";

interface LogViewerProps {
  logs: LogEntry[];
}

export function LogViewer({ logs }: LogViewerProps) {
  return (
    <div className={`panel ${styles.container}`}>
      <h2>Execution Logs</h2>
      <div className={styles.logs}>
        {logs.length === 0 ? (
          <div className={styles.empty}>No logs yet. Click 'Run Evals' to begin.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`${styles.entry} ${styles[log.type]}`}>
              {log.msg}
              {log.isLink && (
                <a
                  href={log.linkUrl || "/report.html"}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.link}
                >
                  View Details
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
