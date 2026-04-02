# CineFlow | WebMCP Imperative Demo

🚀 Live Demo: https://googlechromelabs.github.io/webmcp-tools/demos/ticket-booking

This project demonstrates a **WebMCP** implementation for a movie ticket purchase flow. It allows an AI agent to browse movies, filter by genre, update the user's location, and select showtimes to initiate the checkout process.

## 🛠️ How It Works

This demo uses the `navigator.modelContext.registerTool` API in `script.js` to expose movie catalog interactions and booking capabilities to an AI agent.

```javascript
navigator.modelContext.registerTool({
  name: 'select_showtime',
  description: 'Selects a movie and a specific showtime to initiate the checkout process.',
  inputSchema: {
    type: 'object',
    properties: {
      movie_id: {
        type: 'string',
        description: 'The ID of the movie to select.',
      },
      date: {
        type: 'string',
        description: "The date of the show in YYYY-MM-DD format (e.g., '2026-03-31').",
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      time: {
        type: 'string',
        description: "The start time of the show in 12-hour format with AM/PM (e.g., '8:30 PM').",
        pattern: '^[1-12]:[0-5][0-9] (AM|PM)$',
      },
    },
    required: ['movie_id', 'date', 'time'],
  },
  execute: ({ movie_id, date, time }) => {
    // Logic to show movie details and initiate checkout
    return {
      status: 'success',
      message: `Selected showtime ${time} on ${date} for "${movie.title}" movie.`,
    };
  },
});
```

When an AI agent is active, it can:
- **Update Location**: Set the user's city (e.g., London, Paris, New York) to filter movies available in that area.
- **Query Content**: Filter the movie catalog by specific genres such as "horror", "action", "comedy", etc.
- **Select Showtime**: Choose a specific movie and its available showtime and date to automatically navigate to the checkout section.

## ✨ Features

- **Real-time Filtering**: The movie grid updates dynamically based on the selected location and genre.
- **URL-based State**: Location and genre are synchronized with URL search parameters, while movie details use hash navigation.
- **Toast Notifications**: Provides immediate feedback to the user when actions are performed by the AI agent.
