import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartItem, CartService } from '../../services/cart';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
})
export class CartComponent {
  private readonly cartService = inject(CartService);

  protected readonly items = this.cartService.items;
  protected readonly subtotal = computed(() =>
    this.items().reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );

  protected readonly shipping = computed(() => (this.subtotal() > 500 ? 0 : 50));
  protected readonly total = computed(() => this.subtotal() + this.shipping());

  incrementQuantity(item: CartItem) {
    this.cartService.addToCart(item.product, item.color, 1);
  }

  decrementQuantity(item: CartItem) {
    if (item.quantity > 1) {
      this.cartService.removeFromCart(item.product.id, item.color);
    }
  }

  removeItem(item: CartItem) {
    // Call removeFromCart in a loop to remove all quantities
    const qty = item.quantity;
    for (let i = 0; i < qty; i++) {
      this.cartService.removeFromCart(item.product.id, item.color);
    }
  }

  checkout() {
    this.cartService.clearCart('Thank you for shopping with us!');
  }
}
