/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CartService } from '../../services/cart.service';
import { UiService } from '../../services/ui.service';

import { findMatchingProduct } from '../../utils/product-matcher';

@Component({
  selector: 'app-cart-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cart-modal.component.html',
  styleUrls: ['./cart-modal.component.css']
})
export class CartModalComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();

  checkoutState: 'summary' | 'processing' | 'success' = 'summary';
  closing = false;

  constructor(
    public cartService: CartService,
    private uiService: UiService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.registerCartTools();
  }

  ngOnDestroy() {
    this.unregisterCartTools();
  }

  private cartToolController: AbortController | null = null;

  private registerCartTools() {
    const modelContext = navigator.modelContext;
    if (modelContext) {
      this.cartToolController = new AbortController();
      const signal = this.cartToolController.signal;

      // 1. Remove from Cart Tool
      modelContext.registerTool({
        name: "remove_from_cart",
        description: "Removes a specific product from the shopping cart. You can provide its index, exact productId, or productName. Only available when the cart is open.",
        inputSchema: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the item in the cart. (e.g. 0, first, second, 3rd etc.)"
            },
            productId: {
              type: "string",
              description: "The unique ID of the product to remove."
            },
            productName: {
              type: "string",
              description: "A part of the product name or keywords to match (e.g. 'training balls')."
            }
          }
        },
        execute: (params: any) => {
          const product = findMatchingProduct(this.cartService.cart(), params);
          if (!product) {
            return { success: false, message: "Product not found in the cart. Please provide a valid index, productId, or productName that matches the items in your cart." };
          }

          this.onRemove(product.id);
          return { success: true, message: `Removed '${product.name}' from cart.` };
        }
      }, { signal });

      // 2. Start Checkout Tool
      modelContext.registerTool({
        name: "start_checkout",
        description: "Processes the items in the cart and completes the order. Only available when the cart is open and in summary state.",
        execute: () => {
          if (this.checkoutState !== 'summary') {
            return { success: false, message: "Checkout already in progress or completed." };
          }
          this.onCheckout();
          return { success: true, message: "Checkout started." };
        }
      }, { signal });

      // 3. Confirm Order Tool
      modelContext.registerTool({
        name: "confirm_order",
        description: "Closes the checkout success screen. Only available after a successful checkout.",
        execute: () => {
          if (this.checkoutState !== 'success') {
            return { success: false, message: "Order not yet successful." };
          }
          this.onConfirmOrder();
          return { success: true, message: "Order confirmed and closed." };
        }
      }, { signal });
    }
  }

  private unregisterCartTools() {
    this.cartToolController?.abort();
  }

  onClose() {
    this.closing = true;
    setTimeout(() => {
      this.uiService.closeCart();
      this.close.emit(); // Keep for compatibility
    }, 500);
  }

  onRemove(productId: string) {
    this.cartService.removeFromCart(productId);
  }

  onCheckout() {
    this.checkoutState = 'processing';
    this.cdr.detectChanges(); // Sync state immediately

    setTimeout(() => {
      this.checkoutState = 'success';
      this.cartService.clearCart();
      this.cdr.detectChanges(); // Sync state immediately
    }, 2000);
  }

  onConfirmOrder() {
    this.onClose();
  }
}
