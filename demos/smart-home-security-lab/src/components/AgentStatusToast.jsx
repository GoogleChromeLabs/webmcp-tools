/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDashboard } from '../context/DashboardContext';

export function AgentStatusToast() {
  const { isAgentActive } = useDashboard();

  return (
    <AnimatePresence>
      {isAgentActive && (
        <motion.div
          className="agent-status-toast"
          initial={{ opacity: 0, y: -16, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -16, x: '-50%' }}
          transition={{ duration: 0.2 }}
        >
          <span className="animate-spin" style={{ fontSize: '16px', lineHeight: 1 }}>⚙️</span>
          <span>Agent is working...</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
