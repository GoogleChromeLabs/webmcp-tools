/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useWebMCP } from 'use-webmcp-tool';
import { AVAILABLE_COMPONENT_IDS } from './initialData';

export function useWebMCPTools({
  playlistTracks,
  guestMessages,
  setDashboardComponents,
  triggerAgentActivity,
  setIsFrontDoorLocked,
  setLastLockStatusText,
  setLivingRoomLightsState,
  ensureMediaAndLightsVisible,
  ensureLockWidgetVisible,
  ensureDashboardVisible,
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
      untrustedContentHint: useUntrustedContentHint ? Boolean(untrustedContentHint) : false,
      consequentialHint: useConsequentialHint ? Boolean(consequentialHint) : false,
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
      triggerAgentActivity(1500);
      return playlistTracks.map((t, idx) => ({
        position: idx + 1,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
      }));
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
      triggerAgentActivity(2000);
      const { nextPower, nextBrightness } = setLivingRoomLightsState(
        input.power,
        input.brightness
      );
      ensureMediaAndLightsVisible();

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
          items: {
            type: 'string',
            enum: AVAILABLE_COMPONENT_IDS,
          },
          description:
            "Array of component IDs to display on the dashboard.",
        },
      },
      required: ['componentIds'],
    },
    annotations: getToolAnnotations({
      consequentialHint: false,
    }),
    execute: async (input) => {
      triggerAgentActivity(2000);
      const uniqueIds = Array.isArray(input?.componentIds)
        ? [...new Set(input.componentIds)]
        : [];
      setDashboardComponents(uniqueIds);
      ensureDashboardVisible();

      return 'Dashboard successfully updated with requested components.';
    },
  });

  useWebMCP({
    name: 'lockFrontDoor',
    description: 'Locks the smart home front door lock to secure the house.',
    annotations: getToolAnnotations({
      consequentialHint: false,
    }),
    execute: async () => {
      triggerAgentActivity(2000);
      setIsFrontDoorLocked(true);
      setLastLockStatusText('Locked • Just now');
      ensureLockWidgetVisible();

      return 'Front door locked successfully.';
    },
  });

  useWebMCP({
    name: 'unlockFrontDoor',
    description:
      'Unlocks the smart home front door lock. Grants physical access to the home.',
    annotations: getToolAnnotations({
      consequentialHint: true,
    }),
    execute: async () => {
      triggerAgentActivity(2000);
      setIsFrontDoorLocked(false);
      setLastLockStatusText('Unlocked • Just now');
      ensureLockWidgetVisible();

      return 'Front door unlocked successfully.';
    },
  });

  useWebMCP({
    name: 'getGuestMessages',
    description:
      'Reads visitor and guest sticky notes left on the smart home digital message board.',
    annotations: getToolAnnotations({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    }),
    execute: async () => {
      triggerAgentActivity(1500);
      return guestMessages.map(({ author, timestamp, text }) => ({
        author,
        timestamp,
        text,
      }));
    },
  });
}
