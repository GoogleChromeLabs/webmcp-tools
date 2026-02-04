import { flights, type Flight } from "./data/flights";

declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (tool: object) => void;
      unregisterTool: (name: string) => void;
    };
  }
}

const registeredTools = {
  listFlights: false,
  setFilters: false,
  resetFilters: false,
  searchFlights: false,
};

function dispatchAndWait(
    eventName: string,
    detail: Record<string, unknown> = {},
    successMessage: string = "Action completed successfully",
    timeoutMs: number = 5000,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(2, 15);
        const completionEventName = `tool-completion-${requestId}`;

        const timeoutId = setTimeout(() => {
            window.removeEventListener(completionEventName, handleCompletion);
            reject(new Error(`Timed out waiting for UI to update (requestId: ${requestId})`));
        }, timeoutMs);

        const handleCompletion = () => {
            clearTimeout(timeoutId);
            window.removeEventListener(completionEventName, handleCompletion);
            resolve(successMessage);
        };

        window.addEventListener(completionEventName, handleCompletion);

        // Dispatch original event with requestId
        const event = new CustomEvent(eventName, {
            detail: { ...detail, requestId }
        });
        window.dispatchEvent(event);
    });
}

export function listFlights(): Array<Flight> {
  return flights;
}

export const listFlightsTool = {
  execute: listFlights,
  name: "listFlights",
  description: "Returns all flights available.",
  inputSchema: {},
  outputSchema: {
    type: "object",
    properties: {
      result: {
        type: "array",
        description: "The list of flights.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "The unique identifier for the flight.",
            },
            airline: {
              type: "string",
              description: "The airline of the flight.",
            },
            origin: { type: "string", description: "The origin airport." },
            destination: {
              type: "string",
              description: "The destination airport.",
            },
            departureTime: {
              type: "string",
              description: "The departure time.",
            },
            arrivalTime: { type: "string", description: "The arrival time." },
            duration: {
              type: "string",
              description: "The duration of the flight.",
            },
            stops: { type: "number", description: "The number of stops." },
            price: { type: "number", description: "The price of the flight." },
          },
          required: [
            "id",
            "airline",
            "origin",
            "destination",
            "departureTime",
            "arrivalTime",
            "duration",
            "stops",
            "price",
          ],
        },
      },
    },
    required: ["result"],
  },
  annotations: {
    readOnlyHint: "true",
  },
};

export type Filters = {
  stops?: number[];
  airlines?: string[];
  origins?: string[];
  destinations?: string[];
  minPrice?: number;
  maxPrice?: number;
  departureTime?: number[];
  arrivalTime?: number[];
  flightIds?: number[];
};

export async function setFilters(filters: Filters): Promise<string> {
    return dispatchAndWait("setFilters", filters, "Filters successfully updated.");
}

export const setFiltersTool = {
  execute: setFilters,
  name: "setFilters",
  description: "Sets the filters for flights.",
  inputSchema: {
    type: "object",
    properties: {
      stops: {
        type: "array",
        description: "The list of stop counts to filter by.",
        items: {
          type: "number",
        },
      },
      airlines: {
        type: "array",
        description: "The list of airlines IATA codes to filter by.",
        items: {
          type: "string",
          pattern: "^[A-Z]{2}$",
        },
      },
      origins: {
        type: "array",
        description:
          "The list of origin airports to filter by, using the 3 letter IATA code.",
        items: {
          type: "string",
          pattern: "^[A-Z]{3}$",
        },
      },
      destinations: {
        type: "array",
        description:
          "The list of destination airports to filter by, using the 3 letter IATA code.",
        items: {
          type: "string",
          pattern: "^[A-Z]{3}$",
        },
      },
      minPrice: {
        type: "number",
        description: "The minimum price.",
      },
      maxPrice: {
        type: "number",
        description: "The maximum price.",
      },
      departureTime: {
        type: "array",
        description:
          "The departure time range in minutes from the start of the day (0-1439). For example, to filter for flights departing between 9:00 AM and 5:00 PM, you would use `[540, 1020]`.",
        items: {
          type: "number",
        },
      },
      arrivalTime: {
        type: "array",
        description:
          "The arrival time range in minutes from the start of the day (0-1439). For example, to filter for flights arriving between 9:00 AM and 5:00 PM, you would use `[540, 1020]`.",
        items: {
          type: "number",
        },
      },
      flightIds: {
        type: "array",
        description: "The list of flight IDs to filter by.",
        items: {
          type: "number",
        },
      },
    },
  },
  outputSchema: {
    type: "string",
    description:
      "a message describing if the filter update request was successful or not",
  },
  annotations: {
    readOnlyHint: "false",
  },
};

