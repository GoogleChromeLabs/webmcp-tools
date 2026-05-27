/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Injectable, signal, computed } from '@angular/core';
import { Product } from '../models/product.model';
import { CartItem } from '../models/cart-item.model';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private cartSignal = signal<CartItem[]>([]);
  cart = this.cartSignal.asReadonly();
  
  subtotalPrice = computed(() => this.cartSignal().reduce((acc, item) => acc + item.product.price, 0));
  
  discount = computed(() => {
    const basketballItems = this.cartSignal().filter(item => item.product.category === 'BASKETBALL');
    if (basketballItems.length < 3) {
      return 0;
    }
    // Sort prices descending to apply discount to cheapest in groups of 3
    const prices = basketballItems.map(item => item.product.price).sort((a, b) => b - a);
    let totalDiscount = 0;
    for (let i = 2; i < prices.length; i += 3) {
      totalDiscount += prices[i];
    }
    return totalDiscount;
  });

  totalPrice = computed(() => this.subtotalPrice() - this.discount());
  cartCount = computed(() => this.cartSignal().length);

  constructor() {
    const savedCart = localStorage.getItem('kinetic_cart');
    if (savedCart) {
      this.cartSignal.set(JSON.parse(savedCart));
    }
  }

  addToCart(product: Product) {
    this.cartSignal.update(cart => [...cart, { product, deliveryOption: 'ship' }]);
    this.saveCart();
    return `Added ${product.name} to cart. Total items: ${this.cartSignal().length}`;
  }

  removeFromCart(productId: string) {
    this.cartSignal.update(cart => {
      const index = cart.findIndex(item => item.product.id === productId);
      if (index !== -1) {
        const newCart = [...cart];
        newCart.splice(index, 1);
        return newCart;
      }
      return cart;
    });
    this.saveCart();
  }

  updateDeliveryOption(index: number, option: 'ship' | 'pickup') {
    this.cartSignal.update(cart => {
      if (index >= 0 && index < cart.length) {
        const newCart = [...cart];
        newCart[index] = { ...newCart[index], deliveryOption: option };
        return newCart;
      }
      return cart;
    });
    this.saveCart();
  }

  clearCart() {
    this.cartSignal.set([]);
    this.saveCart();
  }

  getCartCount(): number {
    return this.cartCount();
  }

  private saveCart() {
    localStorage.setItem('kinetic_cart', JSON.stringify(this.cartSignal()));
  }
}
