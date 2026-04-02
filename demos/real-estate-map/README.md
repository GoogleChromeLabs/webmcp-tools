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
   - To use the map, you **must** provide your API key via the `key` query parameter. Example: `http://localhost:8080/map.html?key=YOUR_API_KEY`, or `http://localhost:8080/map.html?key=YOUR_API_KEY&?location=Seattle`
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
8. Via WebMCP (e.g. the extension), you can command an AI agent to execute tasks natively on your behalf.

## 🤖 Prompting the Agent

Once you have a valid WebMCP client connected to the page, try these natural language prompts to see the agent interact with the map dynamically:

### Search

Try a simple search to start, or a multi-step query:
- *"Find me an apartment in Austin"*
- Followed by: *"Filter for those with AC and under $1,000,000."*

### Search & Filtering (`apply_smart_filters`)
Try these elaborate searches—our 63-property mock dataset guarantees you'll find intersecting results:
- *"Find me a pet-friendly apartment in Austin with Central AC and under $1,000,000."*
- *"Show me houses in Miami with a Swimming Pool and Garage Parking, ideally 3+ bedrooms."*
- *"Look for luxury condos in Seattle with a Rooftop Deck and a Water View, max price $2.5M."*

### Property Details (`view_property_details`)
Once you have results on the screen, ask the agent to inspect a specific property card:
- *"Open the details for property ID 12."*
- *"Show me more information about the first listing in the sidebar."*

### Resetting State (`clear_filters`)
Whenever you want to start over, simply tell the agent:
- *"Reset all my search filters."*
- *"Clear the current map filters and show me everything available."*