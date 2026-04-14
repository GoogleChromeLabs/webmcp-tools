/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Slider from "rc-slider";
import "rc-slider/assets/index.css";

interface PriceRangeFilterProps {
  minPrice: number;
  maxPrice: number;
  maxBound: number;
  onPriceChange: (value: number[]) => void;
}

export default function PriceRangeFilter({
  minPrice,
  maxPrice,
  maxBound,
  onPriceChange,
}: PriceRangeFilterProps) {
  return (
    <div className="filter-group">
      <h3>Price</h3>
      <div className="slider-container">
        <Slider
          range
          min={0}
          max={maxBound}
          value={[minPrice, maxPrice]}
          onChange={(value) => onPriceChange(value as number[])}
        />
        <div className="slider-labels">
          <span>${minPrice}</span>
          <span>${maxPrice}</span>
        </div>
      </div>
    </div>
  );
}
