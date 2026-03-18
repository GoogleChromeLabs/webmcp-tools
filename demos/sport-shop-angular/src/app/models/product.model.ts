/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image: string;
    size: 'child' | 'adult';
    tags?: string[];
}
