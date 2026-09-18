import type { Flight } from "./data/flights";
import { saveTicket } from "./data/ticketService.ts";

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

let currentFlights: Flight[] = [];

export function setCurrentFlights(flights: Flight[]): void {
  currentFlights = flights;
}

export function listFlights(): Array<Flight> {
  return currentFlights;
}

export const listFlightsTool = {
  execute: listFlights,
  name: "listFlights",
  description: "Returns the flights currently visible on the results page after all filters have been applied.",
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
    readOnlyHint: true,
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
    readOnlyHint: false,
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
    readOnlyHint: false,
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

export async function searchFlights(p: unknown): Promise<string> {
  const params = p as SearchFlights;
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
        type: "string",
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
    readOnlyHint: false,
  },
};

export type FileSupportTicketParams = {
  title: string;
  body: string;
  agentName: string;
};

export async function fileSupportTicket(
  p: unknown,
): Promise<{ success: boolean; ticketId: string; message: string }> {
  const params = (p || {}) as Partial<FileSupportTicketParams> & {
    agent_name?: string;
  };

  if (!params.title || typeof params.title !== "string" || !params.title.trim()) {
    throw new Error("ERROR: 'title' is required and must be a non-empty string.");
  }

  if (!params.body || typeof params.body !== "string" || !params.body.trim()) {
    throw new Error("ERROR: 'body' is required and must be a non-empty string.");
  }

  const agentName = params.agentName || params.agent_name;
  if (!agentName || typeof agentName !== "string" || !agentName.trim()) {
    throw new Error(
      "ERROR: 'agentName' is required and must be a non-empty string.",
    );
  }

  const ticket = saveTicket({
    title: params.title.trim(),
    body: params.body.trim(),
    agentName: agentName.trim(),
    currentData: {
      ...(currentFlights.length > 0
        ? { visibleFlightsCount: currentFlights.length }
        : {}),
    },
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("supportTicketCreated", {
        detail: { ticket },
      }),
    );
  }

  return {
    success: true,
    ticketId: ticket.id,
    message: `Support ticket '${ticket.title}' successfully filed with ID ${ticket.id}.`,
  };
}

export const fileSupportTicketTool = {
  execute: fileSupportTicket,
  name: "fileSupportTicket",
  description:
    "Allows the AI agent to file a support ticket or bug report in the background. Use this tool when unable to find tools needed to complete a task that would be appropriate for the product to have, or when existing tools exhibit unexpected behavior that can cause the agent to fail. The bug report must include a title, body, and agent name. The body should contain as much detail as possible on the interaction between the user, agent, and the site to allow a developer to reproduce, but MUST have any sensitive or PII data cleaned up. Prioritize privacy/sensitive information preservation over completeness.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "A descriptive title summarizing the missing tool, feature request, or unexpected tool behavior.",
      },
      body: {
        type: "string",
        description:
          "Detailed reproduction steps and context about the interaction between the user, agent, and site. Any sensitive or PII data MUST be redacted/cleaned up. Prioritize privacy over completeness.",
      },
      agentName: {
        type: "string",
        description:
          "The name or identifier of the AI agent submitting the support ticket.",
      },
    },
    required: ["title", "body", "agentName"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "Whether the support ticket was successfully recorded.",
      },
      ticketId: {
        type: "string",
        description: "The unique ID assigned to the ticket.",
      },
      message: {
        type: "string",
        description: "Confirmation status message.",
      },
    },
    required: ["success", "ticketId", "message"],
  },
  annotations: {
    readOnlyHint: false,
  },
};

