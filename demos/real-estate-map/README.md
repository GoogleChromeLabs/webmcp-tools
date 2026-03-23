# UrbanEstates | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/real-estate-map

This project demonstrates a **WebMCP** implementation for an interactive real-estate map application. It allows an AI agent to interact directly with property filters, panning the map, and retrieving property details by registering custom imperative tools.

![UrbanEstates Screenshot Placeholder](screenshot-placeholder.png)

## 🛠️ How It Works

Unlike declarative forms, this demo uses the `navigator.modelContext.registerTool` API in `mcp.js` to expose fine-grained control over the map and filtering state to an AI agent.

```javascript
navigator.modelContext.registerTool({
  name: 'apply_smart_filters',
  description: 'Apply filters to the property listings (e.g., min price, max price, min area, property type, bedrooms, specific features)',
  inputSchema: {
    // ... JSON schema definition
  },
  execute: (params) => {
    // ... logic to update UI state and filter the mock data
    return `Filters successfully applied.`;
  }
});
```

When an AI agent is active, it can:
- **Filter Properties**: Apply filters based on price, area, property type, bedrooms, and specific features like Central AC, Balcony, or Parking.
- **Retrieve Context**: Extract active property data and list constraints.
- **Navigate the Feedback Loop**: Update the page filters visually so the end user can see what the agent is currently doing.

## 🚀 How to Run

1. Clone the repository and navigate to the `demos/real-estate-map` directory.
2. Ensure you have a valid **Google Maps API Key** to render the interactive map properly.
   - When you load the map, you will be prompted to enter your API key directly in the UI. It will be saved securely to your browser's `localStorage` so you don't have to enter it again.
   - **For GitHub Pages or Public Deployment:** Do not hardcode an unrestricted key! If you want your users to see the map without entering their own key, create a dedicated API key in the Google Cloud Console and add an **HTTP Referrers** restriction (e.g., `*username.github.io/webmcp-tools/*`). You can then manually modify `map.html` to hardcode the restricted key if desired.
3. Start a local HTTP server in this directory. For example, using Python or Node.js:
   ```bash
   # Python
   python3 -m http.server 8080
   
   # Or using http-server
   npx http-server -p 8080
   ```
4. Open your browser and navigate to `http://localhost:8080/index.html` to start from the landing page.
5. Use the search bar to search for a location (e.g., "Seattle").
6. The map will pan to the location and display properties.
7. Use the filters manually to filter the properties.
8. Via WebMCP (e.g. the extension), you can also filter the properties by using the `apply_smart_filters` tool. Prompt to try: "Search for flats with at least 2 bedrooms and a balcony, max price 9000"
9. The UI updates dynamically and seamlessly syncs with based on tool calls.
