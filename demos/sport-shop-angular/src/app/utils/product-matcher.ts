/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../models/product.model';

export function findMatchingProduct(products: readonly Product[], params: any): Product | undefined {
  if (typeof params.index === 'number') {
    return products[params.index];
  } else if (params.productId) {
    return products.find(p => p.id === params.productId);
  } else if (params.productName) {
    const searchTerms = params.productName.toLowerCase().trim().split(/\s+/);
    return products.find(p => {
      const nameLower = p.name.toLowerCase();
      return searchTerms.every((term: string) => nameLower.includes(term));
    });
  }
  return undefined;
}
