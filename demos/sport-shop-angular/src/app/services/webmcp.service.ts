/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from './cart.service';
import { ProductService } from './product.service';
import { UiService } from './ui.service';

import { findMatchingProduct } from '../utils/product-matcher';

@Injectable({
  providedIn: 'root'
})
export class WebmcpService {
  constructor(
    private router: Router,
    private productService: ProductService,
    private cartService: CartService,
    private uiService: UiService
  ) {
    this.registerTools();
  }

  private get modelContext(): ModelContext | undefined {
    return navigator.modelContext;
  }

  private registerTools() {
    const modelContext = this.modelContext;
    if (!modelContext) {
      console.warn('modelContext is not defined on navigator. WebMCP tools will not be registered.');
      return;
    }

    // 1. View Product Tool
    modelContext.registerTool({
      name: "view_product",
      description: "Navigates to the product detail page for a given product. You can provide its exact productId, or productName.",
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "The unique ID of the product."
          },
          productName: {
            type: "string",
            description: "A part of the product name or keywords to match (e.g. 'training balls')."
          }
        }
      },
      execute: (params: any) => {
        const product = findMatchingProduct(this.productService.getProducts(), params);
        if (!product) {
          return { success: false, message: "Product not found. Please provide a valid productId, or productName." };
        }

        this.router.navigate(['/product', product.id]);
        return { success: true, message: `Navigating to product: ${product.name}` };
      }
    });

    // 2. Get Product Info Tool
    modelContext.registerTool({
      name: "get_product_info",
      description: "Returns detailed information about a product. You can provide its exact productId, or productName.",
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "The unique ID of the product."
          },
          productName: {
            type: "string",
            description: "A part of the product name or keywords to match (e.g. 'training balls')."
          }
        }
      },
      execute: (params: any) => {
        const product = findMatchingProduct(this.productService.getProducts(), params);
        if (!product) {
          return { success: false, message: "Product not found. Please provide a valid productId, or productName." };
        }
        return { success: true, product };
      }
    });

    // 3. Open Cart Tool
    modelContext.registerTool({
      name: "open_cart",
      description: "Opens the shopping cart modal to review items and proceed to checkout.",
      execute: () => {
        this.uiService.openCart();
        return { success: true, message: "Cart opened." };
      }
    });
  }
}
