/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CartService } from './cart.service';
import { Product } from '../models/product.model';

describe('CartService', () => {
  let service: CartService;
  const mockProduct: Product = {
    id: 'test-1',
    name: 'Test Product',
    price: 100,
    category: 'BASKETBALL',
    description: 'Test',
    image: 'test.png',
    size: 'adult',
    tags: [],
    availability: 10
  };

  beforeEach(() => {
    // Mock localStorage
    const storage: Record<string, string> = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      clear: vi.fn(() => { Object.keys(storage).forEach(key => delete storage[key]); }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      length: 0,
      key: vi.fn((index: number) => null)
    };
    vi.stubGlobal('localStorage', localStorageMock);
    
    service = new CartService();
  });

  it('should add items to cart with default ship option', () => {
    service.addToCart(mockProduct);
    expect(service.getCartCount()).toBe(1);
    expect(service.cart()[0].deliveryOption).toBe('ship');
  });

  it('should remove items from cart', () => {
    service.addToCart(mockProduct);
    service.removeFromCart('test-1');
    expect(service.getCartCount()).toBe(0);
  });

  it('should update delivery option of cart item', () => {
    service.addToCart(mockProduct);
    service.updateDeliveryOption(0, 'pickup');
    expect(service.cart()[0].deliveryOption).toBe('pickup');
  });

  it('should clear the cart', () => {
    service.addToCart(mockProduct);
    service.addToCart(mockProduct);
    service.clearCart();
    expect(service.getCartCount()).toBe(0);
  });

  it('should persist cart to localStorage', () => {
    service.addToCart(mockProduct);
    const newService = new CartService();
    expect(newService.getCartCount()).toBe(1);
  });

  it('should not apply 3-for-2 promotion if less than 3 Basketball items are added', () => {
    service.addToCart(mockProduct);
    service.addToCart({ ...mockProduct, id: 'test-2', price: 80 });
    expect(service.subtotalPrice()).toBe(180);
    expect(service.discount()).toBe(0);
    expect(service.totalPrice()).toBe(180);
  });

  it('should apply 3-for-2 promotion (cheapest free) for exactly 3 Basketball items', () => {
    service.addToCart(mockProduct); // $100
    service.addToCart({ ...mockProduct, id: 'test-2', price: 80 }); // $80
    service.addToCart({ ...mockProduct, id: 'test-3', price: 50 }); // $50 (cheapest)
    
    expect(service.subtotalPrice()).toBe(230);
    expect(service.discount()).toBe(50); // cheapest item should be free
    expect(service.totalPrice()).toBe(180);
  });

  it('should apply 3-for-2 promotion (cheapest free) in groups of 3 when more items are added', () => {
    service.addToCart(mockProduct); // $100
    service.addToCart({ ...mockProduct, id: 'test-2', price: 80 }); // $80
    service.addToCart({ ...mockProduct, id: 'test-3', price: 50 }); // $50 (cheapest of group 1 -> free)
    service.addToCart({ ...mockProduct, id: 'test-4', price: 120 }); // $120
    service.addToCart({ ...mockProduct, id: 'test-5', price: 30 }); // $30
    
    // Sorted descending: 120, 100, 80, 50, 30
    // We have 5 items (1 group of 3, and 2 remaining). The discount should be applied only to the 3rd item in sorted order (which is index 2 -> $80).
    expect(service.subtotalPrice()).toBe(380);
    expect(service.discount()).toBe(80); 
    expect(service.totalPrice()).toBe(300);
  });
});
