import { CommonModule } from '@angular/common';
import { Component, EventEmitter, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { WebMcpModelContext } from '../../models/webmcp.model';
import { CartService } from '../../services/cart.service';
import { UiService } from '../../services/ui.service';

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
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    this.registerCartTools();
  }

  ngOnDestroy() {
    this.unregisterCartTools();
  }

  private registerCartTools() {
    const modelContext = (navigator as any).modelContext as WebMcpModelContext | undefined;
    if (modelContext) {
      // 1. Remove from Cart Tool
      modelContext.registerTool({
        name: "remove_from_cart",
        description: "Removes a specific product from the shopping cart. Only available when the cart is open.",
        inputSchema: {
          type: "object",
          properties: {
            productId: {
              type: "string",
              description: "The unique ID of the product to remove."
            }
          },
          required: ["productId"]
        },
        execute: (params: { productId: string }) => {
          this.ngZone.run(() => {
            this.onRemove(params.productId);
          });
          return { success: true, message: "Item removed from cart." };
        }
      });

      // 2. Start Checkout Tool
      modelContext.registerTool({
        name: "start_checkout",
        description: "Processes the items in the cart and completes the order. Only available when the cart is open and in summary state.",
        execute: () => {
          if (this.checkoutState !== 'summary') {
            return { success: false, message: "Checkout already in progress or completed." };
          }
          this.ngZone.run(() => {
            this.onCheckout();
          });
          return { success: true, message: "Checkout started." };
        }
      });

      // 3. Confirm Order Tool
      modelContext.registerTool({
        name: "confirm_order",
        description: "Closes the checkout success screen. Only available after a successful checkout.",
        execute: () => {
          if (this.checkoutState !== 'success') {
            return { success: false, message: "Order not yet successful." };
          }
          this.ngZone.run(() => {
            this.onConfirmOrder();
          });
          return { success: true, message: "Order confirmed and closed." };
        }
      });
    }
  }

  private unregisterCartTools() {
    const modelContext = (navigator as any).modelContext as WebMcpModelContext | undefined;
    if (modelContext) {
      modelContext.unregisterTool("remove_from_cart");
      modelContext.unregisterTool("start_checkout");
      modelContext.unregisterTool("confirm_order");
    }
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
    setTimeout(() => {
      this.checkoutState = 'success';
      this.cartService.clearCart();
    }, 2000);
  }

  onConfirmOrder() {
    this.onClose();
  }
}
