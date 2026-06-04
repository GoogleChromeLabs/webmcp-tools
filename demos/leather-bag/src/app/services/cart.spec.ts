import { describe, beforeEach, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CartService } from './cart';

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
