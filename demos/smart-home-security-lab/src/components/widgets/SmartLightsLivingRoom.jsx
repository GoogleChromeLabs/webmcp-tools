/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lightbulb } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const SmartLightsLivingRoom = () => {
  const { lightsPower = 'off', lightsBrightness = 0, setLivingRoomLightsState } = useDashboard() || {};
  const isOn = lightsPower === 'on' && lightsBrightness > 0;

  const dynamicCardStyle = isOn
    ? {
        background: `radial-gradient(circle at top right, rgba(250, 204, 21, ${
          0.12 + (lightsBrightness / 100) * 0.18
        }), rgba(15, 23, 42, 0.85))`,
        borderColor: 'rgba(250, 204, 21, 0.5)',
        boxShadow: `0 0 ${Math.round(lightsBrightness * 0.35)}px rgba(250, 204, 21, 0.25)`,
      }
    : undefined;

  return (
    <div
      className={`card lights-card ${!isOn ? 'lights-card--off' : ''}`}
      style={dynamicCardStyle}
    >
      <div className="widget-header">
        <div className="widget-title-row">
          <h3>Living Room Lights</h3>
          <span className={`status-pill ${isOn ? 'status-pill--yellow' : 'status-pill--red'}`}>
            {isOn ? 'ON' : 'OFF'}
          </span>
        </div>
        <Lightbulb
          size={24}
          color={isOn ? '#fde047' : '#475569'}
          className={`lights-icon ${isOn ? 'lights-icon--on' : ''}`}
        />
      </div>

      <div className="lights-controls">
        <button
          className={`glass-btn lights-btn ${isOn ? 'active lights-btn--on-active' : ''}`}
          onClick={() => setLivingRoomLightsState?.('on', lightsBrightness > 0 ? lightsBrightness : 80)}
        >
          ON
        </button>
        <button
          className={`glass-btn lights-btn ${!isOn ? 'active lights-btn--off-active' : ''}`}
          onClick={() => setLivingRoomLightsState?.('off', 0)}
        >
          OFF
        </button>
      </div>

      <div className="lights-brightness-row">
        <span className="lights-brightness-label">Brightness:</span>
        <input
          type="range"
          min="0"
          max="100"
          value={isOn ? lightsBrightness : 0}
          onChange={(e) => {
            const val = Number(e.target.value);
            setLivingRoomLightsState?.(val === 0 ? 'off' : 'on', val);
          }}
          className="lights-slider"
        />
        <span className="lights-value">{isOn ? `${lightsBrightness}%` : '0%'}</span>
      </div>
    </div>
  );
};
