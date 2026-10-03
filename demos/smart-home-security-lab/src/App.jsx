/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { DashboardProvider } from './context/DashboardContext';
import { DeveloperControlsBanner } from './components/DeveloperControlsBanner';
import { AgentStatusToast } from './components/AgentStatusToast';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { SecurityPage, ClimatePage, EnergyPage, MediaPage, GuestbookPage, LightsPage } from './pages/Subpages';
import './index.css';

function App() {
  return (
    <Router>
      <DashboardProvider>
        <DeveloperControlsBanner />
        <AgentStatusToast />
        <div className="app-container">
          <Sidebar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/lights" element={<LightsPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/energy" element={<EnergyPage />} />
            <Route path="/guestbook" element={<GuestbookPage />} />
            <Route path="/climate" element={<ClimatePage />} />
          </Routes>
        </div>
      </DashboardProvider>
    </Router>
  );
}

export default App;
