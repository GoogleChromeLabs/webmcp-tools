// Register WebMCP Tools natively
const modelContext = navigator.modelContext;
if (modelContext) {
  modelContext.registerTool({
    name: "apply_smart_filters",
    description: "Filters the real estate properties displayed on the map and list based on criteria like location, price, property type, area, bedrooms, and specific features.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city to search in (e.g., 'Seattle', 'Austin', 'Miami')."
        },
        types: {
          type: "array",
          items: { type: "string" },
          description: "Property types to include (e.g., 'Apartment', 'House', 'Studio', 'Condominium', 'Townhouse')."
        },
        min_price: {
          type: "number",
          description: "Minimum price in USD ($)."
        },
        max_price: {
          type: "number",
          description: "Maximum price in USD ($)."
        },
        min_area: {
          type: "number",
          description: "Minimum living area in sq ft."
        },
        min_bedrooms: {
          type: "number",
          description: "Minimum number of bedrooms."
        },
        features: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Hardwood Floors", "Fireplace", "High Ceilings", "Walk-in Closets", "Smart Home System", "In-unit Washer/Dryer", "Dishwasher", "Finished Basement", "Home Office", "Newly Renovated", "Floor-to-Ceiling Windows", "Furnished",
              "Elevator", "Doorman", "Fitness Center", "Swimming Pool", "Spa & Sauna", "Rooftop Deck", "Concierge Service", "Co-working Space", "Secure Package Room", "Pet Friendly", "Bike Storage",
              "Balcony", "Private Terrace", "Fenced Yard", "City View", "Water View", "Central AC", "Solar Panels", "EV Charging Station", "Garage Parking", "Wheelchair Accessible"
            ]
          },
          description: "Must-have amenities/features (e.g. 'Rooftop Deck', 'Central AC', 'Walk-in Closets')."
        }
      }
    },
    execute: (params) => {
      try {
        // Update Location
        if (params.location) {
          const l = params.location.toLowerCase();
          let centerCoords;

          if (l.includes('austin')) {
            window.realEstateApp.currentCity = 'Austin';
            centerCoords = { lat: 30.2672, lng: -97.7431 };
          } else if (l.includes('miami')) {
            window.realEstateApp.currentCity = 'Miami';
            centerCoords = { lat: 25.7617, lng: -80.1918 };
          } else if (l.includes('seattle')) {
            window.realEstateApp.currentCity = 'Seattle';
            centerCoords = { lat: 47.6062, lng: -122.3321 };
          } else {
            return `Error: Location '${params.location}' is not available.`;
          }

          window.realEstateApp.map.panTo(centerCoords);
          window.realEstateApp.map.setZoom(12);
        }

        // Update Types
        if (params.types) {
          document.querySelectorAll('.type-filter').forEach(el => {
            el.checked = params.types.includes(el.value);
          });
        }

        // Update Price
        const slider = document.getElementById('price-slider');
        if (slider && slider.noUiSlider) {
          let minP = params.min_price !== undefined ? params.min_price : 0;
          let maxP = params.max_price !== undefined ? params.max_price : 5000000;
          slider.noUiSlider.set([minP, maxP]);
        }

        // Update Area
        if (params.min_area !== undefined) {
          document.getElementById('filter-minArea').value = params.min_area;
        }

        // Update Bedrooms
        if (params.min_bedrooms !== undefined) {
          let val = params.min_bedrooms.toString();
          if (val > 4) val = '4'; // Max is 4+
          document.querySelectorAll('input[name="minBedrooms"]').forEach(el => {
            el.checked = (el.value === val);
          });
        }

        // Update Features
        if (params.features) {
          document.querySelectorAll('.feature-filter').forEach(el => {
            el.checked = params.features.includes(el.value);
          });
        }

        // Apply filters
        window.realEstateApp.applyFilters();
        window.realEstateApp.updatePriceDisplay();

        const visibleCount = window.realEstateApp.markers.filter(m => m.getVisible() !== false).length;
        window.realEstateApp.showAlert(`Filters applied. ${visibleCount} properties found.`);

        return `Filters successfully applied. Found ${visibleCount} properties matching the criteria.`;
      } catch (error) {
        return `Error applying filters: ${error.message}`;
      }
    }
  });

  modelContext.registerTool({
    name: "clear_filters",
    description: "Resets all filters to their default states and shows all available properties.",
    execute: () => {
      window.realEstateApp.clearFilters();
      return "Successfully cleared all filters. All available properties are now shown.";
    }
  });

  modelContext.registerTool({
    name: "view_property_details",
    description: "Focuses the map on a specific property by ID and opens its details window.",
    inputSchema: {
      type: "object",
      properties: {
        property_id: {
          type: "integer",
          description: "The ID of the property to view."
        }
      },
      required: ["property_id"]
    },
    execute: (params) => {
      const marker = window.realEstateApp.markers.find(m => m.propertyData.id === params.property_id);
      if (!marker) {
        return `Error: Property with ID ${params.property_id} not found.`;
      }
      window.realEstateApp.panToProperty(marker.propertyData.lat, marker.propertyData.lng);

      // Trigger click to open info window
      if (google && google.maps && google.maps.event) {
        google.maps.event.trigger(marker, 'click');
      }

      window.realEstateApp.showAlert(`Viewing details for property ${params.property_id}`);
      return `Successfully zoomed to and opened details for property ID ${params.property_id} (${marker.propertyData.title}).`;
    }
  });
} else {
  console.warn("navigator.modelContext is not defined. Using WebMCP shim for testing.");
  // Expose a testing shim just in case we are in devtools without proper capability
  window.navigator.modelContextTesting = {
    registerTool: (t) => {
      window.registeredWebMcpTools = window.registeredWebMcpTools || [];
      window.registeredWebMcpTools.push(t);
    }
  };
}

