/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from './product.model';

export interface CartItem {
    product: Product;
    deliveryOption: 'ship' | 'pickup';
}
