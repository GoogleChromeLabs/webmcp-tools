/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FiSettings, FiGlobe } from 'react-icons/fi';
import type { Tab } from '../types';

interface TabNavigationProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function TabNavigation({ activeTab, setActiveTab }: TabNavigationProps) {
  return (
    <div className="tabs-container">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'local' ? 'active' : ''}`}
          onClick={() => setActiveTab('local')}
        >
          <FiSettings className="tab-icon" /> Local Tools
        </button>
        <button
          className={`tab ${activeTab === 'website' ? 'active' : ''}`}
          onClick={() => setActiveTab('website')}
        >
          <FiGlobe className="tab-icon" /> Website Tools
        </button>
      </div>
    </div>
  );
}
