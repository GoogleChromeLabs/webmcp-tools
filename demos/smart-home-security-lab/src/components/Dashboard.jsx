/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useDashboard } from '../context/DashboardContext';
import { COMPONENT_MAP } from './SmartComponents';


export function Dashboard() {
  const { dashboardComponents } = useDashboard();

  return (
    <div className="main-content">
      <div style={{ marginBottom: '40px' }}>
        <h1>Welcome Home</h1>
        <p>Everything is running smoothly.</p>
      </div>

      <div className="bento-grid">
        <AnimatePresence>
          {dashboardComponents.map(id => {
            const Component = COMPONENT_MAP[id];
            if (!Component) return null;
            
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                layout
              >
                <Component />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
