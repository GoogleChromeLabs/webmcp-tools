import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { Product } from './product';

export interface CartItem {
  product: Product;
  color: string;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private items: CartItem[] = [];
  
  // Observable string stream for toast notifications
  private cartUpdateSource = new Subject<string>();
  cartUpdate$ = this.cartUpdateSource.asObservable();

  // Observable for total count
  private totalCountSource = new BehaviorSubject<number>(0);
  totalCount$ = this.totalCountSource.asObservable();

  addToCart(product: Product, color: string, quantity: number = 1) {
    const existing = this.items.find(i => i.product.id === product.id && i.color === color);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ product, color, quantity });
    }
    
    this.totalCountSource.next(this.getTotalCount());
    
    // Announce to toast with +1
    this.cartUpdateSource.next(`+${quantity} ${color} ${product.name} added to cart`);
  }

  removeFromCart(productId: string, color: string) {
    const index = this.items.findIndex(i => i.product.id === productId && i.color === color);
    if (index > -1) {
      const item = this.items[index];
      if (item.quantity > 1) {
        item.quantity--;
      } else {
        this.items.splice(index, 1);
      }
      
      this.totalCountSource.next(this.getTotalCount());
      
      // Announce to toast with -1
      this.cartUpdateSource.next(`-1 ${color} ${item.product.name} removed from cart`);
    }
  }

  getTotalCount(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getCartItems() {
    return this.items;
  }
}
