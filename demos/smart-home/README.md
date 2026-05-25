# WebMCP Smart Home | Smart Home Control Panel WebMCP Demo

🚀 **Live Demo:** `https://googlechromelabs.github.io/webmcp-tools/demos/smart-home/`

A React-based smart home dashboard designed to showcase **WebMCP** implementation. This project demonstrates how an AI agent can programmatically and dynamically reconfigure dashboard control widgets (adding, removing, and re-ordering tiles) to suit the user's immediate situational needs and intent.

### 🛠️ How It Works

This demo uses the **Imperative WebMCP API** (`navigator.modelContext.registerTool`) to register a high-level layout orchestrator.

* **UI Synchronization**: The orchestrator updates React state to mount or unmount control widgets with spring-based Framer Motion layout animations.
* **Visual Feedback Banner**: Whenever the AI agent performs an action, a floating, animated status banner drops down from the top of the screen showing a spinning gear icon `⚙️` and the agent's custom explanation message. The banner automatically slides back up after 2 seconds.

### 📦 Registered Tools

| Tool Name | Location | Description |
| :--- | :--- | :--- |
| `rearrangeDOMComponents` | `DashboardContext.jsx` | Reorganizes the active dashboard layout by adding, removing, or reordering widgets based on the user's requests. Takes an array of `componentIds` and a custom `layoutMessage`. |

#### **Available Dashboard Widget IDs:**
* `weather_widget` (Outdoor Weather & Precipitation)
* `thermostat_control` (HVAC Downstairs Control)
* `camera_front_door` (Front Door Live Camera Feed)
* `lock_front_door` (Front Door Smart Lock Toggle)
* `smart_lights_living_room` (Living Room Smart Bulbs)
* `media_player_living_room` (Sonos Living Room Player)
* `alarm_panel` (Home/Away Security Alarm System)
* `air_quality_sensor` (Indoor PM2.5 & VOC Sensor)
* `robot_vacuum` (Roborock Dock/Vacuum Control)
* `solar_grid` (Solar Panel Generation & Home Load Distribution)

---

### 🏠 Core User Journeys (CUJs)

These prompts can be used with an AI agent connected to this demo via WebMCP:

#### **Front Door Arrival**
> "Someone is at the door. Show me."
* **Trajectory**: Agent detects the arrival intent $\rightarrow$ Calls `rearrangeDOMComponents` with `['camera_front_door', 'lock_front_door']` and a layout message `'Pulling up the front door camera and lock for you'`. 

#### **Climate Adjustment**
> "It is way too hot downstairs. Open the HVAC controls."
* **Trajectory**: Agent detects cooling intent $\rightarrow$ Calls `rearrangeDOMComponents` with `['thermostat_control']` and a layout message `'Opened the HVAC controls for you'`. 

#### **Reset to Default**
> "Reset the dashboard back to normal."
* **Trajectory**: Agent calls `rearrangeDOMComponents` with `['energy_summary','weather_widget','smart_lights_living_room','thermostat_control']` and a layout message `'Resetting the dashboard to your default view'`. 
