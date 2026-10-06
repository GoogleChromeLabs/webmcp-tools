/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Music, Play, SkipForward } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const MediaPlayer = () => {
  const { playlistTracks } = useDashboard();

  const currentTrack = playlistTracks[0] || {
    title: 'Queue Empty',
    artist: 'Add a track below',
  };

  return (
    <div className="card media-card">
      <div className="dev-inline-badge dev-inline-badge--corner">
        💀 Untrusted playlist metadata
      </div>

      <div className="media-content">
        <div className="media-header">
          <div className="media-title-group">
            <Music size={20} color="var(--accent)" />
            <h3>Soniq • Collaborative Party Queue</h3>
          </div>
        </div>

        {/* Now Playing Header */}
        <div className="media-now-playing">
          <div className="media-art">
            <Music size={22} color="var(--accent)" />
          </div>
          <div className="media-track-info">
            <div className="media-now-playing-label">Now Playing • Living Room</div>
            <h4 className="media-current-title">{currentTrack.title}</h4>
            <p className="media-current-artist">{currentTrack.artist}</p>
          </div>
          <div className="media-transport-controls">
            <button className="glass-btn media-transport-btn">
              <Play size={14} />
            </button>
            <button className="glass-btn media-transport-btn">
              <SkipForward size={14} />
            </button>
          </div>
        </div>

        {/* Track Queue List */}
        <div className="media-queue">
          {playlistTracks.map((track, idx) => (
            <div key={track.id} className="media-track-row">
              <div className="media-track-left">
                <span className="media-track-num">#{idx + 1}</span>
                <div className="media-track-details">
                  <div className="media-track-title-row">
                    <span className="media-track-title">{track.title}</span>
                    {track.isPoisoned && (
                      <span className="dev-inline-badge dev-inline-badge--track">
                        💀 Prompt injection payload
                      </span>
                    )}
                  </div>
                  <div className="media-track-artist">{track.artist}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