export async function resetFilters(): Promise<string> {
    return dispatchAndWait("resetFilters", {}, "Filters successfully updated.");
}

export const resetFiltersTool = {
  execute: resetFilters,
  name: "resetFilters",
  description: "Resets all filters to their default values.",
  inputSchema: {},
  outputSchema: {
    type: "string",
    description:
      "a message describing if the filter reset request was successful or not",
  },
  annotations: {
    readOnlyHint: "false",
  },
};

export type SearchFlights = {
  origin: string;
  destination: string;
  tripType: string;
  outboundDate: string;
  inboundDate: string;
  passengers: number;
};

export async function searchFlights(params: SearchFlights): Promise<string> {
  if (!params.destination.match(/^[A-Z]{3}$/)) {
    return "ERROR: `destination` must be a 3 letter city or airport IATA code.";
  }

  if (!params.origin.match(/^[A-Z]{3}$/)) {
    return "ERROR: `origin` must be a 3 letter city or airport IATA code.";
  }

    return dispatchAndWait("searchFlights", params, "A new flight search was started.");
}

export const searchFlightsTool = {
  execute: searchFlights,
  name: "searchFlights",
  description: "Searches for flights with the given parameters.",
  inputSchema: {
    type: "object",
    properties: {
      origin: {
        type: "string",
        description:
          "City or airport IATA code for the origin. Prefer city IATA codes when a specific airport is not provided. Example: 'RIO' for 'Rio de Janeiro'",
        pattern: "^[A-Z]{3}$",
        minLength: 3,
        maxLength: 3,
      },
      destination: {
        type: "string",
        description:
          "City or airport IATA code for the destination airport. Prefer city IATA codes when a specific airport is not provided. Example: 'RIO' for 'Rio de Janeiro'",
        pattern: "^[A-Z]{3}$",
        minLength: 3,
        maxLength: 3,
      },
      tripType: {
        enum: ["one-way", "round-trip"],
        description: 'The trip type. Can be "one-way" or "round-trip".',
      },
      outboundDate: {
        type: "string",
        description: "The outbound date in YYYY-MM-DD format.",
        format: "date",
      },
      inboundDate: {
        type: "string",
        description: "The inbound date in YYYY-MM-DD format.",
        format: "date",
      },
      passengers: {
        type: "number",
        description: "The number of passengers.",
      },
    },
    required: [
      "origin",
      "destination",
      "tripType",
      "outboundDate",
      "inboundDate",
      "passengers",
    ],
  },
  outputSchema: {
    type: "string",
    description: "a message describing the result of the flight search request",
  },
  annotations: {
    readOnlyHint: "false",
  },
};

export function registerFlightSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.registerTool(searchFlightsTool);
  }
}

export function unregisterFlightSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.unregisterTool(searchFlightsTool.name);
  }
}

export function registerFlightResultsTools() {
  const modelContext = window.navigator.modelContext;

  if (modelContext) {
    if (!registeredTools.listFlights) {
      modelContext.registerTool(listFlightsTool);
      registeredTools.listFlights = true;
    }

    if (!registeredTools.setFilters) {
      modelContext.registerTool(setFiltersTool);
      registeredTools.setFilters = true;
    }

    if (!registeredTools.resetFilters) {
      modelContext.registerTool(resetFiltersTool);
      registeredTools.resetFilters = true;
    }

    if (!registeredTools.searchFlights) {
      modelContext.registerTool(searchFlightsTool);
      registeredTools.searchFlights = true;
    }
  }
}

export function unregisterFlightResultsTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.unregisterTool(listFlightsTool.name);
    modelContext.unregisterTool(setFiltersTool.name);
    modelContext.unregisterTool(resetFiltersTool.name);
    modelContext.unregisterTool(searchFlightsTool.name);

    registeredTools.listFlights = false;
    registeredTools.setFilters = false;
    registeredTools.resetFilters = false;
    registeredTools.searchFlights = false;
  }
}
