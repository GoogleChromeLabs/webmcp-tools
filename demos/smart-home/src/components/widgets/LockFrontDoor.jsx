/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lock, Unlock } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const LockFrontDoor = () => {
  const {
    isFrontDoorLocked,
    setIsFrontDoorLocked,
    lastLockStatusText,
    setLastLockStatusText,
  } = useDashboard();

  const handleLock = () => {
    setIsFrontDoorLocked(true);
    setLastLockStatusText('Locked • Just now');
  };

  const handleUnlock = () => {
    setIsFrontDoorLocked(false);
    setLastLockStatusText('Unlocked • Just now');
  };

  return (
    <div className="card">
      <div className="widget-header">
        <div className="widget-title-row">
          <h3>Front Door Lock</h3>
          <span
            className={`status-pill ${
              isFrontDoorLocked ? 'status-pill--green' : 'status-pill--red'
            }`}
          >
            {isFrontDoorLocked ? 'LOCKED' : 'UNLOCKED'}
          </span>
        </div>
        {isFrontDoorLocked ? (
          <Lock size={24} color="#4ade80" />
        ) : (
          <Unlock size={24} color="#f87171" className="lock-unlock-icon" />
        )}
      </div>
      <div className="widget-grid-2col">
        <button
          className={`glass-btn glass-btn--center ${isFrontDoorLocked ? 'active' : ''}`}
          onClick={handleLock}
        >
          Lock
        </button>
        <button
          className={`glass-btn glass-btn--center ${!isFrontDoorLocked ? 'active' : ''}`}
          onClick={handleUnlock}
        >
          Unlock
        </button>
      </div>
      <p className="lock-status-text">{lastLockStatusText}</p>
    </div>
  );
};
