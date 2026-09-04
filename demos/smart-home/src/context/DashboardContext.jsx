/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, createContext, useContext } from 'react';
import { useWebMCP } from 'use-webmcp-tool';

export const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  const [dashboardComponents, setDashboardComponents] = useState([
    'weather_widget',
  ]);

  const [isAgentActive, setIsAgentActive] = useState(false);

  useWebMCP({
    name: "rearrangeDOMComponents",
    description: "Rearranges the user's home dashboard by adding, removing, or reordering smart home control components based on the user's intent.",
    inputSchema: {
      type: "object",
      properties: {
        componentIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of component IDs to display on the dashboard. Examples: 'thermostat_control', 'camera_front_door', 'lock_front_door', 'smart_lights_living_room', 'energy_summary', 'weather_widget', 'media_player_living_room', 'alarm_panel', 'air_quality_sensor', 'robot_vacuum', 'solar_grid'"
        }
      },
      required: ["componentIds"]
    },
    execute: async (input) => {
      setIsAgentActive(true);
      setDashboardComponents(input.componentIds);

      setTimeout(() => setIsAgentActive(false), 2000);
      return "Dashboard successfully updated with requested components.";
    }
  });

  return (
    <DashboardContext.Provider value={{ dashboardComponents, isAgentActive }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
