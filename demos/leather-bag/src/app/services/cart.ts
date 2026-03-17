import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
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

  addToCart(product: Product, color: string, quantity: number = 1) {
    const existing = this.items.find(i => i.product.id === product.id && i.color === color);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ product, color, quantity });
    }
    
    // Announce to toast
    this.cartUpdateSource.next(`${color} ${product.name} added to cart`);
  }

  getCartItems() {
    return this.items;
  }
}
