# Travel WebMCP Demo

A React-based flight search application designed to demonstrate **WebMCP** integration. This project showcases how a web application can expose structured tools to an AI agent or automation layer, allowing it to programmatically interact with the UI (searching flights, applying filters, reading results) via a standardized interface.

## 🚀 Key Features

- **Flight Search**: Search for flights by origin, destination, dates, and passengers.
- **Interactive Results**: View flight results with detailed pricing and duration information.
- **Advanced Filtering**: Filter results by price range, airlines, stops, and departure/arrival times.
- **WebMCP Integration**: Built-in support for `navigator.modelContext` to register tools for AI agents.

## 🛠️ Technology Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [React Router](https://reactrouter.com/)
- **Styling**: CSS Modules / Vanilla CSS
- **Components**: Custom components + `rc-slider` for range inputs

## 🤖 Agent / WebMCP Integration

This application is instrumented to work with an AI agent (e.g., via a browser extension or specialized browser). It detects the presence of `navigator.modelContext` and registers the following tools:

1.  **`searchFlights`**: Initiates a flight search with structured parameters (origin, destination, date, etc.).
2.  **`listFlights`**: Retrieves the currently displayed list of flights (programmatic access to data).
3.  **`setFilters`**: Applies complex filters (price ranges, specific airlines, time windows) to the results.
4.  **`resetFilters`**: Clears all active filters.

### How it Works

The application defines a schema for each tool (input/output) and "registers" them using `modelContext.registerTool()`. When the agent invokes a tool, the application executes the corresponding function (e.g., dispatching a custom event to update the React state), bridging the gap between the AI model and the React UI.

See [`src/webmcp.ts`](src/webmcp.ts) for the implementation details.

## 📦 Installation & Usage

1.  **Clone the repository**

    ```bash
    git clone <repository-url>
    cd travel-script-tools-demo
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Run the development server**

    ```bash
    npm run dev
    ```

    The app will start at `http://localhost:5173` (or similar).

4.  **Build for production**
    ```bash
    npm run build
    ```
