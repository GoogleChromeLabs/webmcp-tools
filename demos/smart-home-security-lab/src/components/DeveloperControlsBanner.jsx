/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';

export function DeveloperControlsBanner() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    useReadOnlyHint = true,
    setUseReadOnlyHint,
    useConsequentialHint = true,
    setUseConsequentialHint,
    useUntrustedContentHint = true,
    setUseUntrustedContentHint,
    includePlaylistInjection = true,
    setIncludePlaylistInjection,
    includeGuestbookInjection = true,
    setIncludeGuestbookInjection,
    showInlineDevInfo = true,
    setShowInlineDevInfo,
  } = useDashboard() || {};

  return (
    <header className="dev-controls-banner" role="region" aria-label="Developer controls">
      <button
        type="button"
        className="dev-controls-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <h2>Developer controls</h2>
        {isExpanded ? (
          <ChevronDown size={15} color="limegreen" />
        ) : (
          <ChevronRight size={15} color="limegreen" />
        )}
      </button>

      {isExpanded && (
        <div className="dev-controls-body">
          <div className="dev-controls-category">
            <h3 className="dev-category-title">Hints</h3>
            <div className="dev-category-items">
              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={useReadOnlyHint}
                  onChange={(e) => setUseReadOnlyHint?.(e.target.checked)}
                />
                <span>
                  Use <code>readOnlyHint: FALSE</code> where relevant
                </span>
              </label>

              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={useConsequentialHint}
                  onChange={(e) => setUseConsequentialHint?.(e.target.checked)}
                />
                <span>
                  Use <code>consequentialHint: TRUE</code> where relevant
                </span>
              </label>

              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={useUntrustedContentHint}
                  onChange={(e) => setUseUntrustedContentHint?.(e.target.checked)}
                />
                <span>
                  Use <code>untrustedContentHint: TRUE</code> where relevant
                </span>
              </label>
            </div>
          </div>

          <div className="dev-controls-category">
            <h3 className="dev-category-title">Prompt injection</h3>
            <div className="dev-category-items">
              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={includePlaylistInjection}
                  onChange={(e) => setIncludePlaylistInjection?.(e.target.checked)}
                />
                <span>Include prompt injection in playlist</span>
              </label>

              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={includeGuestbookInjection}
                  onChange={(e) => setIncludeGuestbookInjection?.(e.target.checked)}
                />
                <span>Include prompt injection in guest message board</span>
              </label>
            </div>
          </div>

          <div className="dev-controls-category">
            <h3 className="dev-category-title">UI</h3>
            <div className="dev-category-items">
              <label className="dev-checkbox-item">
                <input
                  type="checkbox"
                  checked={showInlineDevInfo}
                  onChange={(e) => setShowInlineDevInfo?.(e.target.checked)}
                />
                <span>Display inline developer info</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
