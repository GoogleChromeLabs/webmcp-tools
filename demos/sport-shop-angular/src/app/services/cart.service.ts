/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Injectable, signal, computed } from '@angular/core';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private cartSignal = signal<Product[]>([]);
  cart = this.cartSignal.asReadonly();
  totalPrice = computed(() => this.cartSignal().reduce((acc, item) => acc + item.price, 0));
  cartCount = computed(() => this.cartSignal().length);

  constructor() {
    const savedCart = localStorage.getItem('kinetic_cart');
    if (savedCart) {
      this.cartSignal.set(JSON.parse(savedCart));
    }
  }

  addToCart(product: Product) {
    this.cartSignal.update(cart => [...cart, product]);
    this.saveCart();
    return `Added ${product.name} to cart. Total items: ${this.cartSignal().length}`;
  }

  removeFromCart(productId: string) {
    this.cartSignal.update(cart => {
      const index = cart.findIndex(p => p.id === productId);
      if (index !== -1) {
        const newCart = [...cart];
        newCart.splice(index, 1);
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
