/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
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
    const modelContext = document.modelContext || navigator.modelContext;
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
          const products = this.cartService.cart().map(item => item.product);
          const product = findMatchingProduct(products, params);
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

      // 4. Update Delivery Option Tool
      modelContext.registerTool({
        name: "update_cart_delivery_option",
        description: "Updates the delivery option (ship or pickup) for an item in the cart. Only available when the cart is open.",
        inputSchema: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the item in the cart (0-based)."
            },
            productId: {
              type: "string",
              description: "The unique ID of the product in the cart."
            },
            option: {
              type: "string",
              description: "The delivery option choice: 'ship' or 'pickup'.",
              enum: ["ship", "pickup"]
            }
          },
          required: ["option"]
        },
        execute: (params: any) => {
          let idx = params.index;
          if (typeof idx !== 'number' && params.productId) {
            idx = this.cartService.cart().findIndex(item => item.product.id === params.productId);
          }
          if (typeof idx !== 'number' || idx < 0 || idx >= this.cartService.cart().length) {
            return { success: false, message: "Item not found in cart." };
          }

          const cartItem = this.cartService.cart()[idx];
          const isEligible = cartItem.product.category === 'SOCCER' || cartItem.product.category === 'RUNNING';
          if (params.option === 'pickup' && !isEligible) {
            return { success: false, message: `Product '${cartItem.product.name}' is not eligible for local pickup. Only Soccer and Running gear is eligible.` };
          }

          this.cartService.updateDeliveryOption(idx, params.option);
          return { success: true, message: `Updated delivery option for '${cartItem.product.name}' to ${params.option}.` };
        }
      }, { signal });

      // 5. Get Cart Tool
      modelContext.registerTool({
        name: "get_cart",
        description: "Returns the list of items in the cart, their delivery options, subtotal, applied discounts, and final total price.",
        execute: () => {
          return {
            success: true,
            items: this.cartService.cart().map((item, idx) => ({
              index: idx,
              productId: item.product.id,
              name: item.product.name,
              price: item.product.price,
              category: item.product.category,
              deliveryOption: item.deliveryOption,
              eligibleForPickup: item.product.category === 'SOCCER' || item.product.category === 'RUNNING'
            })),
            subtotal: this.cartService.subtotalPrice(),
            discount: this.cartService.discount(),
            totalPrice: this.cartService.totalPrice()
          };
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

  updateDeliveryOption(index: number, event: Event) {
    const select = event.target as HTMLSelectElement;
    this.cartService.updateDeliveryOption(index, select.value as 'ship' | 'pickup');
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
