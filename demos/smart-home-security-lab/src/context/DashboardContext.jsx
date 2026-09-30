/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { useWebMCPTools } from './useWebMCPTools';
import {
  INITIAL_DASHBOARD_COMPONENTS,
  INITIAL_GUEST_MESSAGES,
  INITIAL_PLAYLIST_TRACKS,
} from './initialData';

export const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  const [dashboardComponents, setDashboardComponents] = useState(
    INITIAL_DASHBOARD_COMPONENTS
  );

  const [isAgentActive, setIsAgentActive] = useState(false);
  const [isFrontDoorLocked, setIsFrontDoorLocked] = useState(true);
  const [lastLockStatusText, setLastLockStatusText] = useState('Locked • 5 mins ago');
  const [useReadOnlyHint, setUseReadOnlyHint] = useState(true);
  const [useConsequentialHint, setUseConsequentialHint] = useState(true);
  const [useUntrustedContentHint, setUseUntrustedContentHint] = useState(true);
  const [includePlaylistInjection, setIncludePlaylistInjection] = useState(true);
  const [includeGuestbookInjection, setIncludeGuestbookInjection] = useState(true);
  const [showInlineDevInfo, setShowInlineDevInfo] = useState(true);

  // Smart Lights state
  const [lightsPower, setLightsPower] = useState('off');
  const [lightsBrightness, setLightsBrightness] = useState(0);

  useEffect(() => {
    document.body.classList.toggle('hide-dev-inline-info', !showInlineDevInfo);
  }, [showInlineDevInfo]);

  const playlistTracks = includePlaylistInjection
    ? INITIAL_PLAYLIST_TRACKS
    : INITIAL_PLAYLIST_TRACKS.filter((t) => !t.isPoisoned);

  const guestMessages = includeGuestbookInjection
    ? INITIAL_GUEST_MESSAGES
    : INITIAL_GUEST_MESSAGES.filter((m) => !m.isPoisoned);

  const setLivingRoomLightsState = (power, brightness) => {
    const nextPower = power === 'off' ? 'off' : 'on';
    const nextBrightness =
      typeof brightness === 'number'
        ? Math.max(0, Math.min(100, brightness))
        : nextPower === 'off'
        ? 0
        : 80;
    setLightsPower(nextPower);
    setLightsBrightness(nextBrightness);
    return { nextPower, nextBrightness };
  };

  const ensureMediaAndLightsVisible = () => {
    setDashboardComponents((prev) => {
      const next = [...prev];
      if (!next.includes('smart_lights_living_room')) {
        next.unshift('smart_lights_living_room');
      }
      if (!next.includes('media_player_living_room')) {
        next.unshift('media_player_living_room');
      }
      return next;
    });
  };

  const ensureLockWidgetVisible = () => {
    setDashboardComponents((prev) =>
      prev.includes('lock_front_door') ? prev : ['lock_front_door', ...prev]
    );
  };

  useWebMCPTools({
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
  });

  return (
    <DashboardContext.Provider
      value={{
        dashboardComponents,
        isAgentActive,
        isFrontDoorLocked,
        setIsFrontDoorLocked,
        lastLockStatusText,
        setLastLockStatusText,
        guestMessages,
        lightsPower,
        lightsBrightness,
        setLivingRoomLightsState,
        playlistTracks,
        useReadOnlyHint,
        setUseReadOnlyHint,
        useConsequentialHint,
        setUseConsequentialHint,
        useUntrustedContentHint,
        setUseUntrustedContentHint,
        includePlaylistInjection,
        setIncludePlaylistInjection,
        includeGuestbookInjection,
        setIncludeGuestbookInjection,
        showInlineDevInfo,
        setShowInlineDevInfo,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
