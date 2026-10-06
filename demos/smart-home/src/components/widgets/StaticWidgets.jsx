/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudRain, ShieldAlert, Thermometer, Video, Wind, Zap } from 'lucide-react';

export const Weather = () => (
  <div className="card weather-card">
    <CloudRain size={40} color="var(--accent)" />
    <div>
      <h3 className="weather-temp">24°C</h3>
      <p>Cloudy • 20% Precipitation</p>
    </div>
  </div>
);

export const ThermostatControl = () => (
  <div className="card">
    <div className="widget-header">
      <h3>HVAC • Downstairs</h3>
      <Thermometer size={20} color="var(--accent)" />
    </div>
    <div className="energy-row">
      <button className="glass-btn">-</button>
      <span className="thermostat-value">20°</span>
      <button className="glass-btn">+</button>
    </div>
    <p className="thermostat-status">Cooling to 19°</p>
  </div>
);

export const CameraFrontDoor = () => (
  <div className="card camera-card">
    <div className="camera-header">
      <h3>Front Door Cam</h3>
      <span className="camera-live-badge">
        <span className="camera-live-dot"></span>
        LIVE
      </span>
    </div>
    <div className="camera-feed">
      <Video size={32} color="rgba(255,255,255,0.3)" />
      <span className="camera-timestamp">17:15:00 04/29/2026</span>
    </div>
  </div>
);

export const AlarmPanel = () => (
  <div className="card alarm-card">
    <div className="widget-header">
      <h3 className="alarm-title">Security System</h3>
      <ShieldAlert size={20} color="#ff4b4b" />
    </div>
    <div className="alarm-status-box">
      <span className="alarm-status-text">DISARMED</span>
    </div>
    <div className="widget-grid-2col">
      <button className="glass-btn active alarm-btn-home">Arm Home</button>
      <button className="glass-btn glass-btn--center">Arm Away</button>
    </div>
  </div>
);

export const AirQuality = () => (
  <div className="card">
    <div className="widget-header">
      <h3>Air Quality • Indoors</h3>
      <Wind size={20} color="var(--accent)" />
    </div>
    <div className="aqi-value-row">
      <span className="aqi-number">12</span>
      <span className="aqi-label">AQI (Good)</span>
    </div>
    <div className="aqi-metrics">
      <span>PM2.5: 3.1 µg/m³</span>
      <span>VOC: 0.02 ppm</span>
    </div>
  </div>
);

export const EnergySummary = () => (
  <div className="card">
    <div className="widget-header">
      <h3>Energy Distribution</h3>
      <Zap size={20} color="#fbbf24" />
    </div>
    <div className="energy-body">
      <div className="energy-row">
        <span className="energy-label">Solar Gen</span>
        <span className="energy-val-solar">4.2 kW</span>
      </div>
      <div className="energy-bar-track">
        <div className="energy-bar-fill-solar"></div>
      </div>
      <div className="energy-row energy-row--spaced">
        <span className="energy-label">Home Load</span>
        <span className="energy-val-load">2.4 kW</span>
      </div>
      <div className="energy-bar-track">
        <div className="energy-bar-fill-load"></div>
      </div>
      <p className="energy-net-text">+1.8 kW to Grid</p>
    </div>
  </div>
);
