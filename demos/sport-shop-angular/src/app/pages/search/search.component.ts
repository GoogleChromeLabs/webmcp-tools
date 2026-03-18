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
          this.setPriceRange(params.priceRange);
          return { success: true, message: `Filtered results by ${params.priceRange}` };
        }
      });

      // 2. Get Current Results Tool
      modelContext.registerTool({
        name: "get_current_results",
        description: "Returns a list of products currently visible in the search results, including their IDs, names, and prices. Use this to find IDs for adding items to the cart.",
        execute: () => {
          const summary = this.filteredProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category
          }));
          return {
            success: true,
            count: summary.length,
            results: summary
          };
        }
      });
    }
  }

  private unregisterSearchTools() {
    const modelContext = navigator.modelContext;
    if (modelContext) {
      modelContext.unregisterTool("refine_search");
      modelContext.unregisterTool("get_current_results");
    }
  }


  setPriceRange(range: string) {
    this.priceControl.setValue(range);
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
