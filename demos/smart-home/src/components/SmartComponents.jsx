import React from 'react';
import { 
  Thermometer, Video, Lock, Lightbulb, Battery, CloudRain, 
  Music, ShieldAlert, Wind, Play, SkipForward, Cpu, Zap 
} from 'lucide-react';

// --- EXISTING COMPONENTS ---

export const WeatherWidget = () => (
  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
    <CloudRain size={40} color="var(--accent)" />
    <div>
      <h3 style={{ fontSize: '24px', marginBottom: '4px' }}>72°F</h3>
      <p>Cloudy • 20% Precipitation</p>
    </div>
  </div>
);

export const ThermostatControl = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>HVAC • Downstairs</h3>
      <Thermometer size={20} color="var(--accent)" />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <button className="glass-btn">-</button>
      <span style={{ fontSize: '36px', fontWeight: '600' }}>74°</span>
      <button className="glass-btn">+</button>
    </div>
    <p style={{ textAlign: 'center', marginTop: '12px', color: 'var(--accent)' }}>Cooling to 72°</p>
  </div>
);

export const CameraFrontDoor = () => (
  <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
    <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0 }}>Front Door Cam</h3>
      <span style={{ color: 'red', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ width: '8px', height: '8px', background: 'red', borderRadius: '50%' }}></span>
        LIVE
      </span>
    </div>
    <div style={{ height: '160px', background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Video size={32} color="rgba(255,255,255,0.3)" />
      <span style={{ position: 'absolute', bottom: '8px', left: '8px', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>17:15:00 04/29/2026</span>
    </div>
  </div>
);

export const LockFrontDoor = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>Front Door Lock</h3>
      <Lock size={20} color="var(--accent)" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <button className="glass-btn" style={{ justifyContent: 'center' }}>Lock</button>
      <button className="glass-btn active" style={{ justifyContent: 'center' }}>Unlock</button>
    </div>
    <p style={{ marginTop: '16px', fontSize: '12px' }}>Last unlocked: 5 mins ago</p>
  </div>
);

export const SmartLightsLivingRoom = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>Living Room Lights</h3>
      <Lightbulb size={20} color="var(--accent)" />
    </div>
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
      <button className="glass-btn active">ON</button>
      <button className="glass-btn">OFF</button>
    </div>
    <p style={{ fontSize: '12px' }}>Brightness: 80%</p>
  </div>
);

// --- NEW COMPONENTS ---

export const MediaPlayerWidget = () => (
  <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(45deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.3))', zIndex: 0 }}></div>
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3>Sonos • Living Room</h3>
        <Music size={20} color="var(--accent)" />
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ width: '60px', height: '60px', background: 'var(--accent-glow)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Music size={24} color="var(--accent)" />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '16px' }}>Neon Nights</h4>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Synthwave Essentials</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button className="glass-btn"><Play size={16} /></button>
        <button className="glass-btn"><SkipForward size={16} /></button>
      </div>
    </div>
  </div>
);

export const AlarmPanelWidget = () => (
  <div className="card" style={{ borderColor: 'rgba(255, 0, 0, 0.2)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3 style={{ color: '#ff4b4b' }}>Security System</h3>
      <ShieldAlert size={20} color="#ff4b4b" />
    </div>
    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
      <span style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-secondary)' }}>DISARMED</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <button className="glass-btn active" style={{ justifyContent: 'center', background: 'rgba(255, 75, 75, 0.1)', color: '#ff4b4b', borderColor: '#ff4b4b' }}>Arm Home</button>
      <button className="glass-btn" style={{ justifyContent: 'center' }}>Arm Away</button>
    </div>
  </div>
);

export const AirQualityWidget = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>Air Quality • Indoors</h3>
      <Wind size={20} color="var(--accent)" />
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style={{ fontSize: '42px', fontWeight: '700', color: '#4ade80' }}>12</span>
      <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>AQI (Good)</span>
    </div>
    <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
      <span>PM2.5: 3.1 µg/m³</span>
      <span>VOC: 0.02 ppm</span>
    </div>
  </div>
);

export const RobotVacuumWidget = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>Roborock S7</h3>
      <Cpu size={20} color="var(--accent)" />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div>
        <span style={{ fontSize: '18px', fontWeight: '500' }}>Docked</span>
        <p style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>100% Charged</p>
      </div>
      <Battery size={32} color="#4ade80" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <button className="glass-btn active" style={{ justifyContent: 'center' }}>Clean</button>
      <button className="glass-btn" style={{ justifyContent: 'center' }}>Dock</button>
    </div>
  </div>
);

export const SolarGridWidget = () => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <h3>Energy Distribution</h3>
      <Zap size={20} color="#fbbf24" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px' }}>Solar Gen</span>
        <span style={{ color: '#fbbf24', fontWeight: '600' }}>4.2 kW</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: '80%', height: '100%', background: '#fbbf24' }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '14px' }}>Home Load</span>
        <span style={{ color: 'var(--accent)', fontWeight: '600' }}>2.4 kW</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: '45%', height: '100%', background: 'var(--accent)' }}></div>
      </div>
      <p style={{ marginTop: '8px', fontSize: '12px', color: '#4ade80' }}>+1.8 kW to Grid</p>
    </div>
  </div>
);


// Component Map for dynamic rendering by ID
export const COMPONENT_MAP = {
  'weather_widget': WeatherWidget,
  'thermostat_control': ThermostatControl,
  'camera_front_door': CameraFrontDoor,
  'lock_front_door': LockFrontDoor,
  'smart_lights_living_room': SmartLightsLivingRoom,
  'media_player_living_room': MediaPlayerWidget,
  'alarm_panel': AlarmPanelWidget,
  'air_quality_sensor': AirQualityWidget,
  'robot_vacuum': RobotVacuumWidget,
  'solar_grid': SolarGridWidget,
  'energy_summary': SolarGridWidget,
};
