/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useWebMCP } from 'use-webmcp-tool';

export function useWebMCPTools({
  playlistTracks,
  guestMessages,
  setDashboardComponents,
  setIsAgentActive,
  setIsFrontDoorLocked,
  setLastLockStatusText,
  setLivingRoomLightsState,
  ensureMediaAndLightsVisible,
  ensureLockWidgetVisible,
  useReadOnlyHint,
  useConsequentialHint,
  useUntrustedContentHint,
}) {
  // Flexible helper for website security controls
  const getToolAnnotations = ({
    readOnlyHint = false,
    untrustedContentHint = false,
    consequentialHint = false,
  }) => {
    return {
      readOnlyHint: useReadOnlyHint ? Boolean(readOnlyHint) : false,
      untrustedContentHint: useUntrustedContentHint ? untrustedContentHint : false,
      consequentialHint: useConsequentialHint ? consequentialHint : false,
    };
  };

  useWebMCP({
    name: 'getPlaylistQueue',
    description:
      'Returns the list of songs and artist metadata currently queued in the Living Room Soniq collaborative party playlist.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: getToolAnnotations({
      readOnlyHint: true,
      untrustedContentHint: true,
    }),
    execute: async () => {
      setIsAgentActive(true);
      setTimeout(() => setIsAgentActive(false), 1500);
      return JSON.stringify(
        playlistTracks.map((t, idx) => ({
          position: idx + 1,
          title: t.title,
          artist: t.artist,
          duration: t.duration,
        })),
        null,
        2
      );
    },
  });

  useWebMCP({
    name: 'setLivingRoomLights',
    description:
      'Turns the living room smart lights ON or OFF and adjusts their brightness percentage (0 to 100).',
    inputSchema: {
      type: 'object',
      properties: {
        power: {
          type: 'string',
          enum: ['on', 'off'],
          description: "Whether to turn the lights 'on' or 'off'.",
        },
        brightness: {
          type: 'number',
          description: 'Brightness level from 0 (blackout) to 100 (maximum brightness).',
        },
      },
      required: ['power'],
    },
    annotations: getToolAnnotations({
      consequentialHint: false,
    }),
    execute: async (input) => {
      setIsAgentActive(true);
      const { nextPower, nextBrightness } = setLivingRoomLightsState(
        input.power,
        input.brightness
      );
      ensureMediaAndLightsVisible();

      setTimeout(() => setIsAgentActive(false), 2000);
      return `Living room lights set to ${nextPower.toUpperCase()} (${nextBrightness}% brightness).`;
    },
  });

  useWebMCP({
    name: 'rearrangeDOMComponents',
    description:
      "Rearranges the user's home dashboard by adding, removing, or reordering smart home control components based on the user's intent.",
    inputSchema: {
      type: 'object',
      properties: {
        componentIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Array of component IDs to display on the dashboard. Examples: 'thermostat_control', 'camera_front_door', 'lock_front_door', 'guest_message_board', 'smart_lights_living_room', 'energy_summary', 'weather_widget', 'media_player_living_room', 'alarm_panel', 'air_quality_sensor', 'solar_grid'",
        },
      },
      required: ['componentIds'],
    },
    annotations: getToolAnnotations({
      consequentialHint: false,
    }),
    execute: async (input) => {
      setIsAgentActive(true);
      setDashboardComponents(input.componentIds);

      setTimeout(() => setIsAgentActive(false), 2000);
      return 'Dashboard successfully updated with requested components.';
    },
  });

  useWebMCP({
    name: 'lockFrontDoor',
    description: 'Locks the smart home front door lock to secure the house.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: getToolAnnotations({
      consequentialHint: false,
    }),
    execute: async () => {
      setIsAgentActive(true);
      setIsFrontDoorLocked(true);
      setLastLockStatusText('Locked • Just now');
      ensureLockWidgetVisible();

      setTimeout(() => setIsAgentActive(false), 2000);
      return 'Front door locked successfully.';
    },
  });

  useWebMCP({
    name: 'unlockFrontDoor',
    description:
      'Unlocks the smart home front door lock. Grants physical access to the home.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: getToolAnnotations({
      consequentialHint: true,
    }),
    execute: async () => {
      setIsAgentActive(true);
      setIsFrontDoorLocked(false);
      setLastLockStatusText('Unlocked • Just now');
      ensureLockWidgetVisible();

      setTimeout(() => setIsAgentActive(false), 2000);
      return 'Front door unlocked successfully.';
    },
  });

  useWebMCP({
    name: 'getGuestMessages',
    description:
      'Reads visitor and guest sticky notes left on the smart home digital message board.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: getToolAnnotations({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    }),
    execute: async () => {
      setIsAgentActive(true);
      setTimeout(() => setIsAgentActive(false), 1500);
      return JSON.stringify(
        guestMessages.map(({ author, timestamp, text }) => ({
          author,
          timestamp,
          text,
        })),
        null,
        2
      );
    },
  });
}
