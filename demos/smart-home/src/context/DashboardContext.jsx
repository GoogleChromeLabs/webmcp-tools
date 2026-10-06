/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWebMCPTools } from './useWebMCPTools';
import {
  INITIAL_DASHBOARD_COMPONENTS,
  INITIAL_GUEST_MESSAGES,
  INITIAL_PLAYLIST_TRACKS,
} from './initialData';

const DashboardContext = createContext();

export function DashboardProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const agentTimerRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (agentTimerRef.current) {
        clearTimeout(agentTimerRef.current);
      }
    };
  }, []);

  const triggerAgentActivity = (durationMs = 2000) => {
    setIsAgentActive(true);
    if (agentTimerRef.current) {
      clearTimeout(agentTimerRef.current);
    }
    agentTimerRef.current = setTimeout(() => {
      setIsAgentActive(false);
      agentTimerRef.current = null;
    }, durationMs);
  };

  const playlistTracks = includePlaylistInjection
    ? INITIAL_PLAYLIST_TRACKS
    : INITIAL_PLAYLIST_TRACKS.filter((t) => !t.isPoisoned);

  const guestMessages = includeGuestbookInjection
    ? INITIAL_GUEST_MESSAGES
    : INITIAL_GUEST_MESSAGES.filter((m) => !m.isPoisoned);

  const setLivingRoomLightsState = (power, brightness) => {
    const clamped =
      typeof brightness === 'number' && !Number.isNaN(brightness)
        ? Math.max(0, Math.min(100, brightness))
        : undefined;
    const nextPower = power === 'off' || clamped === 0 ? 'off' : 'on';
    const nextBrightness = nextPower === 'off' ? 0 : (clamped ?? 80);
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
    if (location.pathname !== '/' && location.pathname !== '/lights') {
      navigate('/');
    }
  };

  const ensureLockWidgetVisible = () => {
    setDashboardComponents((prev) => {
      const next = [...prev];
      if (location.pathname === '/guestbook' && !next.includes('guest_message_board')) {
        next.unshift('guest_message_board');
      }
      if (!next.includes('lock_front_door')) {
        next.unshift('lock_front_door');
      }
      return next;
    });
    if (location.pathname !== '/' && location.pathname !== '/security') {
      navigate('/');
    }
  };

  const ensureDashboardVisible = () => {
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  useWebMCPTools({
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

// eslint-disable-next-line react-refresh/only-export-components
export const useDashboard = () => useContext(DashboardContext);
