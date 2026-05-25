import React from 'react';
import { 
  COMPONENT_MAP 
} from '../components/SmartComponents';

// Helper component to wrap page layouts
const PageLayout = ({ title, children }) => (
  <div className="main-content">
    <div style={{ marginBottom: '40px' }}>
      <h1>{title}</h1>
    </div>
    <div className="bento-grid">
      {children}
    </div>
  </div>
);

export const SecurityPage = () => (
  <PageLayout title="Security">
    {React.createElement(COMPONENT_MAP['alarm_panel'])}
    {React.createElement(COMPONENT_MAP['camera_front_door'])}
    {React.createElement(COMPONENT_MAP['lock_front_door'])}
  </PageLayout>
);

export const ClimatePage = () => (
  <PageLayout title="Climate & Environment">
    {React.createElement(COMPONENT_MAP['weather_widget'])}
    {React.createElement(COMPONENT_MAP['thermostat_control'])}
    {React.createElement(COMPONENT_MAP['air_quality_sensor'])}
  </PageLayout>
);

export const EnergyPage = () => (
  <PageLayout title="Energy Grid">
    {React.createElement(COMPONENT_MAP['solar_grid'])}
  </PageLayout>
);

export const MediaPage = () => (
  <PageLayout title="Media & Appliances">
    {React.createElement(COMPONENT_MAP['media_player_living_room'])}
    {React.createElement(COMPONENT_MAP['robot_vacuum'])}
    {React.createElement(COMPONENT_MAP['smart_lights_living_room'])}
  </PageLayout>
);


