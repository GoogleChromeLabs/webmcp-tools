import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CartService, CartItem } from '../../services/cart';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
})
export class CartComponent implements OnInit {
  cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);
  
  items: CartItem[] = [];
  subtotal = 0;
  shipping = 0;
  total = 0;

  ngOnInit() {
    this.items = this.cartService.getCartItems();
    this.calculateTotals();
  }

  incrementQuantity(item: CartItem) {
    this.cartService.addToCart(item.product, item.color, 1);
    this.calculateTotals();
    this.cdr.detectChanges();
  }

  decrementQuantity(item: CartItem) {
    if (item.quantity > 1) {
      this.cartService.removeFromCart(item.product.id, item.color);
      this.calculateTotals();
      this.cdr.detectChanges();
    }
  }

  removeItem(item: CartItem) {
    // Call removeFromCart in a loop to remove all quantities
    const qty = item.quantity;
    for (let i = 0; i < qty; i++) {
      this.cartService.removeFromCart(item.product.id, item.color);
    }
    this.calculateTotals();
    this.cdr.detectChanges();
  }

  calculateTotals() {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    this.shipping = this.subtotal > 500 ? 0 : 50;
    this.total = this.subtotal + this.shipping;
  }
}
