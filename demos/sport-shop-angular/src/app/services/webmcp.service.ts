import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { ProductService } from './product.service';
import { CartService } from './cart.service';
import { UiService } from './ui.service';

import { WebMcpModelContext } from '../models/webmcp.model';

@Injectable({
  providedIn: 'root'
})
export class WebmcpService {
  constructor(
    private router: Router,
    private productService: ProductService,
    private cartService: CartService,
    private uiService: UiService,
    private ngZone: NgZone
  ) {
    this.registerTools();
  }

  private get modelContext(): WebMcpModelContext | undefined {
    return (window.navigator as any).modelContext;
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
      description: "Navigates to the product detail page for a given product ID.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "The unique ID of the product." }
        },
        required: ["productId"]
      },
      execute: async (params: { productId: string }) => {
        this.ngZone.run(() => {
          this.router.navigate(['/product', params.productId]);
        });
        return `Navigating to product: ${params.productId}`;
      }
    });

    // 2. Get Product Info Tool
    modelContext.registerTool({
      name: "get_product_info",
      description: "Returns detailed information about a product.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "The unique ID of the product." }
        },
        required: ["productId"]
      },
      execute: async (params: { productId: string }) => {
        const product = this.productService.getProductById(params.productId);
        return product ? JSON.stringify(product) : "Product not found.";
      }
    });

    // 3. Add to Cart Tool
    modelContext.registerTool({
      name: "add_to_cart",
      description: "Adds a product to the user's shopping cart.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "The unique ID of the product." }
        },
        required: ["productId"]
      },
      execute: async (params: { productId: string }) => {
        const product = this.productService.getProductById(params.productId);
        if (product) {
          return this.ngZone.run(() => this.cartService.addToCart(product));
        }
        return "Product not found.";
      }
    });

    // 4. Open Cart Tool
    modelContext.registerTool({
      name: "open_cart",
      description: "Opens the shopping cart modal to review items and proceed to checkout.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        this.ngZone.run(() => {
          this.uiService.openCart();
        });
        return { success: true, message: "Cart opened." };
      }
    });
  }
}
