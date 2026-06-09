import { computed, Service, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Product } from './product';

export interface CartItem {
  product: Product;
  color: string;
  quantity: number;
}

@Service()
export class CartService {
  private _items = signal<CartItem[]>([]);
  public readonly items = this._items.asReadonly();

  // Observable string stream for toast notifications
  private cartUpdateSource = new Subject<string>();
  cartUpdate$ = this.cartUpdateSource.asObservable();

  totalCount = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));

  addToCart(product: Product, color: string, quantity: number = 1) {
    const existing = this.items().find((i) => i.product.id === product.id && i.color === color);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this._items.update((items) => [...items, { product, color, quantity }]);
    }

    // Announce to toast with +1
    this.cartUpdateSource.next(`+${quantity} ${color} ${product.name} added to cart`);
  }

  removeFromCart(productId: string, color: string) {
    const index = this.items().findIndex((i) => i.product.id === productId && i.color === color);
    if (index > -1) {
      const item = this.items()[index];
      if (item.quantity > 1) {
        item.quantity--;
      } else {
        this.items().splice(index, 1);
      }

      // Announce to toast with -1
      this.cartUpdateSource.next(`-1 ${color} ${item.product.name} removed from cart`);
    }
  }

  clearCart(message?: string) {
    this._items.set([]);
    if (message) {
      this.cartUpdateSource.next(message);
    }
  }
}
