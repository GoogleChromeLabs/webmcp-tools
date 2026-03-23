/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Amenity } from '../../data/hotels';
import { clsx } from 'clsx';

interface AmenityBadgeProps {
  amenity: Amenity;
  className?: string;
  showIcon?: boolean;
}

export function AmenityBadge({ amenity, className, showIcon = true }: AmenityBadgeProps) {
  return (
    <div className={clsx("flex items-center gap-2 text-sm text-on-surface", className)}>
      {showIcon && (
        <span 
          className="material-symbols-outlined text-on-primary-container" 
          aria-hidden="true"
        >
          {amenity.icon}
        </span>
      )}
      <span>{amenity.label}</span>
      <span className="sr-only">({amenity.filterKey})</span>
    </div>
  );
}

interface FilterBadgeProps {
  label: string;
  onRemove?: () => void;
  className?: string;
}

export function FilterBadge({ label, onRemove, className }: FilterBadgeProps) {
  return (
    <div className={clsx(
      "bg-surface-container-lowest border border-outline-variant/20 px-4 py-2 flex items-center gap-2 rounded-full text-xs font-medium transition-all group hover:border-primary/30",
      className
    )}>
      <span className="text-on-surface-variant group-hover:text-primary transition-colors">{label}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="material-symbols-outlined text-[14px] cursor-pointer text-outline hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-50 border-none bg-transparent flex"
          aria-label={`Remove filter ${label}`}
        >
          close
        </button>
      )}
    </div>
  );
}
