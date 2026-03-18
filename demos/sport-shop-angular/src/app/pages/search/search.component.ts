/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params } from '@angular/router';
import { AiSidebarComponent } from '../../components/ai-sidebar/ai-sidebar.component';
import { ProductCardComponent } from '../../components/product-card/product-card.component';
import { Product } from '../../models/product.model';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';

import { findMatchingProduct } from '../../utils/product-matcher';

@Component({
  selector: 'app-search',
  imports: [CommonModule, ProductCardComponent, AiSidebarComponent, ReactiveFormsModule],
  templateUrl: './search.component.html',
})
export class SearchComponent implements OnInit, OnDestroy {
  query: string = '';
  filteredProducts: Product[] = [];
  aiMessage: string = "I'm here to help you find the perfect gear. Ask me anything about our products!";

  priceControl = new FormControl('all');
  priceFilters = [
    { label: 'All Prices', value: 'all' },
    { label: 'Under $50', value: '0-49.99' },
    { label: '$50 - $100', value: '50-99.99' },
    { label: '$100+', value: '100+' }
  ];

  private currentParams: Params = {};

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService,
    private cdr: ChangeDetectorRef
  ) {
    this.priceControl.valueChanges.subscribe(value => {
      console.log('Search: priceControl value changed to:', value);
      this.applyFilters();
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      // Only reset filter to 'all' if the search query itself has changed
      if (params['q'] !== this.currentParams['q']) {
        this.priceControl.setValue('all', { emitEvent: false });
      }
      this.currentParams = params;
      this.applyFilters();
    });

    this.registerSearchTools();
  }
  ngOnDestroy() {
    this.unregisterSearchTools();
  }

  private registerSearchTools() {
    const modelContext = navigator.modelContext;
    if (modelContext) {
      // 1. Refine Search Tool
      modelContext.registerTool({
        name: "refine_search",
        description: "Refine the current search results by applying a price filter.",
        inputSchema: {
          type: "object",
          properties: {
            priceRange: {
              type: "string",
              description: "The price range to filter by.",
              enum: ["all", "0-49.99", "50-99.99", "100+"]
            }
          },
          required: ["priceRange"]
        },
        execute: (params: any) => {
          const success = this.setPriceRange(params.priceRange);
          if (success) {
            return { success: true, message: `Filtered results by ${params.priceRange}` };
          } else {
            return { success: false, message: `Invalid price range '${params.priceRange}'. Must be one of: 'all', '0-49.99', '50-99.99', '100+'` };
          }
        }
      });

      // 2. Add Search Result to Cart Tool
      modelContext.registerTool({
        name: "add_search_result_to_cart",
        description: "Adds a product from the current search results to the shopping cart. You can provide its index (e.g. 0, first, second, 3rd etc.), exact productId, or productName.",
        inputSchema: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The zero-based index of the item in the search results."
            },
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
          const product = findMatchingProduct(this.filteredProducts, params);

          if (!product) {
            return { success: false, message: "Product not found in current search results. Please provide a valid index, productId, or productName that matches the visible results." };
          }

          this.cartService.addToCart(product);
          return { success: true, message: `Added '${product.name}' to cart.` };
        }
      });
    }
  }

  private unregisterSearchTools() {
    const modelContext = navigator.modelContext;
    if (modelContext) {
      modelContext.unregisterTool("refine_search");
      modelContext.unregisterTool("add_search_result_to_cart");
    }
  }


  setPriceRange(range: string): boolean {
    const validRanges = ['all', '0-49.99', '50-99.99', '100+'];
    if (validRanges.includes(range)) {
      this.priceControl.setValue(range);
      return true;
    }
    return false;
  }

  private applyFilters() {
    this.query = this.currentParams['q'] || '';
    const category = this.currentParams['category'];
    const size = this.currentParams['size'];
    const activePriceRange = this.priceControl.value;

    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    if (activePriceRange === '0-49.99') {
      minPrice = 0;
      maxPrice = 49.99;
    } else if (activePriceRange === '50-99.99') {
      minPrice = 50;
      maxPrice = 99.99;
    } else if (activePriceRange === '100+') {
      minPrice = 100;
      maxPrice = 10000;
    }

    this.filteredProducts = this.productService.searchProducts(
      this.query,
      category,
      minPrice,
      maxPrice,
      size
    );
    this.updateAiMessage();

    // Explicitly trigger change detection to ensure UI refresh
    this.cdr.detectChanges();
  }

  private updateAiMessage() {
    if (this.query) {
      this.aiMessage = `I've found ${this.filteredProducts.length} items related to "${this.query}". You can further refine these using the price filters above!`;
    }
  }
}
