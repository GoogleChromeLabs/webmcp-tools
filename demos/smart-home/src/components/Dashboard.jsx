import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../context/DashboardContext';
import { COMPONENT_MAP } from './SmartComponents';


export function Dashboard() {
  const { dashboardComponents, isAgentActive } = useDashboard();

  return (
    <div className="main-content">
      <div style={{ marginBottom: '40px' }}>
        <h1>Welcome Home</h1>
        <p>Everything is running smoothly.</p>
      </div>

      <AnimatePresence>
        {isAgentActive && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--accent)'
            }}
          >
            <span className="animate-spin" style={{ fontSize: '20px' }}>⚙️</span> 
            Updating dashboard components...
          </motion.div>
        )}
      </AnimatePresence>

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
