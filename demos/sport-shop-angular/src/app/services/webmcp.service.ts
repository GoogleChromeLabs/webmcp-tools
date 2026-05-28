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
    return document.modelContext || navigator.modelContext;
  }

  private registerTools() {
    const modelContext = this.modelContext;
    if (!modelContext) {
      console.warn('modelContext is not defined. WebMCP tools will not be registered.');
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

    // 4. Search Product Tool
    modelContext.registerTool({
      name: "search_product",
      description: "Search for products based on the query.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term for products (e.g. 'soccer boots', 'running gear')."
          },
          category: {
            type: "string",
            description: "The product category to browse.",
            enum: ['ALL', 'BASKETBALL', 'SOCCER', 'BASEBALL', 'RUNNING']
          },
          size: {
            type: "string",
            description: "Product size. Use 'child' for kids/children, 'adult' for adults.",
            enum: ['ALL', 'adult', 'child']
          }
        }
      },
      execute: (params: any) => {
        const searchParams: any = {
          q: (params && params.query) ? params.query : ''
        };
        if (params && params.category && params.category !== 'ALL') searchParams.category = params.category;
        if (params && params.size && params.size !== 'ALL') searchParams.size = params.size;

        this.router.navigate(['/search'], { queryParams: searchParams });
        return { success: true, message: `Navigating to search results for ${JSON.stringify(searchParams)}` };
      }
    });

    // 5. Get Store Promos and Rules Tool
    modelContext.registerTool({
      name: "get_store_promos_and_rules",
      description: "Returns active promotional campaigns, eligibility requirements, and general store rules (e.g., local pickup categories).",
      execute: () => {
        return {
          success: true,
          promotions: [
            {
              id: "basketball_3_for_2",
              name: "Basketball 3-for-2 Promo",
              description: "Buy 3 Basketball items, get the cheapest one for free. Discount is applied automatically at checkout.",
              eligibleCategories: ["BASKETBALL"]
            }
          ],
          storeRules: {
            localPickupEligibility: {
              description: "Only Soccer and Running gear are eligible for local pickup. Other items are shipping only.",
              eligibleCategories: ["SOCCER", "RUNNING"],
              ineligibleCategories: ["BASKETBALL", "BASEBALL"]
            }
          }
        };
      }
    });
  }
}
