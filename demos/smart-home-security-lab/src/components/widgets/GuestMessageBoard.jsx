/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageSquare } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const GuestMessageBoard = ({ expanded = false }) => {
  const { guestMessages = [] } = useDashboard() || {};

  return (
    <div className={`card guestbook-card ${expanded ? 'guestbook-card--expanded' : ''}`}>
      <div className="guestbook-header">
        <div className="guestbook-title-group">
          <MessageSquare size={20} color="var(--accent)" />
          <h3>Digital Guest Message Board</h3>
          <div className="dev-inline-badge dev-inline-badge--corner">
            💀 Untrusted guest content
          </div>
        </div>
      </div>

      <div className={`guestbook-grid ${expanded ? 'guestbook-grid--expanded' : ''}`}>
        {guestMessages.map((msg) => (
          <div
            key={msg.id}
            className="sticky-note"
            style={{ transform: `rotate(${msg.rotate || '-1deg'})` }}
          >
            {msg.isPoisoned && (
              <div className="dev-inline-badge dev-inline-badge--track">
                💀 Prompt injection payload
              </div>
            )}

            <p className="sticky-note__text">"{msg.text}"</p>

            <div className="sticky-note__footer">
              <div>
                <div className="sticky-note__author">— {msg.author}</div>
                <div className="sticky-note__time">{msg.timestamp}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
