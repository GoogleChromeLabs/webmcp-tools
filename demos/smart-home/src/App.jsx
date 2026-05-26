/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { DashboardProvider } from './context/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { SecurityPage, ClimatePage, EnergyPage, MediaPage } from './pages/Subpages';
import './index.css';

function App() {
  return (
    <Router>
      <DashboardProvider>
        <div className="app-container">
          <Sidebar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/climate" element={<ClimatePage />} />
            <Route path="/energy" element={<EnergyPage />} />
            <Route path="/media" element={<MediaPage />} />
          </Routes>
        </div>
      </DashboardProvider>
    </Router>
  );
}

export default App;
