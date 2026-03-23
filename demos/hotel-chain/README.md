# L'Atelier Hotel Chain — WebMCP Demo

A premium, high-fidelity hotel booking application designed to showcase the power of **WebMCP** (Web Model Context Protocol). This demo illustrates how AI agents can interact with a modern web application through both imperative and declarative tools.

## 🌟 Overview

L'Atelier is a luxury hospitality group offering curated stays in Tokyo, Paris, and New York. The application features:

- **Dynamic Search**: Find properties by location with rich, editorial-style results.
- **Amenity Filtering**: Real-time filtering by price and a wide array of luxury amenities (Spa, Rooftop Bar, Late Check-out, etc.).
- **Immersive Details**: High-resolution galleries and persistent policy highlighting.
- **Seamless Booking**: A multi-step booking flow that supports AI-driven automation.

## 🤖 WebMCP Integration

This application exposes several tools to the `navigator.modelContext` API, allowing an AI agent (like a sidepanel assistant) to navigate and perform actions on behalf of the user.

### Imperative Tools

These tools are registered via `navigator.modelContext.registerTool`:

| Tool Name | Description | Parameters |
| :--- | :--- | :--- |
| `search_location` | Navigate to search results for a specific city or area. | `query` (string) |
| `lookup_amenity` | Deep-link to a hotel's detail page and highlight a specific amenity or policy. | `hotel_id` (string), `amenity` (string) |
| `view_hotel` | Navigate directly to a hotel's detail page by name or ID. | `hotel_name_or_id` (string) |
| `search_hotels` | Apply price and amenity filters directly on the Search Results page. | `max_price` (number), `amenities` (string[]) |
| `start_booking` | Initiate the booking process for the currently viewed hotel. | (none) |

### Declarative Tools

The final confirmation step uses a **Declarative Tool**, where the agent can populate and submit a form automatically.

- **Tool Name**: `complete_booking`
- **Description**: Populates guest information (First Name, Last Name, Email) and submits the reservation form.
- **Implementation**: Uses standard HTML form attributes (`toolname`, `tooldescription`) which are automatically detected by WebMCP-enabled browsers.

## 🛠️ Performance & Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: React Hooks + URL Search Params for shareable state.
- **Design System**: Custom premium palette featuring glassmorphism and Material Symbols.

## 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Verify WebMCP**:
   Open the browser console and check `navigator.modelContext`. If you are using a WebMCP-enabled browser or extension, you can see the registered tools.

---
*Note: This is a demo application for the WebMCP standard. All hotel data and payment methods are mocked.*
