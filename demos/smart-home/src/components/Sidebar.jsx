/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, LayoutDashboard, Music, Shield, Thermometer } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export function Sidebar() {
  return (
    <div className="sidebar">
      <h2 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <LayoutDashboard size={24} /> WebMCP Smart Home
      </h2>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '40px' }}>
        <NavLink to="/" className={({isActive}) => `glass-btn ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink to="/security" className={({isActive}) => `glass-btn ${isActive ? 'active' : ''}`}>
          <Shield size={18} /> Security
        </NavLink>
        <NavLink to="/climate" className={({isActive}) => `glass-btn ${isActive ? 'active' : ''}`}>
          <Thermometer size={18} /> Climate
        </NavLink>
        <NavLink to="/energy" className={({isActive}) => `glass-btn ${isActive ? 'active' : ''}`}>
          <Activity size={18} /> Energy
        </NavLink>
        <NavLink to="/media" className={({isActive}) => `glass-btn ${isActive ? 'active' : ''}`}>
          <Music size={18} /> Media
        </NavLink>
      </nav>
    </div>
  );
}
