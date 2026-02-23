/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FiCode } from 'react-icons/fi';
import type { ToolDef } from '../types';
import styles from './ToolCard.module.css';

interface ToolCardProps {
  tool: ToolDef;
}

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <FiCode color="var(--primary-color)" />
        <span className={styles.name}>{tool.functionName}</span>
      </div>
      <div className={styles.desc}>{tool.description}</div>
      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
        <div className={styles.params}>
          <details>
            <summary className={styles.summary}>
              Parameters Schema
            </summary>
            <pre className={styles.pre}>
              {JSON.stringify(tool.parameters, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
