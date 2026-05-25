import { useState, useEffect, createContext, useContext } from 'react';

export const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  // Default components shown on the dashboard
  const [dashboardComponents, setDashboardComponents] = useState([
    'weather_widget',
  ]);

  const [isAgentActive, setIsAgentActive] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");

  useEffect(() => {
    // Polyfill for navigator.modelContext (until browsers implement the spec)
    if (!navigator.modelContext) {
      navigator.modelContext = {
        _tools: {},
        registerTool: function(tool, options = {}) {
          if (this._tools[tool.name]) {
            throw new DOMException("Duplicate tool name", "InvalidStateError");
          }
          this._tools[tool.name] = tool;
          
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              delete this._tools[tool.name];
            });
          }
        }
      };
    }

    // Use AbortController to handle cleanup (handles React StrictMode double-invocation)
    const controller = new AbortController();

    try {
      // Register tool using the actual WebMCP specification with abort signal
      navigator.modelContext.registerTool({
        name: "rearrangeDOMComponents",
        title: "Rearrange Dashboard",
        description: "Rearranges the user's home dashboard by adding, removing, or reordering smart home control components based on the user's intent.",
        inputSchema: {
          type: "object",
          properties: {
            componentIds: {
              type: "array",
              items: { type: "string" },
              description: "Array of component IDs to display on the dashboard. Examples: 'thermostat_control', 'camera_front_door', 'lock_front_door', 'smart_lights_living_room', 'energy_summary', 'weather_widget', 'media_player_living_room', 'alarm_panel', 'air_quality_sensor', 'robot_vacuum', 'solar_grid'"
            },
            layoutMessage: {
              type: "string",
              description: "A short message explaining why the dashboard was reorganized (e.g., 'Brought up the front door camera and lock for your guest.')."
            }
          },
          required: ["componentIds"]
        },
        execute: async (input, client) => {
          setIsAgentActive(true);
          setAgentMessage(input.layoutMessage || "Dashboard updated.");
          setDashboardComponents(input.componentIds);
          
          setTimeout(() => setIsAgentActive(false), 2000);
          return "Dashboard successfully updated with requested components.";
        }
      }, { signal: controller.signal });

      console.log("WebMCP tool registered via navigator.modelContext");
    } catch (e) {
      if (e.name !== "InvalidStateError") console.error(e);
    }

    // Cleanup function to unregister the tool when the component unmounts
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <DashboardContext.Provider value={{ dashboardComponents, isAgentActive, agentMessage }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
