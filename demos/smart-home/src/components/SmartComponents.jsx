/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './widgets/widgets.css';
import { LockFrontDoor } from './widgets/LockFrontDoor';
import { SmartLightsLivingRoom } from './widgets/SmartLightsLivingRoom';
import { MediaPlayer } from './widgets/MediaPlayer';
import { GuestMessageBoard } from './widgets/GuestMessageBoard';
import {
  AirQuality,
  AlarmPanel,
  CameraFrontDoor,
  EnergySummary,
  ThermostatControl,
  Weather,
} from './widgets/StaticWidgets';

export {
  AirQuality,
  AlarmPanel,
  CameraFrontDoor,
  EnergySummary,
  GuestMessageBoard,
  LockFrontDoor,
  MediaPlayer,
  SmartLightsLivingRoom,
  ThermostatControl,
  Weather,
};

// Component Map for dynamic rendering by ID
export const COMPONENT_MAP = {
  'weather_widget': Weather,
  'thermostat_control': ThermostatControl,
  'camera_front_door': CameraFrontDoor,
  'lock_front_door': LockFrontDoor,
  'guest_message_board': GuestMessageBoard,
  'smart_lights_living_room': SmartLightsLivingRoom,
  'media_player_living_room': MediaPlayer,
  'alarm_panel': AlarmPanel,
  'air_quality_sensor': AirQuality,
  'energy_summary': EnergySummary,
};
