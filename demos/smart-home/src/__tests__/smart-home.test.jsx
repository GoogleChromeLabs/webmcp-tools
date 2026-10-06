/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { COMPONENT_MAP } from '../components/SmartComponents';
import {
  AVAILABLE_COMPONENT_IDS,
  INITIAL_DASHBOARD_COMPONENTS,
  INITIAL_GUEST_MESSAGES,
  INITIAL_PLAYLIST_TRACKS,
  POISONED_GUEST_MESSAGE,
  POISONED_PLAYLIST_TRACK,
} from '../context/initialData';

// Enable React act() environment for clean state updates in JSDOM
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXPECTED_TOOLS = [
  'getPlaylistQueue',
  'setLivingRoomLights',
  'rearrangeDOMComponents',
  'lockFrontDoor',
  'unlockFrontDoor',
  'getGuestMessages',
];

describe('WebMCP Smart Home Security Playground', () => {
  let container;
  let root;
  let registeredTools;
  let registerToolSpy;

  beforeEach(async () => {
    window.location.hash = '#/';
    document.body.className = '';
    registeredTools = new Map();

    registerToolSpy = vi.fn((toolDef, options) => {
      registeredTools.set(toolDef.name, { ...toolDef, options });
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          const current = registeredTools.get(toolDef.name);
          if (current && current.options === options) {
            registeredTools.delete(toolDef.name);
          }
        });
      }
    });

    Object.defineProperty(document, 'modelContext', {
      value: { registerTool: registerToolSpy },
      configurable: true,
      writable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  async function callTool(name, args = {}) {
    const tool = registeredTools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered`);
    }
    let response;
    await act(async () => {
      response = await tool.execute(args);
    });
    return response;
  }

  function getToolText(response) {
    return response?.content?.[0]?.text ?? '';
  }

  async function clickElement(el) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  describe('tool registration & schemas', () => {
    it('registers all 6 WebMCP tools with valid JSON schemas', () => {
      expect([...registeredTools.keys()].sort()).toEqual([...EXPECTED_TOOLS].sort());

      for (const name of EXPECTED_TOOLS) {
        const tool = registeredTools.get(name);
        expect(tool).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
        expect(tool.inputSchema.type).toBe('object');
        expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
      }
    });

    it('keeps AVAILABLE_COMPONENT_IDS in sync with COMPONENT_MAP and rearrangeDOMComponents schema', () => {
      expect(AVAILABLE_COMPONENT_IDS).toEqual(Object.keys(COMPONENT_MAP));
      const rearrangeTool = registeredTools.get('rearrangeDOMComponents');
      expect(rearrangeTool.inputSchema.properties.componentIds.items.enum).toEqual(
        AVAILABLE_COMPONENT_IDS
      );
    });

    it('registers default security annotations when all developer hints are enabled', () => {
      expect(registeredTools.get('getPlaylistQueue').annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: true,
        consequentialHint: false,
      });
      expect(registeredTools.get('getGuestMessages').annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: true,
        consequentialHint: false,
      });
      expect(registeredTools.get('unlockFrontDoor').annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
        consequentialHint: true,
      });
      expect(registeredTools.get('lockFrontDoor').annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
        consequentialHint: false,
      });
      expect(registeredTools.get('setLivingRoomLights').annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
        consequentialHint: false,
      });
      expect(registeredTools.get('rearrangeDOMComponents').annotations).toEqual({
        readOnlyHint: false,
        untrustedContentHint: false,
        consequentialHint: false,
      });
    });

    it('dynamically aborts and re-registers tools when developer hint checkboxes are toggled', async () => {
      const bannerToggle = container.querySelector('.dev-controls-header');
      await clickElement(bannerToggle);

      const checkboxes = Array.from(
        container.querySelectorAll('.dev-checkbox-item input[type="checkbox"]')
      );
      expect(checkboxes).toHaveLength(6);

      const [readOnlyBox, consequentialBox, untrustedBox] = checkboxes;

      // Toggle readOnlyHint OFF
      await clickElement(readOnlyBox);
      expect(registeredTools.get('getPlaylistQueue').annotations.readOnlyHint).toBe(false);
      expect(registeredTools.get('getGuestMessages').annotations.readOnlyHint).toBe(false);

      // Toggle consequentialHint OFF
      await clickElement(consequentialBox);
      expect(registeredTools.get('unlockFrontDoor').annotations.consequentialHint).toBe(false);

      // Toggle untrustedContentHint OFF
      await clickElement(untrustedBox);
      expect(registeredTools.get('getPlaylistQueue').annotations.untrustedContentHint).toBe(false);
      expect(registeredTools.get('getGuestMessages').annotations.untrustedContentHint).toBe(false);
    });
  });

  describe('prompt injection & inline developer info controls', () => {
    it('includes poisoned playlist track and guestbook note by default and filters them when unchecked', async () => {
      // 1. Default: poisoned entries are included
      const playlistRes1 = JSON.parse(getToolText(await callTool('getPlaylistQueue')));
      expect(playlistRes1).toHaveLength(INITIAL_PLAYLIST_TRACKS.length);
      expect(playlistRes1.some((t) => t.artist === POISONED_PLAYLIST_TRACK.artist)).toBe(true);

      const guestRes1 = JSON.parse(getToolText(await callTool('getGuestMessages')));
      expect(guestRes1).toHaveLength(INITIAL_GUEST_MESSAGES.length);
      expect(guestRes1.some((m) => m.text === POISONED_GUEST_MESSAGE.text)).toBe(true);

      // Expand Developer Controls banner and uncheck both injection toggles
      await clickElement(container.querySelector('.dev-controls-header'));
      const checkboxes = Array.from(
        container.querySelectorAll('.dev-checkbox-item input[type="checkbox"]')
      );
      const [, , , playlistInjectionBox, guestbookInjectionBox, inlineDevInfoBox] = checkboxes;

      await clickElement(playlistInjectionBox);
      const playlistRes2 = JSON.parse(getToolText(await callTool('getPlaylistQueue')));
      expect(playlistRes2).toHaveLength(INITIAL_PLAYLIST_TRACKS.length - 1);
      expect(playlistRes2.some((t) => t.artist === POISONED_PLAYLIST_TRACK.artist)).toBe(false);

      await clickElement(guestbookInjectionBox);
      const guestRes2 = JSON.parse(getToolText(await callTool('getGuestMessages')));
      expect(guestRes2).toHaveLength(INITIAL_GUEST_MESSAGES.length - 1);
      expect(guestRes2.some((m) => m.text === POISONED_GUEST_MESSAGE.text)).toBe(false);

      // Toggle inline dev info badge visibility
      expect(document.body.classList.contains('hide-dev-inline-info')).toBe(false);
      await clickElement(inlineDevInfoBox);
      expect(document.body.classList.contains('hide-dev-inline-info')).toBe(true);
    });
  });

  describe('setLivingRoomLights tool & widget consistency', () => {
    it('turns lights ON/OFF and normalizes contradictory power/brightness inputs', async () => {
      const lightsCard = () => container.querySelector('.lights-card');
      expect(lightsCard().textContent).toContain('OFF');
      expect(lightsCard().textContent).toContain('0%');

      // Turn ON with default brightness (80%)
      const onRes = getToolText(await callTool('setLivingRoomLights', { power: 'on' }));
      expect(onRes).toBe('Living room lights set to ON (80% brightness).');
      expect(lightsCard().textContent).toContain('ON');
      expect(lightsCard().textContent).toContain('80%');

      // Turn OFF even when a non-zero brightness is passed in input
      const offWithBrightness = getToolText(
        await callTool('setLivingRoomLights', { power: 'off', brightness: 80 })
      );
      expect(offWithBrightness).toBe('Living room lights set to OFF (0% brightness).');
      expect(lightsCard().textContent).toContain('OFF');
      expect(lightsCard().textContent).toContain('0%');

      // Passing power: 'on' with brightness: 0 normalizes to OFF (0%)
      const onWithZero = getToolText(
        await callTool('setLivingRoomLights', { power: 'on', brightness: 0 })
      );
      expect(onWithZero).toBe('Living room lights set to OFF (0% brightness).');
      expect(lightsCard().textContent).toContain('OFF');

      // Clamps out-of-range brightness > 100
      const clampedRes = getToolText(
        await callTool('setLivingRoomLights', { power: 'on', brightness: 150 })
      );
      expect(clampedRes).toBe('Living room lights set to ON (100% brightness).');
      expect(lightsCard().textContent).toContain('100%');
    });
  });

  describe('lockFrontDoor & unlockFrontDoor tools and subpage visibility', () => {
    it('locks and unlocks the front door and navigates from /guestbook so the lock widget is visible', async () => {
      // Navigate to Guest Board (/guestbook) as in README CUJ #2
      const guestbookLink = Array.from(container.querySelectorAll('nav a')).find((a) =>
        a.textContent.includes('Guest Board')
      );
      await clickElement(guestbookLink);
      expect(window.location.hash).toBe('#/guestbook');
      expect(container.querySelector('.guestbook-card')).not.toBeNull();

      // Trigger unlockFrontDoor while on /guestbook
      const unlockRes = getToolText(await callTool('unlockFrontDoor'));
      expect(unlockRes).toBe('Front door unlocked successfully.');

      // Should navigate back to Dashboard ('#/') with both Front Door Lock (UNLOCKED) and Guest Message Board visible
      expect(window.location.hash).toBe('#/');
      expect(container.textContent).toContain('UNLOCKED');
      expect(container.textContent).toContain('Unlocked • Just now');
      expect(container.querySelector('.guestbook-card')).not.toBeNull();

      // Lock the door again
      const lockRes = getToolText(await callTool('lockFrontDoor'));
      expect(lockRes).toBe('Front door locked successfully.');
      expect(container.textContent).toContain('LOCKED');
      expect(container.textContent).toContain('Locked • Just now');
    });
  });

  describe('rearrangeDOMComponents orchestrator', () => {
    it('renders initial widgets, deduplicates componentIds, and navigates to Dashboard from subpages', async () => {
      expect(INITIAL_DASHBOARD_COMPONENTS).toEqual([
        'lock_front_door',
        'smart_lights_living_room',
        'media_player_living_room',
      ]);

      // Navigate to Climate subpage first
      const climateLink = Array.from(container.querySelectorAll('nav a')).find((a) =>
        a.textContent.includes('Climate')
      );
      await clickElement(climateLink);
      expect(window.location.hash).toBe('#/climate');

      // Call rearrangeDOMComponents with duplicate IDs
      const res = getToolText(
        await callTool('rearrangeDOMComponents', {
          componentIds: ['camera_front_door', 'thermostat_control', 'camera_front_door'],
        })
      );
      expect(res).toBe('Dashboard successfully updated with requested components.');
      expect(window.location.hash).toBe('#/');

      const cameraCards = container.querySelectorAll('.camera-card');
      expect(cameraCards).toHaveLength(1);
      expect(container.textContent).toContain('HVAC • Downstairs');
    });
  });

  describe('AgentStatusToast overlapping timer behavior', () => {
    it('keeps the agent status toast visible across overlapping chained tool calls', async () => {
      vi.useFakeTimers();

      expect(container.querySelector('[role="status"]')).toBeNull();

      // t = 0ms: First tool call (getPlaylistQueue, 1500ms duration)
      await callTool('getPlaylistQueue');
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'Agent is working...'
      );

      // Advance to t = 1200ms and invoke second tool (setLivingRoomLights, 2000ms duration)
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      await callTool('setLivingRoomLights', { power: 'off' });

      // Advance 400ms to t = 1600ms (past the first tool's 1500ms timeout): toast MUST still be active
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'Agent is working...'
      );

      // Advance remaining 1600ms to t = 3200ms: second tool timer finishes
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
      // Wait for AnimatePresence exit
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(container.querySelector('[role="status"]')).toBeNull();
    });
  });
});
