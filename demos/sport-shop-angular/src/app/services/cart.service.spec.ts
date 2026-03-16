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
    tags: []
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

  it('should add items to cart', () => {
    service.addToCart(mockProduct);
    expect(service.getCartCount()).toBe(1);
  });

  it('should remove items from cart', () => {
    service.addToCart(mockProduct);
    service.removeFromCart('test-1');
    expect(service.getCartCount()).toBe(0);
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
});
